/**
 * OpenAI API Types
 *
 * Type definitions for OpenAI Responses API requests and responses.
 */

// ============================================================================
// Models API Types
// ============================================================================

/**
 * OpenAI API response for listing available models
 */
export interface OpenAIModelsResponse {
  object: 'list'
  data: OpenAIModel[]
}

/**
 * OpenAI model information
 */
export interface OpenAIModel {
  id: string
  object: 'model'
  created: number
  owned_by: string
}

// ============================================================================
// Responses API Types
// ============================================================================

/**
 * Content part types for messages
 */
export type OpenAIContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }

/**
 * Input message format for Responses API
 */
export interface OpenAIInputMessage {
  role: 'user' | 'assistant' | 'system' | 'developer'
  content: string | OpenAIContentPart[]
}

/**
 * Tool result message for Responses API
 */
export interface OpenAIToolResultMessage {
  type: 'function_call_output'
  call_id: string
  output: string
}

/**
 * Function call input item (for passing assistant's tool calls back to the API)
 */
export interface OpenAIFunctionCallInput {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

/**
 * Union type for all input item types
 */
export type OpenAIInputItem = OpenAIInputMessage | OpenAIToolResultMessage | OpenAIFunctionCallInput

/**
 * Function tool definition
 */
export interface OpenAIFunctionTool {
  type: 'function'
  name: string
  description: string
  parameters?: Record<string, unknown>
  strict?: boolean
}

/**
 * Union type for all tool types
 */
export type OpenAITool = OpenAIFunctionTool

/**
 * Reasoning configuration for o-series models
 */
export interface OpenAIReasoningConfig {
  effort: 'low' | 'medium' | 'high'
  summary?: 'auto' | 'concise' | 'detailed'
}

/**
 * Request body for Responses API
 */
export interface OpenAIResponsesRequest {
  model: string
  input: OpenAIInputItem[]
  instructions?: string
  stream?: boolean
  temperature?: number
  max_output_tokens?: number
  tools?: OpenAITool[]
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string }
  reasoning?: OpenAIReasoningConfig
}

// ============================================================================
// Streaming Event Types (SSE)
// ============================================================================

/**
 * Base streaming event
 */
interface OpenAIBaseStreamEvent {
  type: string
  sequence_number: number
}

/**
 * Response created event
 */
export interface OpenAIResponseCreatedEvent extends OpenAIBaseStreamEvent {
  type: 'response.created'
  response: {
    id: string
    object: 'response'
    status: 'in_progress' | 'completed' | 'failed' | 'cancelled'
    model: string
  }
}

/**
 * Output item added event
 */
export interface OpenAIOutputItemAddedEvent extends OpenAIBaseStreamEvent {
  type: 'response.output_item.added'
  output_index: number
  item: {
    type: 'message' | 'function_call'
    id: string
    role?: 'assistant'
    status?: 'in_progress' | 'completed'
    name?: string
    call_id?: string
  }
}

/**
 * Text delta event
 */
export interface OpenAITextDeltaEvent extends OpenAIBaseStreamEvent {
  type: 'response.output_text.delta'
  output_index: number
  content_index: number
  delta: string
}

/**
 * Text done event
 */
export interface OpenAITextDoneEvent extends OpenAIBaseStreamEvent {
  type: 'response.output_text.done'
  output_index: number
  content_index: number
  text: string
}

/**
 * Reasoning summary text delta event (for o-series models)
 */
export interface OpenAIReasoningSummaryDeltaEvent extends OpenAIBaseStreamEvent {
  type: 'response.reasoning_summary_text.delta'
  output_index: number
  summary_index: number
  delta: string
}

/**
 * Reasoning summary text done event
 */
export interface OpenAIReasoningSummaryDoneEvent extends OpenAIBaseStreamEvent {
  type: 'response.reasoning_summary_text.done'
  output_index: number
  summary_index: number
  text: string
}

/**
 * Function call arguments delta event
 */
export interface OpenAIFunctionCallArgsDeltaEvent extends OpenAIBaseStreamEvent {
  type: 'response.function_call_arguments.delta'
  output_index: number
  delta: string
}

/**
 * Function call arguments done event
 */
export interface OpenAIFunctionCallArgsDoneEvent extends OpenAIBaseStreamEvent {
  type: 'response.function_call_arguments.done'
  output_index: number
  arguments: string
}

/**
 * Output item done event
 */
export interface OpenAIOutputItemDoneEvent extends OpenAIBaseStreamEvent {
  type: 'response.output_item.done'
  output_index: number
  item: {
    type: 'message' | 'function_call'
    id: string
    role?: 'assistant'
    status?: 'completed'
    content?: Array<{ type: 'output_text'; text: string }>
    name?: string
    call_id?: string
    arguments?: string
  }
}

/**
 * Response completed event
 */
export interface OpenAIResponseCompletedEvent extends OpenAIBaseStreamEvent {
  type: 'response.completed'
  response: {
    id: string
    object: 'response'
    status: 'completed'
    model: string
    output: Array<{
      type: 'message' | 'function_call'
      id: string
      role?: 'assistant'
      status: 'completed'
      content?: Array<{ type: 'output_text'; text: string }>
      name?: string
      call_id?: string
      arguments?: string
    }>
    usage: {
      input_tokens: number
      output_tokens: number
      total_tokens: number
      input_tokens_details?: {
        cached_tokens?: number
      }
      output_tokens_details?: {
        reasoning_tokens?: number
      }
    }
  }
}

/**
 * Error event
 */
export interface OpenAIErrorEvent extends OpenAIBaseStreamEvent {
  type: 'error'
  code: string
  message: string
  param?: string
}

/**
 * Union type for all streaming events
 */
export type OpenAIStreamEvent =
  | OpenAIResponseCreatedEvent
  | OpenAIOutputItemAddedEvent
  | OpenAITextDeltaEvent
  | OpenAITextDoneEvent
  | OpenAIReasoningSummaryDeltaEvent
  | OpenAIReasoningSummaryDoneEvent
  | OpenAIFunctionCallArgsDeltaEvent
  | OpenAIFunctionCallArgsDoneEvent
  | OpenAIOutputItemDoneEvent
  | OpenAIResponseCompletedEvent
  | OpenAIErrorEvent

// ============================================================================
// Non-streaming Response Types
// ============================================================================

/**
 * Full response object (non-streaming)
 */
export interface OpenAIResponse {
  id: string
  object: 'response'
  status: 'completed' | 'failed' | 'cancelled'
  model: string
  output: Array<{
    type: 'message' | 'function_call'
    id: string
    role?: 'assistant'
    status: 'completed'
    content?: Array<{ type: 'output_text'; text: string }>
    name?: string
    call_id?: string
    arguments?: string
  }>
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    input_tokens_details?: {
      cached_tokens?: number
    }
    output_tokens_details?: {
      reasoning_tokens?: number
    }
  }
  error?: {
    code: string
    message: string
  }
}
