import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function transportFor(url) {
  return url.protocol === 'https:' ? httpsRequest : httpRequest
}

function appendForwardedFor(existing, remoteAddress) {
  if (!remoteAddress) return existing
  if (!existing) return remoteAddress
  return `${existing}, ${remoteAddress}`
}

function sanitizeProxyHeaders(headers, request, { preserveUpgrade }) {
  const next = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (!preserveUpgrade && HOP_BY_HOP_HEADERS.has(lower)) continue
    next[key] = value
  }

  next.host = headers.host ?? next.host
  next['x-forwarded-host'] = headers.host ?? ''
  next['x-forwarded-proto'] = String(headers['x-forwarded-proto'] ?? (request.socket.encrypted ? 'https' : 'http'))
  next['x-forwarded-for'] = appendForwardedFor(headers['x-forwarded-for'], request.socket.remoteAddress)
  return next
}

function applyLoopbackHeaders(headers, upstreamUrl) {
  const next = { ...headers }
  next.host = upstreamUrl.host
  delete next.origin
  delete next.referer
  delete next['sec-fetch-site']
  delete next['sec-fetch-mode']
  delete next['sec-fetch-dest']
  delete next['sec-fetch-user']
  delete next['sec-websocket-origin']
  return next
}

function copyResponseHeaders(sourceHeaders, response) {
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    response.setHeader(key, value)
  }
}

function writeUpgradeResponse(socket, statusCode, statusMessage, headers) {
  const lines = [`HTTP/1.1 ${statusCode} ${statusMessage}`]
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) lines.push(`${key}: ${entry}`)
      continue
    }
    lines.push(`${key}: ${value}`)
  }
  lines.push('', '')
  socket.write(lines.join('\r\n'))
}

export function proxyHttpRequest(request, response, config) {
  return new Promise((resolve, reject) => {
    const upstreamUrl = new URL(request.url ?? '/', config.upstream.origin)
    const transport = transportFor(upstreamUrl)
    let headers = sanitizeProxyHeaders(request.headers, request, { preserveUpgrade: false })
    if (config.upstream.loopbackMode) {
      headers = applyLoopbackHeaders(headers, upstreamUrl)
    }

    const upstreamRequest = transport(upstreamUrl, {
      method: request.method,
      headers,
    }, (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502
      if (upstreamResponse.statusMessage) response.statusMessage = upstreamResponse.statusMessage
      copyResponseHeaders(upstreamResponse.headers, response)
      upstreamResponse.pipe(response)
      upstreamResponse.on('end', resolve)
    })

    upstreamRequest.on('error', reject)

    if (request.method === 'GET' || request.method === 'HEAD') {
      upstreamRequest.end()
      return
    }

    request.pipe(upstreamRequest)
  })
}

export function proxyWebSocketUpgrade(request, socket, head, config) {
  const upstreamUrl = new URL(request.url ?? '/', config.upstream.origin)
  const transport = transportFor(upstreamUrl)
  let headers = sanitizeProxyHeaders(request.headers, request, { preserveUpgrade: true })
  if (config.upstream.loopbackMode) {
    headers = applyLoopbackHeaders(headers, upstreamUrl)
  }

  const upstreamRequest = transport(upstreamUrl, {
    method: request.method ?? 'GET',
    headers,
  })

  upstreamRequest.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    writeUpgradeResponse(
      socket,
      upstreamResponse.statusCode ?? 101,
      upstreamResponse.statusMessage ?? 'Switching Protocols',
      upstreamResponse.headers,
    )

    if (head.length > 0) upstreamSocket.write(head)
    if (upstreamHead.length > 0) socket.write(upstreamHead)

    socket.pipe(upstreamSocket)
    upstreamSocket.pipe(socket)

    const destroyBoth = () => {
      socket.destroy()
      upstreamSocket.destroy()
    }
    socket.on('error', destroyBoth)
    upstreamSocket.on('error', destroyBoth)
  })

  upstreamRequest.on('response', (upstreamResponse) => {
    writeUpgradeResponse(
      socket,
      upstreamResponse.statusCode ?? 502,
      upstreamResponse.statusMessage ?? 'Bad Gateway',
      {
        'content-type': 'text/plain; charset=utf-8',
        connection: 'close',
      },
    )
    upstreamResponse.resume()
    socket.destroy()
  })

  upstreamRequest.on('error', (error) => {
    writeUpgradeResponse(socket, 502, 'Bad Gateway', {
      'content-type': 'text/plain; charset=utf-8',
      connection: 'close',
    })
    socket.end(`Upstream WebSocket failed: ${error.message}`)
  })

  upstreamRequest.end()
}
