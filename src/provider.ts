/**
 * OpenAI AI Provider
 *
 * Implementation of the AIProvider interface for OpenAI using the Responses API.
 */

import type {
  ExtensionContext,
  AIProvider,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,
  ToolDefinition,
} from '@stina/extension-api/runtime'
import {
  DEFAULT_OPENAI_URL,
  DEFAULT_MODEL,
  PROVIDER_ID,
  PROVIDER_NAME,
  MODEL_DISPLAY_NAMES,
  OPENAI_CODEX_BASE_URL,
  STINA_ORIGINATOR,
} from './constants.js'
import type {
  CodexModelsResponse,
  OpenAIModelsResponse,
  OpenAIResponsesRequest,
  OpenAIInputItem,
  OpenAIInputMessage,
  OpenAIToolResultMessage,
  OpenAIFunctionCallInput,
  OpenAITool,
  OpenAIStreamEvent,
  OpenAIReasoningConfig,
} from './types.js'
import type { TokenManager } from './oauth/token-manager.js'
import { localizedStringToString, generateToolCallId } from './utils.js'

const EXTENSION_VERSION = '1.0.0'

/**
 * Fallback model list used when the Codex `/models` endpoint can't be reached
 * (network error, 404 on a future API change, etc.). The live endpoint is the
 * primary source — this is purely a safety net so the model picker is never
 * empty in OAuth mode.
 */
const CODEX_FALLBACK_MODELS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
  { id: 'gpt-5-codex', name: 'GPT-5 Codex' },
]

interface RequestConfig {
  baseUrl: string
  headers: Record<string, string>
}

interface RequestConfigError {
  error: string
}

function isAuthMethodOAuth(settings: Record<string, unknown> | undefined): boolean {
  return settings?.authMethod === 'chatgpt_oauth'
}

/**
 * Resolves base URL and request headers for either auth mode.
 *
 * In API-key mode this is the standard OpenAI API. In OAuth mode the request
 * must be routed to the Codex backend with a ChatGPT-Account-Id header — the
 * standard /v1 endpoint rejects ChatGPT subscription tokens.
 */
async function buildRequestConfig(
  settings: Record<string, unknown> | undefined,
  tokenManager: TokenManager | null,
): Promise<RequestConfig | RequestConfigError> {
  if (isAuthMethodOAuth(settings)) {
    if (!tokenManager) {
      return { error: 'OAuth is not available — secrets API missing.' }
    }
    const token = await tokenManager.getAccessToken()
    if (!token) {
      return {
        error: 'Not connected to ChatGPT. Please use the Connect button in extension settings.',
      }
    }
    const identity = await tokenManager.getIdentity()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      originator: STINA_ORIGINATOR,
      version: EXTENSION_VERSION,
      'User-Agent': `${STINA_ORIGINATOR}/${EXTENSION_VERSION}`,
    }
    if (identity?.accountId) {
      headers['ChatGPT-Account-Id'] = identity.accountId
    }
    return {
      baseUrl: OPENAI_CODEX_BASE_URL,
      headers,
    }
  }

  const apiKey = settings?.apiKey as string | undefined
  if (!apiKey) {
    return { error: 'No API key configured for OpenAI' }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  }
  const organizationId = settings?.organizationId as string | undefined
  if (organizationId) {
    headers['OpenAI-Organization'] = organizationId
  }
  return {
    baseUrl: (settings?.baseUrl as string) || DEFAULT_OPENAI_URL,
    headers,
  }
}

/**
 * Fetches the model catalog from the Codex backend (`/models`). The endpoint
 * uses a subscription token in the same way as `/responses`. Falls back to a
 * small curated list on any error so the picker is never empty.
 */
async function fetchCodexModels(
  context: ExtensionContext,
  tokenManager: TokenManager,
): Promise<ModelInfo[]> {
  const token = await tokenManager.getAccessToken()
  if (!token) {
    context.log.warn('Codex models requested but no access token available')
    return CODEX_FALLBACK_MODELS.map((m) => ({ id: m.id, name: m.name }))
  }

  const identity = await tokenManager.getIdentity()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    originator: STINA_ORIGINATOR,
    version: EXTENSION_VERSION,
    'User-Agent': `${STINA_ORIGINATOR}/${EXTENSION_VERSION}`,
  }
  if (identity?.accountId) {
    headers['ChatGPT-Account-Id'] = identity.accountId
  }

  // Codex parses client_version as semver (major.minor.patch only) and rejects
  // anything else with HTTP 400 "Invalid client_version format".
  const url = `${OPENAI_CODEX_BASE_URL}/models?client_version=${encodeURIComponent(EXTENSION_VERSION)}`

  try {
    const response = await context.network!.fetch(url, { headers })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      context.log.warn('Codex /models returned non-OK; using fallback list', {
        status: response.status,
        body: body.slice(0, 256),
      })
      return CODEX_FALLBACK_MODELS.map((m) => ({ id: m.id, name: m.name }))
    }
    const data = (await response.json()) as CodexModelsResponse
    const models = (data.models ?? [])
      .slice()
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((m) => ({
        id: m.slug,
        name: m.display_name || m.slug,
        description: m.description,
      }))
    if (models.length === 0) {
      context.log.warn('Codex /models returned an empty list; using fallback')
      return CODEX_FALLBACK_MODELS.map((m) => ({ id: m.id, name: m.name }))
    }
    context.log.info('Fetched Codex models', { count: models.length })
    return models
  } catch (error) {
    context.log.warn('Codex /models request failed; using fallback list', {
      error: error instanceof Error ? error.message : String(error),
    })
    return CODEX_FALLBACK_MODELS.map((m) => ({ id: m.id, name: m.name }))
  }
}

/**
 * Creates the OpenAI AI provider
 */
export function createOpenAIProvider(context: ExtensionContext, tokenManager: TokenManager | null): AIProvider {
  return {
    id: PROVIDER_ID,
    name: PROVIDER_NAME,

    getModels: (options?: GetModelsOptions) => fetchModels(context, tokenManager, options),
    chat: (messages: ChatMessage[], options: ChatOptions) => streamChat(context, tokenManager, messages, options),
  }
}

/**
 * Fetches available models.
 *
 * In API-key mode the standard OpenAI /models endpoint is queried and filtered
 * to chat models. In OAuth mode the Codex backend exposes its own /models
 * listing (different shape — `slug` + `display_name`) which we query with the
 * subscription token; if that fails we fall back to a small curated list.
 */
async function fetchModels(
  context: ExtensionContext,
  tokenManager: TokenManager | null,
  options?: GetModelsOptions
): Promise<ModelInfo[]> {
  if (isAuthMethodOAuth(options?.settings)) {
    if (!tokenManager || !(await tokenManager.isConnected())) {
      context.log.warn('Not connected to ChatGPT — use the Connect button in extension settings')
      return []
    }
    return await fetchCodexModels(context, tokenManager)
  }

  const config = await buildRequestConfig(options?.settings, tokenManager)
  if ('error' in config) {
    context.log.warn(config.error)
    return []
  }

  context.log.debug('Fetching models from OpenAI', { baseUrl: config.baseUrl })

  try {
    const response = await context.network!.fetch(`${config.baseUrl}/models`, {
      headers: config.headers,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OpenAIModelsResponse

    // Filter to only include chat models (GPT and o-series)
    const chatModels = data.data.filter(
      (model) =>
        model.id.startsWith('gpt-') ||
        model.id.startsWith('o1') ||
        model.id.startsWith('o3') ||
        model.id.startsWith('o4')
    )

    const models: ModelInfo[] = chatModels.map((model) => ({
      id: model.id,
      name: MODEL_DISPLAY_NAMES[model.id] || model.id,
      description: model.owned_by,
    }))

    // Sort models: GPT-4o first, then other GPT-4, then o-series, then GPT-3.5
    models.sort((a, b) => {
      const order = (id: string) => {
        if (id.startsWith('gpt-4o')) return 0
        if (id.startsWith('gpt-4')) return 1
        if (id.startsWith('o')) return 2
        return 3
      }
      return order(a.id) - order(b.id)
    })

    context.log.info('Fetched OpenAI models', { count: models.length })
    return models
  } catch (error) {
    context.log.error('Failed to fetch OpenAI models', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Sanitizes a tool name to comply with OpenAI's naming requirements.
 * OpenAI only allows [a-zA-Z0-9_-] in tool names, so we replace dots with a unique pattern.
 */
function sanitizeToolName(name: string): string {
  return name.replace(/\./g, '-DOT-')
}

/**
 * Restores the original tool name from a sanitized version.
 * Converts the unique pattern back to dots.
 */
function restoreToolName(sanitizedName: string): string {
  return sanitizedName.replace(/-DOT-/g, '.')
}

/**
 * Convert tools to OpenAI Responses API format
 */
function convertToolsToOpenAI(tools?: ToolDefinition[]): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) return undefined

  return tools.map((tool) => ({
    type: 'function' as const,
    name: sanitizeToolName(tool.id),
    description: localizedStringToString(tool.description),
    parameters: tool.parameters,
  }))
}

/**
 * Default instructions used when the conversation contains no system message.
 * The Codex backend (`chatgpt.com/backend-api/codex`) rejects requests without
 * a top-level `instructions` field with HTTP 400 "Instructions are required".
 */
const DEFAULT_INSTRUCTIONS = 'You are a helpful assistant.'

/**
 * Computes the top-level `instructions` value by concatenating system messages.
 * The original messages are NOT removed from input — system messages are still
 * forwarded as `developer` role items so the model sees them in conversation
 * order, and so Codex doesn't reject the request for an empty input array
 * (which happens at conversation start when Stina sends only system messages).
 */
function buildInstructions(messages: ChatMessage[]): string {
  const systemTexts: string[] = []
  for (const message of messages) {
    if (message.role !== 'system') continue
    const text = typeof message.content === 'string' ? message.content : ''
    if (text.trim().length > 0) systemTexts.push(text)
  }
  return systemTexts.join('\n\n').trim() || DEFAULT_INSTRUCTIONS
}

/**
 * Convert ChatMessage to OpenAI Responses API format.
 * Returns an array because assistant messages with tool_calls need to be converted
 * to multiple function_call items.
 */
function convertMessageToOpenAI(message: ChatMessage): OpenAIInputItem[] {
  // Handle tool result messages
  if (message.role === 'tool') {
    const toolResult: OpenAIToolResultMessage = {
      type: 'function_call_output',
      call_id: message.tool_call_id || generateToolCallId(),
      output: message.content,
    }
    return [toolResult]
  }

  // Handle assistant messages with tool calls
  if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
    const items: OpenAIInputItem[] = []

    // Add the assistant message if it has content
    if (message.content) {
      items.push({
        role: 'assistant',
        content: message.content,
      })
    }

    // Add function_call items for each tool call
    for (const toolCall of message.tool_calls) {
      const functionCall: OpenAIFunctionCallInput = {
        type: 'function_call',
        call_id: toolCall.id,
        name: sanitizeToolName(toolCall.name),
        arguments: JSON.stringify(toolCall.arguments),
      }
      items.push(functionCall)
    }

    return items
  }

  // Handle regular messages
  const inputMessage: OpenAIInputMessage = {
    role: message.role === 'system' ? 'developer' : (message.role as 'user' | 'assistant'),
    content: message.content,
  }

  return [inputMessage]
}

/**
 * State for tracking function calls during streaming
 */
interface FunctionCallState {
  name: string
  callId: string
  arguments: string
}

/**
 * Parse SSE event from a data line
 */
function parseSSEEvent(line: string): OpenAIStreamEvent | null {
  if (!line.startsWith('data: ')) return null

  const jsonStr = line.slice(6).trim()
  if (jsonStr === '[DONE]') return null

  try {
    return JSON.parse(jsonStr) as OpenAIStreamEvent
  } catch {
    return null
  }
}

/**
 * Streams a chat response from the OpenAI Responses API.
 * Uses SSE streaming to yield content progressively as it arrives.
 */
async function* streamChat(
  context: ExtensionContext,
  tokenManager: TokenManager | null,
  messages: ChatMessage[],
  options: ChatOptions
): AsyncGenerator<StreamEvent, void, unknown> {
  const model = options.model || DEFAULT_MODEL
  const reasoningEffort = (options.settings?.reasoningEffort as string) || 'medium'

  const config = await buildRequestConfig(options.settings, tokenManager)
  if ('error' in config) {
    yield { type: 'error', message: config.error }
    return
  }

  // The Codex backend requires a top-level `instructions` field. We build it
  // from any system messages but ALSO keep those system messages in `input`
  // (as `developer` role) so the request is never empty — Stina sends only
  // system messages at conversation start, expecting the model to generate
  // a greeting.
  const instructions = buildInstructions(messages)
  const inputItems: OpenAIInputItem[] = messages.flatMap(convertMessageToOpenAI)

  context.log.debug('Starting streaming chat with OpenAI', {
    baseUrl: config.baseUrl,
    authMethod: isAuthMethodOAuth(options.settings) ? 'chatgpt_oauth' : 'api_key',
    model,
    reasoningEffort,
    messageCount: messages.length,
    inputItemCount: inputItems.length,
    instructionsLength: instructions.length,
  })

  // Convert tools to OpenAI format
  const openaiTools = convertToolsToOpenAI(options.tools)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  }

  try {
    const requestBody: OpenAIResponsesRequest = {
      model,
      instructions,
      input: inputItems,
      stream: true,
      // Codex backend requires this explicitly false; standard API doesn't care.
      store: false,
    }

    // Add temperature if provided
    if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature
    }

    // Add max tokens if provided
    if (options.maxTokens !== undefined) {
      requestBody.max_output_tokens = options.maxTokens
    }

    // Add tools if available
    if (openaiTools && openaiTools.length > 0) {
      requestBody.tools = openaiTools
      requestBody.tool_choice = 'auto'
    }

    // Add reasoning config if enabled
    if (reasoningEffort && reasoningEffort !== 'none') {
      const reasoning: OpenAIReasoningConfig = {
        effort: reasoningEffort as 'low' | 'medium' | 'high',
        summary: 'auto',
      }
      requestBody.reasoning = reasoning
    }

    // Use streaming fetch
    const stream = context.network!.fetchStream(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    let buffer = ''
    let usage: { inputTokens: number; outputTokens: number } | undefined

    // Track function calls being built up
    const functionCalls: Map<number, FunctionCallState> = new Map()

    for await (const chunk of stream) {
      buffer += chunk

      // Parse SSE - each event is "data: {...}\n\n"
      const lines = buffer.split('\n')
      buffer = ''

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Keep incomplete lines in the buffer
        if (i === lines.length - 1 && !line.endsWith('\n') && line !== '') {
          buffer = line
          continue
        }

        if (!line.trim() || !line.startsWith('data:')) continue

        const event = parseSSEEvent(line)
        if (!event) continue

        // Handle different event types
        switch (event.type) {
          case 'response.output_text.delta':
            yield { type: 'content', text: event.delta }
            break

          case 'response.reasoning_summary_text.delta':
            yield { type: 'thinking', text: event.delta }
            break

          case 'response.output_item.added':
            // Track new function call
            if (event.item.type === 'function_call' && event.item.name && event.item.call_id) {
              functionCalls.set(event.output_index, {
                name: restoreToolName(event.item.name),
                callId: event.item.call_id,
                arguments: '',
              })
            }
            break

          case 'response.function_call_arguments.delta':
            // Accumulate function call arguments
            {
              const fc = functionCalls.get(event.output_index)
              if (fc) {
                fc.arguments += event.delta
              }
            }
            break

          case 'response.function_call_arguments.done':
            // Function call is complete, yield tool_start event
            {
              const fc = functionCalls.get(event.output_index)
              if (fc) {
                try {
                  const args = JSON.parse(event.arguments) as Record<string, unknown>
                  yield {
                    type: 'tool_start',
                    name: fc.name,
                    input: args,
                    toolCallId: fc.callId,
                  }
                } catch {
                  context.log.warn('Failed to parse function call arguments', {
                    arguments: event.arguments,
                  })
                }
              }
            }
            break

          case 'response.completed':
            // Extract usage stats
            if (event.response.usage) {
              usage = {
                inputTokens: event.response.usage.input_tokens,
                outputTokens: event.response.usage.output_tokens,
              }
            }
            break

          case 'error':
            yield { type: 'error', message: event.message }
            return
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseSSEEvent(buffer)
      if (event) {
        if (event.type === 'response.completed' && event.response.usage) {
          usage = {
            inputTokens: event.response.usage.input_tokens,
            outputTokens: event.response.usage.output_tokens,
          }
        }
      }
    }

    yield { type: 'done', usage }
  } catch (error) {
    context.log.error('OpenAI streaming chat error', {
      error: error instanceof Error ? error.message : String(error),
    })

    yield {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

