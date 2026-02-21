/**
 * In-memory OAuth UI state.
 */

export interface OAuthState {
  status: 'disconnected' | 'awaiting' | 'connected' | 'error'
  verificationUrl: string
  userCode: string
  errorMessage: string
}

const defaultState: OAuthState = {
  status: 'disconnected',
  verificationUrl: '',
  userCode: '',
  errorMessage: '',
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
