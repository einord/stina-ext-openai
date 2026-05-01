/**
 * OpenAI AI Provider Extension for Stina
 *
 * Connects Stina to OpenAI's AI models including GPT-4o, o1, o3, and o4-mini.
 * Supports both API key and ChatGPT OAuth (experimental) authentication.
 *
 * @module stina-ext-openai
 */

import { initializeExtension, type ExtensionContext, type Disposable } from '@stina/extension-api/runtime'

import { createOpenAIProvider } from './provider.js'
import { createTokenManager } from './oauth/token-manager.js'
import { registerOAuthActions } from './actions.js'

/**
 * Extension activation
 *
 * Called when the extension is loaded by Stina.
 */
function activate(context: ExtensionContext): Disposable {
  if (!context.network || !context.providers) {
    throw new Error('Extension requires network and provider capabilities')
  }

  context.log.info('Activating OpenAI provider extension')

  const disposables: Disposable[] = []

  // Create token manager for OAuth (if secrets API is available)
  const tokenManager = context.secrets
    ? createTokenManager(context.secrets, context.log)
    : null

  // Register provider with OAuth support
  const provider = createOpenAIProvider(context, tokenManager)
  disposables.push(context.providers.register(provider))

  // Register OAuth actions (if actions API and token manager are available)
  if (context.actions && tokenManager) {
    const actionDisposables = registerOAuthActions(context, tokenManager)
    disposables.push(...actionDisposables)
  }

  context.log.info('OpenAI provider registered successfully')

  return {
    dispose() {
      for (const d of disposables) {
        d.dispose()
      }
    },
  }
}

/**
 * Extension deactivation
 *
 * Called when the extension is unloaded.
 * Cleanup is handled by the disposable returned from activate.
 */
function deactivate(): void {
  // Cleanup is handled by the disposable returned from activate
}

// Initialize the extension runtime
initializeExtension({ activate, deactivate })
