import { createHmac, timingSafeEqual } from 'node:crypto'

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeBase64Url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64')
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function parseCookies(headerValue) {
  const cookies = {}
  if (!headerValue) return cookies
  for (const part of headerValue.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (!rawName) continue
    cookies[rawName] = rawValue.join('=')
  }
  return cookies
}

export function isPasswordValid(input, expected) {
  const actual = Buffer.from(input ?? '', 'utf8')
  const target = Buffer.from(expected, 'utf8')
  if (actual.length !== target.length) return false
  return timingSafeEqual(actual, target)
}

export function createSessionToken(secret, ttlMs, now = Date.now()) {
  const payload = JSON.stringify({ exp: now + ttlMs })
  const encoded = encodeBase64Url(payload)
  const signature = signPayload(encoded, secret)
  return `${encoded}.${signature}`
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (!token) return false
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return false
  const expectedSignature = signPayload(encoded, secret)
  const actual = Buffer.from(signature, 'utf8')
  const expected = Buffer.from(expectedSignature, 'utf8')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false

  try {
    const payload = JSON.parse(decodeBase64Url(encoded).toString('utf8'))
    return typeof payload.exp === 'number' && payload.exp > now
  } catch {
    return false
  }
}

export function requestIsAuthenticated(request, authConfig) {
  const cookies = parseCookies(request.headers.cookie)
  return verifySessionToken(cookies[authConfig.cookieName], authConfig.sessionSecret)
}

export function applySessionCookie(response, request, authConfig) {
  const token = createSessionToken(authConfig.sessionSecret, authConfig.sessionTtlMs)
  const forwardedProto = String(request.headers['x-forwarded-proto'] ?? '')
  const secure = authConfig.secureCookies || forwardedProto.split(',')[0]?.trim() === 'https'
  const parts = [
    `${authConfig.cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(authConfig.sessionTtlMs / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  response.setHeader('set-cookie', parts.join('; '))
}

export function clearSessionCookie(response, authConfig) {
  response.setHeader(
    'set-cookie',
    `${authConfig.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  )
}
