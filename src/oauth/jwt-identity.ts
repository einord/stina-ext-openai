/**
 * JWT identity extraction for ChatGPT OAuth access tokens.
 *
 * The access token returned by OpenAI's OAuth flow is a JWT whose payload
 * carries the ChatGPT account id, plan type, and user email. These values
 * are needed at runtime: account id is sent as a request header to the Codex
 * backend, and email/plan are shown in the UI when connected.
 */

import { Buffer } from 'node:buffer'

interface CodexJwtPayload {
  exp?: number | string
  iss?: string
  sub?: string
  'https://api.openai.com/profile'?: {
    email?: string
  }
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string
    chatgpt_plan_type?: string
    chatgpt_user_id?: string
    user_id?: string
  }
}

export interface CodexIdentity {
  accountId?: string
  planType?: string
  email?: string
  /** Token expiry as epoch milliseconds, or undefined if not present in the JWT. */
  expiresAt?: number
}

function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseExpiryMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value) * 1000
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10) * 1000
  }
  return undefined
}

function decodeJwtPayload(accessToken: string): CodexJwtPayload | null {
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as CodexJwtPayload) : null
  } catch {
    return null
  }
}

/**
 * Extract identity claims from a Codex OAuth access token.
 *
 * Returns an empty object if the token is not a valid JWT. Callers should
 * still treat the token as usable in that case — only identity-derived
 * features (account header, UI display) are gated on parseable claims.
 */
export function extractCodexIdentity(accessToken: string): CodexIdentity {
  const payload = decodeJwtPayload(accessToken)
  if (!payload) return {}
  const auth = payload['https://api.openai.com/auth']
  const profile = payload['https://api.openai.com/profile']
  return {
    accountId: trim(auth?.chatgpt_account_id),
    planType: trim(auth?.chatgpt_plan_type),
    email: trim(profile?.email),
    expiresAt: parseExpiryMs(payload.exp),
  }
}
