/**
 * Token Manager — stores and refreshes OAuth tokens via SecretsAPI.
 *
 * Also surfaces identity claims (email, plan, account id) extracted from the
 * stored access token's JWT payload — those are needed both for the UI and
 * for the ChatGPT-Account-Id request header sent to the Codex backend.
 */

import type { SecretsAPI } from '@stina/extension-api/runtime'
import { SECRET_KEYS } from '../constants.js'
import type { TokenResponse } from '../types.js'
import { refreshAccessToken } from './auth-code.js'
import { extractCodexIdentity, type CodexIdentity } from './jwt-identity.js'

interface Logger {
  info: (msg: string, data?: Record<string, unknown>) => void
  error: (msg: string, data?: Record<string, unknown>) => void
  warn: (msg: string, data?: Record<string, unknown>) => void
}

export interface TokenManager {
  /** Returns a non-expired access token, refreshing if needed. Null if not connected. */
  getAccessToken(): Promise<string | null>
  /** True if an access token is currently stored (regardless of expiry). */
  isConnected(): Promise<boolean>
  /** Identity claims (email, plan, account id) parsed from the stored token. */
  getIdentity(): Promise<CodexIdentity | null>
  storeTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void>
  clearTokens(): Promise<void>
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000

export function createTokenManager(secrets: SecretsAPI, log: Logger): TokenManager {
  async function readStoredAccessToken(): Promise<string | null> {
    const token = await secrets.get(SECRET_KEYS.accessToken)
    return token && token.length > 0 ? token : null
  }

  async function persist(tokens: TokenResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    await secrets.set(SECRET_KEYS.accessToken, tokens.accessToken)
    await secrets.set(SECRET_KEYS.refreshToken, tokens.refreshToken)
    await secrets.set(SECRET_KEYS.expiresAt, expiresAt)
  }

  return {
    async getAccessToken(): Promise<string | null> {
      const accessToken = await readStoredAccessToken()
      if (!accessToken) return null

      const expiresAt = await secrets.get(SECRET_KEYS.expiresAt)
      if (!expiresAt) return accessToken

      const expiresTime = new Date(expiresAt).getTime()
      if (Date.now() < expiresTime - REFRESH_BUFFER_MS) {
        return accessToken
      }

      const refreshToken = await secrets.get(SECRET_KEYS.refreshToken)
      if (!refreshToken) {
        log.warn('Token expired but no refresh token available')
        return null
      }

      try {
        log.info('Refreshing expired OAuth token')
        const result = await refreshAccessToken(refreshToken)
        await persist(result)
        return result.accessToken
      } catch (error) {
        log.error('Failed to refresh OAuth token', {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    },

    async isConnected(): Promise<boolean> {
      return (await readStoredAccessToken()) !== null
    },

    async getIdentity(): Promise<CodexIdentity | null> {
      const token = await readStoredAccessToken()
      if (!token) return null
      return extractCodexIdentity(token)
    },

    async storeTokens(accessToken, refreshToken, expiresIn): Promise<void> {
      await persist({ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' })
    },

    async clearTokens(): Promise<void> {
      await secrets.delete(SECRET_KEYS.accessToken)
      await secrets.delete(SECRET_KEYS.refreshToken)
      await secrets.delete(SECRET_KEYS.expiresAt)
    },
  }
}
