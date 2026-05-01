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

/** OpenAI auth base URL */
export const OPENAI_AUTH_BASE_URL = 'https://auth.openai.com'

/** OpenAI OAuth token endpoint (code exchange and refresh) */
export const OPENAI_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

/** OpenAI OAuth authorize endpoint */
export const OPENAI_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'

/** Local callback server port (must match the redirect URI registered for the OAuth client). */
export const OAUTH_CALLBACK_PORT = 1455

/**
 * OAuth redirect URI for the local callback server.
 *
 * Must use the literal string "localhost" (not 127.0.0.1) — that is the value
 * registered for OpenAI's Codex OAuth client. The callback server still binds
 * to 127.0.0.1, which is fine since localhost resolves there locally.
 */
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`

/**
 * OAuth scopes requested by Codex CLI. The api.connectors.* scopes are required
 * by OpenAI's authorization server even though we don't currently use connectors —
 * omitting them causes the auth flow to fail with "unknown_error".
 */
export const OAUTH_SCOPES =
  'openid profile email offline_access api.connectors.read api.connectors.invoke'

/** Timeout for waiting for OAuth callback (2 minutes) */
export const OAUTH_CALLBACK_TIMEOUT_MS = 120_000

/** Default OAuth client ID (Codex public client) */
export const DEFAULT_OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/**
 * Codex backend used when the user authenticates with their ChatGPT subscription.
 * The standard OpenAI API at api.openai.com does NOT accept ChatGPT OAuth tokens —
 * subscription traffic must go through this endpoint instead.
 */
export const OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'

/** Originator string sent to OpenAI to identify Stina in request headers. */
export const STINA_ORIGINATOR = 'stina'

/** Secret storage keys for OAuth tokens */
export const SECRET_KEYS = {
  accessToken: 'oauth_access_token',
  refreshToken: 'oauth_refresh_token',
  expiresAt: 'oauth_expires_at',
} as const
