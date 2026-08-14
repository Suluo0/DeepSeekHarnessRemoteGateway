import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolveGatewayConfig } from './config.js'
import {
  applySessionCookie,
  clearSessionCookie,
  isPasswordValid,
  requestIsAuthenticated,
} from './auth.js'
import { startManagedDsh } from './dsh.js'
import { proxyHttpRequest, proxyWebSocketUpgrade } from './proxy.js'
import { prepareShareArtifacts, printShareSummary } from './share.js'
import { startTunnel } from './tunnel.js'

function sendHtml(response, statusCode, html) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(html)
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload, null, 2))
}

function redirect(response, location) {
  response.statusCode = 302
  response.setHeader('location', location)
  response.end()
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function normalizeNext(value) {
  if (!value || !value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

function renderLoginPage({ error, next, upstreamOrigin }) {
  const errorBlock = error
    ? `<p class="error">${escapeHtml(error)}</p>`
    : '<p class="hint">Sign in to continue to DeepSeek Harness Web.</p>'
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DSH Remote Gateway</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        background:
          radial-gradient(circle at top, rgba(125, 158, 248, 0.2), transparent 28%),
          linear-gradient(180deg, #fafbff, #f3f6fb);
        color: #151b26;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1rem;
      }
      .card {
        width: min(100%, 420px);
        padding: 1.5rem;
        border-radius: 28px;
        background: rgba(255,255,255,0.9);
        box-shadow: 0 18px 44px rgba(84, 99, 131, 0.14);
        border: 1px solid rgba(21, 27, 38, 0.08);
      }
      h1 {
        margin: 0 0 0.3rem;
        font-size: 2rem;
        letter-spacing: -0.04em;
      }
      p {
        margin: 0 0 1rem;
        color: rgba(21, 27, 38, 0.66);
      }
      .meta {
        margin-top: 1rem;
        font-size: 0.9rem;
      }
      label {
        display: block;
        font-size: 0.86rem;
        margin-bottom: 0.45rem;
        color: rgba(21, 27, 38, 0.8);
      }
      input {
        width: 100%;
        padding: 0.95rem 1rem;
        border-radius: 18px;
        border: 1px solid rgba(21, 27, 38, 0.1);
        background: #f8faff;
        margin-bottom: 1rem;
        font: inherit;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 999px;
        background: #151b26;
        color: #fff;
        padding: 0.9rem 1rem;
        font: inherit;
      }
      .error {
        color: #c14b4b;
      }
      .hint {
        color: rgba(21, 27, 38, 0.66);
      }
    </style>
  </head>
  <body>
    <main class="card">
      <p>DeepSeek Harness Remote Gateway</p>
      <h1>Remote access</h1>
      ${errorBlock}
      <form method="post" action="/_gateway/login">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label for="password">Access password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Continue</button>
      </form>
      <p class="meta">Upstream: ${escapeHtml(upstreamOrigin)}</p>
    </main>
  </body>
</html>`
}

function readRequestBody(request, limitBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    request.on('data', (chunk) => {
      total += chunk.length
      if (total > limitBytes) {
        reject(new Error(`Request body exceeded ${String(limitBytes)} bytes`))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function probeUpstream(config) {
  try {
    const response = await fetch(new URL('/', config.upstream.origin), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000),
    })
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function handleGatewayRequest(request, response, config, runtimeState) {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/_gateway/health') {
    const upstream = await probeUpstream(config)
    sendJson(response, upstream.ok ? 200 : 503, {
      service: 'dsh-remote-gateway',
      authenticated: requestIsAuthenticated(request, config.auth),
      upstream,
      publicUrl: runtimeState.publicUrl,
      password: config.auth.password,
      timestamp: new Date().toISOString(),
    })
    return true
  }

  if (url.pathname === '/_gateway/login' && request.method === 'GET') {
    sendHtml(response, 200, renderLoginPage({
      error: '',
      next: normalizeNext(url.searchParams.get('next') ?? '/'),
      upstreamOrigin: config.upstream.origin.toString(),
    }))
    return true
  }

  if (url.pathname === '/_gateway/login' && request.method === 'POST') {
    const body = await readRequestBody(request)
    const form = new URLSearchParams(body)
    const next = normalizeNext(form.get('next') ?? '/')
    if (!isPasswordValid(form.get('password') ?? '', config.auth.password)) {
      sendHtml(response, 401, renderLoginPage({
        error: 'Incorrect password.',
        next,
        upstreamOrigin: config.upstream.origin.toString(),
      }))
      return true
    }
    applySessionCookie(response, request, config.auth)
    redirect(response, next)
    return true
  }

  if (url.pathname === '/_gateway/logout' && request.method === 'POST') {
    clearSessionCookie(response, config.auth)
    redirect(response, '/_gateway/login')
    return true
  }

  return false
}

function sendUnauthorized(response, request) {
  const accept = String(request.headers.accept ?? '')
  const wantsHtml = accept.includes('text/html') || accept.includes('*/*')
  if (wantsHtml) {
    redirect(response, `/_gateway/login?next=${encodeURIComponent(request.url ?? '/')}`)
    return
  }
  sendJson(response, 401, { error: 'Authentication required' })
}

export async function startRemoteGateway(input = process.env) {
  const config = resolveGatewayConfig(input)
  const managedDsh = startManagedDsh(config.dsh.command)
  const runtimeState = {
    publicUrl: null,
  }

  const server = createServer(async (request, response) => {
    try {
      const handled = await handleGatewayRequest(request, response, config, runtimeState)
      if (handled) return

      if (!requestIsAuthenticated(request, config.auth)) {
        sendUnauthorized(response, request)
        return
      }

      await proxyHttpRequest(request, response, config)
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname.startsWith('/_gateway/')) {
        socket.destroy()
        return
      }
      if (!requestIsAuthenticated(request, config.auth)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      proxyWebSocketUpgrade(request, socket, head, config)
    } catch {
      socket.destroy()
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.server.bindPort, config.server.bindAddress, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const localUrl = `http://${config.server.bindAddress}:${String(config.server.bindPort)}`
  console.log(`[remote-gateway] listening on ${localUrl}`)
  console.log(`[remote-gateway] proxying to ${config.upstream.origin.toString()}`)
  console.log(`[remote-gateway] password ${config.auth.password}`)
  if (config.upstream.loopbackMode) {
    console.log('[remote-gateway] upstream loopback mode enabled')
  }
  if (config.dsh.command) {
    console.log('[remote-gateway] managing a local dsh web process')
  }

  let tunnel = null
  let share = null
  if (config.tunnel.enabled) {
    tunnel = await startTunnel(config)
    runtimeState.publicUrl = tunnel.publicUrl
    share = await prepareShareArtifacts(config, tunnel.publicUrl)
    printShareSummary(share)
    if (config.share.openOnStart) {
      const opened = await share.open()
      if (!opened) {
        console.log('[remote-gateway] open the share screen manually if your desktop has no default opener')
      }
    }
  }

  return {
    config,
    tunnel,
    share,
    async close() {
      await tunnel?.close()
      await managedDsh?.close()
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

async function main() {
  const runtime = await startRemoteGateway(process.env)
  const shutdown = async () => {
    process.off('SIGINT', shutdown)
    process.off('SIGTERM', shutdown)
    await runtime.close()
  }
  process.on('SIGINT', () => { void shutdown() })
  process.on('SIGTERM', () => { void shutdown() })
}

const isDirectExecution = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectExecution) {
  void main().catch((error) => {
    console.error('[remote-gateway] failed to start')
    console.error(error)
    process.exitCode = 1
  })
}
