/**
 * Local HTTP callback server for OAuth Authorization Code Flow.
 * Starts a temporary server on localhost to receive the authorization code redirect.
 */

import { createServer, type Server } from 'node:http'
import { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_TIMEOUT_MS } from '../constants.js'
import type { CallbackResult } from '../types.js'

export interface CallbackServer {
  /** Wait for the OAuth callback to arrive. Resolves with the code and state. */
  waitForCallback(): Promise<CallbackResult>
  /** Close the server and clean up resources. */
  close(): void
}

/** Escape HTML special characters to prevent XSS in error pages. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Login Successful</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{color:#22c55e;margin:0 0 .5rem}p{color:#666;margin:0}</style></head>
<body><div class="card"><h1>&#10003; Login Successful</h1><p>You can close this window and return to Stina.</p></div></body></html>`

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>Login Failed</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{color:#ef4444;margin:0 0 .5rem}p{color:#666;margin:0}</style></head>
<body><div class="card"><h1>&#10007; Login Failed</h1><p>${escapeHtml(message)}</p></div></body></html>`
}

/**
 * Start a local HTTP server to receive the OAuth callback.
 * The server listens on 127.0.0.1 at the configured port and waits for
 * a GET request to /auth/callback with code and state parameters.
 */
export function startCallbackServer(): CallbackServer {
  let server: Server | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let settled = false

  const callbackPromise = new Promise<CallbackResult>((resolve, reject) => {
    server = createServer((req, res) => {
      if (settled) {
        res.writeHead(404)
        res.end()
        return
      }

      const url = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`)

      if (url.pathname !== '/auth/callback' || req.method !== 'GET') {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
        return
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        const message = errorDescription || error
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorHtml(message))
        settled = true
        reject(new Error(`OAuth error: ${message}`))
        return
      }

      if (!code || !state) {
        const message = 'Missing code or state parameter'
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorHtml(message))
        settled = true
        reject(new Error(message))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(SUCCESS_HTML)
      settled = true
      resolve({ code, state })
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${OAUTH_CALLBACK_PORT} is already in use. Please close any other application using this port and try again.`
        ))
      } else {
        reject(err)
      }
    })

    server.listen(OAUTH_CALLBACK_PORT, '127.0.0.1')

    timeoutHandle = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('Authorization timed out. Please try again.'))
      }
    }, OAUTH_CALLBACK_TIMEOUT_MS)
  })

  return {
    waitForCallback(): Promise<CallbackResult> {
      return callbackPromise
    },
    close(): void {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      if (server) {
        server.close()
        server = null
      }
    },
  }
}
