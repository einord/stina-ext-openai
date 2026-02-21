/**
 * Generic OAuth2 Device Code Flow implementation.
 */

import type { TokenResponse } from '../types.js'

export interface DeviceCodeConfig {
  clientId: string
  clientSecret?: string
  deviceCodeUrl: string
  tokenUrl: string
  scopes: string[]
}

export interface DeviceCodeFlowResult {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

/**
 * Initiate the device code flow by requesting a device code from the provider.
 */
export async function initiateDeviceCodeFlow(config: DeviceCodeConfig): Promise<DeviceCodeFlowResult> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes.join(' '),
  })

  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret)
  }

  const response = await fetch(config.deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Device code request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json() as Record<string, unknown>

  return {
    deviceCode: (data.device_code as string),
    userCode: (data.user_code as string),
    verificationUrl: (data.verification_uri as string) || (data.verification_url as string),
    expiresIn: (data.expires_in as number) || 900,
    interval: (data.interval as number) || 5,
  }
}

/**
 * Poll the token endpoint for authorization.
 * Returns null if authorization is still pending, throws on actual errors.
 */
export async function pollForToken(config: DeviceCodeConfig, deviceCode: string): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: config.clientId,
    device_code: deviceCode,
  })

  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret)
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await response.json() as Record<string, unknown>

  if (!response.ok) {
    const error = (data.error as string) || ''
    if (error === 'authorization_pending' || error === 'slow_down') {
      return null
    }
    const errorDesc = (data.error_description as string) || 'Token request failed'
    throw new Error(`${error}: ${errorDesc}`)
  }

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
export async function refreshAccessToken(config: DeviceCodeConfig, refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  })

  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret)
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`)
  }

  const data = await response.json() as Record<string, unknown>

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
    expiresIn: (data.expires_in as number) || 3600,
    tokenType: (data.token_type as string) || 'Bearer',
  }
}
