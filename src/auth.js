import { randomBytes } from 'node:crypto'

// 设备令牌认证：白名单制，无密码。cookie 即凭证（192bit 随机）。
export const DEVICE_COOKIE = 'dsh_device'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

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

export function newDeviceToken() {
  return randomBytes(24).toString('base64url')
}

export function readDeviceToken(request) {
  const cookies = parseCookies(request.headers.cookie)
  const token = cookies[DEVICE_COOKIE]
  return typeof token === 'string' && TOKEN_PATTERN.test(token) ? token : null
}

export function applyDeviceCookie(response, request, token) {
  const forwardedProto = String(request.headers['x-forwarded-proto'] ?? '')
  const secure = forwardedProto.split(',')[0]?.trim() === 'https'
  const parts = [
    DEVICE_COOKIE + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + String(365 * 24 * 3600),
  ]
  if (secure) parts.push('Secure')
  response.setHeader('set-cookie', parts.join('; '))
}
