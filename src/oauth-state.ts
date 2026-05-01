/**
 * In-memory OAuth UI state.
 *
 * The toolSetting view in manifest.json reads this via the getOAuthState action.
 * It is intentionally process-local — persistent state lives in SecretsAPI.
 */

export interface OAuthState {
  status: 'disconnected' | 'awaiting' | 'connected' | 'error'
  /** Markdown link to start the authorize flow (only set during 'awaiting'). */
  authorizeUrl: string
  errorMessage: string
  /** Identity claims shown in the UI when status === 'connected'. */
  email: string
  planType: string
}

const defaultState: OAuthState = {
  status: 'disconnected',
  authorizeUrl: '',
  errorMessage: '',
  email: '',
  planType: '',
}

let currentState: OAuthState = { ...defaultState }

export function getState(): OAuthState {
  return { ...currentState }
}

export function setState(update: Partial<OAuthState>): void {
  currentState = { ...currentState, ...update }
}

export function resetState(): void {
  currentState = { ...defaultState }
}
