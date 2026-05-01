/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth2 Authorization Code Flow.
 */

import { randomBytes, createHash } from 'node:crypto'

/**
 * Generate a PKCE code verifier and code challenge pair.
 * Uses SHA-256 for the code challenge method.
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

/**
 * Generate a random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(16).toString('hex')
}
