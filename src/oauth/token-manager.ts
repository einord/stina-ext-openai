/**
 * Token Manager — stores and refreshes OAuth tokens via SecretsAPI.
 */

import type { SecretsAPI } from '@stina/extension-api/runtime'
import { SECRET_KEYS } from '../constants.js'
import type { TokenResponse } from '../types.js'
import { refreshOpenAIToken } from './openai.js'

export interface TokenManager {
  getAccessToken(): Promise<string | null>
  isConnected(): Promise<boolean>
  storeTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void>
  clearTokens(): Promise<void>
}

export function createTokenManager(
  secrets: SecretsAPI,
  log: { info: (msg: string, data?: Record<string, unknown>) => void; error: (msg: string, data?: Record<string, unknown>) => void; warn: (msg: string, data?: Record<string, unknown>) => void }
): TokenManager {
  return {
    async getAccessToken(): Promise<string | null> {
      const accessToken = await secrets.get(SECRET_KEYS.accessToken)
      if (!accessToken) return null

      const expiresAt = await secrets.get(SECRET_KEYS.expiresAt)
      if (!expiresAt) return accessToken

      // Check if token expires within 5 minutes
      const expiresTime = new Date(expiresAt).getTime()
      const now = Date.now()
      const bufferMs = 5 * 60 * 1000

      if (now < expiresTime - bufferMs) {
        return accessToken
      }

      // Token is expired or about to expire — try refresh
      const refreshToken = await secrets.get(SECRET_KEYS.refreshToken)
      if (!refreshToken) {
        log.warn('Token expired but no refresh token available')
        return null
      }

      try {
        log.info('Refreshing expired OAuth token')
        const result: TokenResponse = await refreshOpenAIToken(undefined, refreshToken)
        await this.storeTokens(result.accessToken, result.refreshToken, result.expiresIn)
        return result.accessToken
      } catch (error) {
        log.error('Failed to refresh OAuth token', {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    },

    async isConnected(): Promise<boolean> {
      const token = await secrets.get(SECRET_KEYS.accessToken)
      return token !== undefined && token !== null && token !== ''
    },

    async storeTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
      await secrets.set(SECRET_KEYS.accessToken, accessToken)
      await secrets.set(SECRET_KEYS.refreshToken, refreshToken)
      await secrets.set(SECRET_KEYS.expiresAt, expiresAt)
    },

    async clearTokens(): Promise<void> {
      await secrets.delete(SECRET_KEYS.accessToken)
      await secrets.delete(SECRET_KEYS.refreshToken)
      await secrets.delete(SECRET_KEYS.expiresAt)
    },
  }
}
