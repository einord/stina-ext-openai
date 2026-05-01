/**
 * OAuth Authorization Code Flow with PKCE for OpenAI.
 *
 * Replaces the device code flow with a standard authorization code flow
 * that shows the normal OpenAI login page instead of a Codex-specific one.
 */

import {
  OPENAI_AUTHORIZE_URL,
  OPENAI_OAUTH_TOKEN_URL,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
  DEFAULT_OPENAI_OAUTH_CLIENT_ID,
} from '../constants.js'
import type { AuthorizeFlowResult, TokenResponse } from '../types.js'
import { generatePKCE, generateState } from './pkce.js'

const USER_AGENT = 'stina-ext-openai/1.0.0'

/**
 * Build the authorization URL and generate PKCE parameters.
 * The returned URL should be opened in the user's browser.
 */
export function buildAuthorizeFlow(): AuthorizeFlowResult {
  const { codeVerifier, codeChallenge } = generatePKCE()
  const state = generateState()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: DEFAULT_OPENAI_OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    id_token_add_organizations: 'true',
    // Keep the codex_cli_rs originator paired with codex_cli_simplified_flow —
    // it's a known-working combination at OpenAI's auth server. STINA_ORIGINATOR
    // is used in API request headers instead, where custom values are accepted.
    codex_cli_simplified_flow: 'true',
    originator: 'codex_cli_rs',
  })

  const authorizeUrl = `${OPENAI_AUTHORIZE_URL}?${params.toString()}`

  return { authorizeUrl, codeVerifier, state }
}

/**
 * Exchange an authorization code for access and refresh tokens.
 * Uses the PKCE code_verifier for verification.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: DEFAULT_OPENAI_OAUTH_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    redirect_uri: OAUTH_REDIRECT_URI,
  })

  const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: (data.expires_in as number) || 3600,
    tokenType: (data.token_type as string) || 'Bearer',
  }
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: DEFAULT_OPENAI_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  })

  const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
    expiresIn: (data.expires_in as number) || 3600,
    tokenType: (data.token_type as string) || 'Bearer',
  }
}
