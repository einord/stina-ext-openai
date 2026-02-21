/**
 * OAuth action handlers for toolSettings UI.
 */

import type { ExtensionContext, Disposable } from '@stina/extension-api/runtime'
import type { TokenManager } from './oauth/token-manager.js'
import { initiateOpenAIAuth, pollOpenAIToken } from './oauth/openai.js'
import { getState, setState, resetState } from './oauth-state.js'

const MAX_POLL_ATTEMPTS = 60

export function registerOAuthActions(
  context: ExtensionContext,
  tokenManager: TokenManager
): Disposable[] {
  const disposables: Disposable[] = []

  // Action: Get current OAuth state
  if (context.actions) {
    disposables.push(
      context.actions.register({
        id: 'getOAuthState',
        async execute() {
          const connected = await tokenManager.isConnected()
          const state = getState()

          // Sync state with actual token status
          if (connected && state.status !== 'awaiting') {
            setState({ status: 'connected' })
          } else if (!connected && state.status === 'connected') {
            setState({ status: 'disconnected' })
          }

          return { success: true, data: getState() }
        },
      })
    )

    // Action: Start ChatGPT OAuth flow
    disposables.push(
      context.actions.register({
        id: 'startChatGPTOAuth',
        async execute() {
          try {
            context.log.info('Starting ChatGPT OAuth device code flow')

            const result = await initiateOpenAIAuth()

            setState({
              status: 'awaiting',
              verificationUrl: result.verificationUrl,
              userCode: result.userCode,
              errorMessage: '',
            })

            // Emit event so UI updates immediately
            await context.events?.emit('openai.oauth.changed')

            // Start background polling (fire and forget)
            void pollInBackground(context, tokenManager, result.deviceCode, result.interval)

            return { success: true, data: getState() }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            context.log.error('Failed to start OAuth flow', { error: message })

            setState({
              status: 'error',
              errorMessage: message,
              verificationUrl: '',
              userCode: '',
            })

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
  }

  return disposables
}

/**
 * Background polling loop for device code authorization.
 */
async function pollInBackground(
  context: ExtensionContext,
  tokenManager: TokenManager,
  deviceCode: string,
  interval: number
): Promise<void> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(interval * 1000)

    try {
      const token = await pollOpenAIToken(undefined, deviceCode)

      if (token) {
        // Success — store tokens and update state
        await tokenManager.storeTokens(token.accessToken, token.refreshToken, token.expiresIn)

        setState({
          status: 'connected',
          verificationUrl: '',
          userCode: '',
          errorMessage: '',
        })

        context.log.info('ChatGPT OAuth connected successfully')
        await context.events?.emit('openai.oauth.changed')
        return
      }

      // null means authorization_pending — continue polling
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.log.error('OAuth polling error', { error: message, attempt })

      setState({
        status: 'error',
        errorMessage: message,
        verificationUrl: '',
        userCode: '',
      })

      await context.events?.emit('openai.oauth.changed')
      return
    }
  }

  // Timeout — polling exhausted
  context.log.warn('OAuth polling timed out after max attempts')

  setState({
    status: 'error',
    errorMessage: 'Authorization timed out. Please try again.',
    verificationUrl: '',
    userCode: '',
  })

  await context.events?.emit('openai.oauth.changed')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
