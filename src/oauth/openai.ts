/**
 * OpenAI-specific OAuth configuration and helpers.
 */

import {
  OPENAI_DEVICE_CODE_URL,
  OPENAI_TOKEN_URL,
  DEFAULT_OPENAI_OAUTH_CLIENT_ID,
  OPENAI_OAUTH_SCOPES,
} from '../constants.js'
import type { TokenResponse } from '../types.js'
import {
  initiateDeviceCodeFlow,
  pollForToken,
  refreshAccessToken,
  type DeviceCodeConfig,
  type DeviceCodeFlowResult,
} from './device-code.js'

export interface OpenAIOAuthConfig {
  clientId?: string
}

function buildConfig(config?: OpenAIOAuthConfig): DeviceCodeConfig {
  return {
    clientId: config?.clientId || DEFAULT_OPENAI_OAUTH_CLIENT_ID,
    deviceCodeUrl: OPENAI_DEVICE_CODE_URL,
    tokenUrl: OPENAI_TOKEN_URL,
    scopes: OPENAI_OAUTH_SCOPES,
  }
}

export async function initiateOpenAIAuth(config?: OpenAIOAuthConfig): Promise<DeviceCodeFlowResult> {
  return initiateDeviceCodeFlow(buildConfig(config))
}

export async function pollOpenAIToken(config: OpenAIOAuthConfig | undefined, deviceCode: string): Promise<TokenResponse | null> {
  return pollForToken(buildConfig(config), deviceCode)
}

export async function refreshOpenAIToken(config: OpenAIOAuthConfig | undefined, refreshToken: string): Promise<TokenResponse> {
  return refreshAccessToken(buildConfig(config), refreshToken)
}

export function isOpenAITokenExpired(expiresAt: string, bufferMinutes = 5): boolean {
  const expiresTime = new Date(expiresAt).getTime()
  const now = Date.now()
  return now >= expiresTime - bufferMinutes * 60 * 1000
}
