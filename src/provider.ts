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
import type { LocalizedString } from '@stina/extension-api'

import {
  DEFAULT_OPENAI_URL,
  DEFAULT_MODEL,
  PROVIDER_ID,
  PROVIDER_NAME,
  MODEL_DISPLAY_NAMES,
} from './constants.js'
import type {
  OpenAIModelsResponse,
  OpenAIResponsesRequest,
  OpenAIInputItem,
  OpenAIInputMessage,
  OpenAIToolResultMessage,
  OpenAITool,
  OpenAIStreamEvent,
  OpenAIReasoningConfig,
} from './types.js'

let toolCallCounter = 0

/**
 * Converts a LocalizedString to a plain string.
 * If the value is already a string, returns it directly (with trimming).
 * If it's a Record, returns the English value or the first available non-empty value.
 * Falls back to a default message if no non-empty value can be found.
 */
function localizedStringToString(value: LocalizedString): string {
  const DEFAULT_LOCALIZED_FALLBACK = '[missing localized string]'

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || DEFAULT_LOCALIZED_FALLBACK
  }

  // Try English first
  const enValue = typeof value['en'] === 'string' ? value['en'].trim() : ''
  if (enValue) {
    return enValue
  }

  // Fall back to the first non-empty value in the record
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }

  // As a last resort, return a clear default instead of an empty string
  return DEFAULT_LOCALIZED_FALLBACK
}

/**
 * Simple ID generator for tool calls
 */
function generateToolCallId(): string {
  toolCallCounter++
  if (toolCallCounter >= Number.MAX_SAFE_INTEGER) {
    toolCallCounter = 1
  }
  return `call_${Date.now()}_${toolCallCounter.toString(36)}`
}

/**
 * Creates the OpenAI AI provider
 */
export function createOpenAIProvider(context: ExtensionContext): AIProvider {
  return {
    id: PROVIDER_ID,
    name: PROVIDER_NAME,

    getModels: (options?: GetModelsOptions) => fetchModels(context, options),
    chat: (messages: ChatMessage[], options: ChatOptions) => streamChat(context, messages, options),
  }
}

/**
 * Fetches available models from the OpenAI API
 */
async function fetchModels(
  context: ExtensionContext,
  options?: GetModelsOptions
): Promise<ModelInfo[]> {
  const baseUrl = (options?.settings?.baseUrl as string) || DEFAULT_OPENAI_URL
  const apiKey = options?.settings?.apiKey as string

  if (!apiKey) {
    context.log.warn('No API key configured for OpenAI')
    return []
  }

  context.log.debug('Fetching models from OpenAI', { baseUrl })

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  }

  const organizationId = options?.settings?.organizationId as string
  if (organizationId) {
    headers['OpenAI-Organization'] = organizationId
  }

  try {
    const response = await context.network!.fetch(`${baseUrl}/models`, { headers })

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
 * Convert ChatMessage to OpenAI Responses API format
 */
function convertMessageToOpenAI(message: ChatMessage): OpenAIInputItem {
  // Handle tool result messages
  if (message.role === 'tool') {
    const toolResult: OpenAIToolResultMessage = {
      type: 'function_call_output',
      call_id: message.tool_call_id || generateToolCallId(),
      output: message.content,
    }
    return toolResult
  }

  // Handle regular messages
  const inputMessage: OpenAIInputMessage = {
    role: message.role === 'system' ? 'developer' : (message.role as 'user' | 'assistant'),
    content: message.content,
  }

  return inputMessage
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
  messages: ChatMessage[],
  options: ChatOptions
): AsyncGenerator<StreamEvent, void, unknown> {
  const baseUrl = (options.settings?.baseUrl as string) || DEFAULT_OPENAI_URL
  const apiKey = options.settings?.apiKey as string
  const model = options.model || DEFAULT_MODEL
  const reasoningEffort = (options.settings?.reasoningEffort as string) || 'medium'

  if (!apiKey) {
    yield { type: 'error', message: 'No API key configured for OpenAI' }
    return
  }

  context.log.debug('Starting streaming chat with OpenAI', {
    baseUrl,
    model,
    reasoningEffort,
    messageCount: messages.length,
  })

  // Convert messages to OpenAI Responses API format
  const inputItems: OpenAIInputItem[] = messages.map(convertMessageToOpenAI)

  // Convert tools to OpenAI format
  const openaiTools = convertToolsToOpenAI(options.tools)

  // Build request headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  const organizationId = options.settings?.organizationId as string
  if (organizationId) {
    headers['OpenAI-Organization'] = organizationId
  }

  try {
    const requestBody: OpenAIResponsesRequest = {
      model,
      input: inputItems,
      stream: true,
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
    const stream = context.network!.fetchStream(`${baseUrl}/responses`, {
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

// TODO: Enable when Extension API supports image content
// function convertMessageContent(content: string | ImageContent[]): OpenAIContentPart[] {
//   if (typeof content === 'string') {
//     return [{ type: 'input_text', text: content }]
//   }
//   return content.map(part => {
//     if (part.type === 'image') {
//       return { type: 'input_image', image_url: part.url, detail: 'auto' }
//     }
//     return { type: 'input_text', text: part.text }
//   })
// }
