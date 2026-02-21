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
 * Display names for models (for friendlier UI)
 */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'gpt-5.2': 'GPT-5.2',
  'gpt-5': 'GPT-5',
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

// ============================================================================
// OAuth Constants
// ============================================================================

/** OpenAI OAuth device code endpoint */
export const OPENAI_DEVICE_CODE_URL = 'https://auth.openai.com/oauth/device/code'

/** OpenAI OAuth token endpoint */
export const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token'

/** Default OAuth client ID (Codex public client) */
export const DEFAULT_OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/** OAuth scopes for ChatGPT login */
export const OPENAI_OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access']

/** Secret storage keys for OAuth tokens */
export const SECRET_KEYS = {
  accessToken: 'oauth_access_token',
  refreshToken: 'oauth_refresh_token',
  expiresAt: 'oauth_expires_at',
} as const
