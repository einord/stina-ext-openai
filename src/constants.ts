/**
 * Constants
 *
 * Configuration constants for the OpenAI extension.
 */

/**
 * Default URL for OpenAI API
 */
export const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1'

/**
 * Default model to use if none is specified
 */
export const DEFAULT_MODEL = 'gpt-4o'

/**
 * Provider identifier
 */
export const PROVIDER_ID = 'openai'

/**
 * Provider display name
 */
export const PROVIDER_NAME = 'OpenAI'

/**
 * Models that support reasoning/thinking
 */
export const REASONING_MODELS = ['o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini', 'o4-mini', 'gpt-5']

/**
 * Models that support vision/image input
 */
export const VISION_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview']

/**
 * Display names for models (for friendlier UI)
 */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4-turbo-preview': 'GPT-4 Turbo Preview',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'o1': 'o1',
  'o1-mini': 'o1 Mini',
  'o1-preview': 'o1 Preview',
  'o3': 'o3',
  'o3-mini': 'o3 Mini',
  'o4-mini': 'o4 Mini',
}

/**
 * Checks if a model supports reasoning/thinking
 */
export function isReasoningModel(modelId: string): boolean {
  return REASONING_MODELS.some((rm) => modelId.startsWith(rm))
}

/**
 * Checks if a model supports vision/image input
 */
export function supportsVision(modelId: string): boolean {
  return VISION_MODELS.some((vm) => modelId.startsWith(vm))
}
