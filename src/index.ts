/**
 * OpenAI AI Provider Extension for Stina
 *
 * Connects Stina to OpenAI's AI models including GPT-4o, o1, o3, and o4-mini.
 *
 * @module stina-ext-openai
 */

import { initializeExtension, type ExtensionContext, type Disposable } from '@stina/extension-api/runtime'

import { createOpenAIProvider } from './provider.js'

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

  const provider = createOpenAIProvider(context)
  const disposable = context.providers.register(provider)

  context.log.info('OpenAI provider registered successfully')

  return disposable
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
