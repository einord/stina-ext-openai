/**
 * OAuth action handlers.
 *
 * Two completion paths are supported:
 *   1. The local callback server captures the redirect automatically (works in
 *      dev when the API runs on the same host as the user's browser).
 *   2. The user pastes the redirect URL into the UI manually (works when the
 *      API is in a Docker container or on a remote host where localhost:1455
 *      is unreachable from the browser).
 *
 * Both paths converge on `completeOAuthFlow()`.
 */

import type { ActionResult, ExtensionContext, Disposable } from '@stina/extension-api/runtime'
import type { TokenManager } from './oauth/token-manager.js'
import { buildAuthorizeFlow, exchangeCodeForTokens } from './oauth/auth-code.js'
import { startCallbackServer, type CallbackServer } from './oauth/callback-server.js'
import { getState, setState, resetState } from './oauth-state.js'

/** Active callback server instance (if any). */
let activeCallbackServer: CallbackServer | null = null

/**
 * PKCE verifier + expected state for the in-flight authorize flow. Both the
 * automatic callback path and the manual paste path consume this and clear it
 * once tokens are stored.
 */
let pendingFlow: { codeVerifier: string; expectedState: string } | null = null

export function registerOAuthActions(
  context: ExtensionContext,
  tokenManager: TokenManager
): Disposable[] {
  const disposables: Disposable[] = []

  if (!context.actions) return disposables

  // Action: Get current OAuth state
  disposables.push(
    context.actions.register({
      id: 'getOAuthState',
      async execute() {
        const connected = await tokenManager.isConnected()
        const state = getState()

        if (connected && state.status !== 'awaiting') {
          const identity = await tokenManager.getIdentity()
          setState({
            status: 'connected',
            email: identity?.email ?? '',
            planType: identity?.planType ?? '',
          })
        } else if (!connected && state.status === 'connected') {
          setState({ status: 'disconnected', email: '', planType: '' })
        }

        return { success: true, data: getState() }
      },
    })
  )

  // Action: Start ChatGPT OAuth flow (Authorization Code with PKCE)
  disposables.push(
    context.actions.register({
      id: 'startChatGPTOAuth',
      async execute() {
        try {
          if (activeCallbackServer) {
            activeCallbackServer.close()
            activeCallbackServer = null
          }

          context.log.info('Starting ChatGPT OAuth authorization code flow')

          const flow = buildAuthorizeFlow()
          pendingFlow = { codeVerifier: flow.codeVerifier, expectedState: flow.state }

          // Best-effort: start a local callback server. Will only catch the
          // redirect when the user's browser can reach localhost:1455 on the
          // same host as the API process.
          const callbackServer = startCallbackServer()
          activeCallbackServer = callbackServer

          setState({
            status: 'awaiting',
            authorizeUrl: `[Sign in with OpenAI](${flow.authorizeUrl})`,
            errorMessage: '',
          })

          await context.events?.emit('openai.oauth.changed')

          void waitForOAuthCallback(context, tokenManager, callbackServer)

          return {
            success: true,
            data: { ...getState(), openUrl: flow.authorizeUrl },
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          context.log.error('Failed to start OAuth flow', { error: message })

          setState({ status: 'error', errorMessage: message, authorizeUrl: '' })
          await context.events?.emit('openai.oauth.changed')
          return { success: false, error: message }
        }
      },
    })
  )

  // Action: Submit a pasted callback URL (or just the code+state) manually.
  disposables.push(
    context.actions.register({
      id: 'submitOAuthCallback',
      async execute(params): Promise<ActionResult> {
        try {
          const url = typeof params?.url === 'string' ? params.url.trim() : ''
          if (!url) {
            return { success: false, error: 'Paste the redirect URL before submitting.' }
          }

          const parsed = parseCallbackInput(url)
          if (!parsed) {
            return {
              success: false,
              error: 'Could not find a code in the URL. Make sure you copied the full redirect URL.',
            }
          }

          if (!pendingFlow) {
            return {
              success: false,
              error: 'No login is in progress. Click Connect to start a new login.',
            }
          }

          if (parsed.state && parsed.state !== pendingFlow.expectedState) {
            return {
              success: false,
              error: 'The pasted URL is from a different login attempt. Please retry.',
            }
          }

          await completeOAuthFlow(context, tokenManager, parsed.code, pendingFlow.codeVerifier)

          // Tear down the callback server — we don't need it anymore.
          if (activeCallbackServer) {
            activeCallbackServer.close()
            activeCallbackServer = null
          }
          pendingFlow = null

          return { success: true, data: getState() }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          context.log.error('Manual OAuth submission failed', { error: message })
          setState({ status: 'error', errorMessage: message, authorizeUrl: '' })
          await context.events?.emit('openai.oauth.changed')
          return { success: false, error: message }
        }
      },
    })
  )

  // Action: Disconnect ChatGPT OAuth
  disposables.push(
    context.actions.register({
      id: 'disconnectChatGPTOAuth',
      async execute() {
        try {
          if (activeCallbackServer) {
            activeCallbackServer.close()
            activeCallbackServer = null
          }
          pendingFlow = null

          await tokenManager.clearTokens()
          resetState()
          await context.events?.emit('openai.oauth.changed')

          context.log.info('ChatGPT OAuth disconnected')
          return { success: true, data: getState() }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, error: message }
        }
      },
    })
  )

  return disposables
}

/**
 * Accepts either a full redirect URL or a bare query string, and extracts the
 * authorization code and state. Returns null if no code can be found.
 */
function parseCallbackInput(input: string): { code: string; state: string | null } | null {
  let search: URLSearchParams
  try {
    // Full URL form
    search = new URL(input).searchParams
  } catch {
    // Bare ?code=...&state=... or code=...&state=... form
    const trimmed = input.startsWith('?') ? input.slice(1) : input
    try {
      search = new URLSearchParams(trimmed)
    } catch {
      return null
    }
  }

  const code = search.get('code')?.trim()
  if (!code) return null
  return { code, state: search.get('state')?.trim() ?? null }
}

/** Exchanges an authorization code for tokens and updates state on success. */
async function completeOAuthFlow(
  context: ExtensionContext,
  tokenManager: TokenManager,
  code: string,
  codeVerifier: string,
): Promise<void> {
  const tokens = await exchangeCodeForTokens(code, codeVerifier)
  await tokenManager.storeTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn)

  const identity = await tokenManager.getIdentity()
  setState({
    status: 'connected',
    authorizeUrl: '',
    errorMessage: '',
    email: identity?.email ?? '',
    planType: identity?.planType ?? '',
  })

  context.log.info('ChatGPT OAuth connected successfully')
  await context.events?.emit('openai.oauth.changed')
}

/**
 * Best-effort callback handler. Runs alongside manual paste — whichever path
 * completes first wins. The other path becomes a no-op once pendingFlow is
 * cleared.
 */
async function waitForOAuthCallback(
  context: ExtensionContext,
  tokenManager: TokenManager,
  callbackServer: CallbackServer,
): Promise<void> {
  try {
    const result = await callbackServer.waitForCallback()

    if (!pendingFlow) {
      // Manual paste already completed — discard this callback.
      return
    }

    if (result.state !== pendingFlow.expectedState) {
      throw new Error('OAuth state mismatch — possible CSRF attack. Please try again.')
    }

    await completeOAuthFlow(context, tokenManager, result.code, pendingFlow.codeVerifier)
    pendingFlow = null
  } catch (error) {
    if (!pendingFlow) {
      // Manual paste handled it; don't surface this error.
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    context.log.error('OAuth callback error', { error: message })
    setState({ status: 'error', errorMessage: message, authorizeUrl: '' })
    await context.events?.emit('openai.oauth.changed')
  } finally {
    callbackServer.close()
    if (activeCallbackServer === callbackServer) {
      activeCallbackServer = null
    }
  }
}
