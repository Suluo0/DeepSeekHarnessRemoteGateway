import { randomBytes, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = join(ROOT_DIR, 'config.json')
const RUNTIME_DIR = join(ROOT_DIR, 'runtime')

const DEFAULT_CONFIG = {
  server: {
    bindAddress: '127.0.0.1',
    bindPort: 8787,
  },
  upstream: {
    origin: 'http://127.0.0.1:3080',
    loopbackMode: null,
  },
  auth: {
    password: null,
    sessionSecret: null,
    cookieName: 'dsh_remote_session',
    sessionTtlHours: 24 * 7,
    secureCookies: false,
  },
  dsh: {
    command: null,
  },
  tunnel: {
    enabled: true,
    mode: 'quick',
    cloudflaredPath: null,
  },
  share: {
    openOnStart: true,
  },
}

function ensureRuntimeFiles() {
  mkdirSync(RUNTIME_DIR, { recursive: true })
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
  }
}

function readInteger(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, received ${JSON.stringify(value)}`)
  }
  return parsed
}

function boolFromValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function readUpstreamOrigin(value) {
  const raw = value ?? 'http://127.0.0.1:3080'
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`REMOTE_GATEWAY_UPSTREAM_ORIGIN must be http(s), received ${raw}`)
  }
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const output = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (
      value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && base[key] !== null
      && typeof base[key] === 'object'
      && !Array.isArray(base[key])
    ) {
      output[key] = deepMerge(base[key], value)
    } else {
      output[key] = value
    }
  }
  return output
}

function loadConfigFile() {
  ensureRuntimeFiles()
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to parse ${CONFIG_PATH}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function resolveCloudflaredPath(value) {
  if (value) {
    const trimmed = String(value).trim()
    if (isAbsolute(trimmed)) return trimmed
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.')) {
      return resolve(ROOT_DIR, trimmed)
    }
    return trimmed
  }

  const candidates = process.platform === 'win32'
    ? [
        resolve(ROOT_DIR, 'bin', 'cloudflared.exe'),
        resolve(ROOT_DIR, 'bin', 'cloudflared'),
        'cloudflared.exe',
        'cloudflared',
      ]
    : [
        resolve(ROOT_DIR, 'bin', 'cloudflared'),
        'cloudflared',
      ]

  return candidates.find((candidate) => isAbsolute(candidate) && existsSync(candidate)) ?? candidates.at(-1)
}

function generateDefaultPassword() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function generateDefaultSessionSecret() {
  return randomBytes(24).toString('base64url')
}

export function resolveGatewayConfig(env = process.env) {
  const fileConfig = loadConfigFile()
  const merged = deepMerge(DEFAULT_CONFIG, fileConfig)

  const tunnelEnabled = boolFromValue(env.REMOTE_GATEWAY_TUNNEL_ENABLED, boolFromValue(merged.tunnel?.enabled, true))
  const tunnelMode = env.REMOTE_GATEWAY_TUNNEL_MODE ?? merged.tunnel?.mode ?? 'quick'

  const password = env.REMOTE_GATEWAY_PASSWORD
    ?? merged.auth?.password
    ?? generateDefaultPassword()

  const sessionSecret = env.REMOTE_GATEWAY_SESSION_SECRET
    ?? merged.auth?.sessionSecret
    ?? generateDefaultSessionSecret()

  const upstreamLoopbackMode = env.REMOTE_GATEWAY_UPSTREAM_LOOPBACK_MODE !== undefined
    ? boolFromValue(env.REMOTE_GATEWAY_UPSTREAM_LOOPBACK_MODE, false)
    : merged.upstream?.loopbackMode === null || merged.upstream?.loopbackMode === undefined
      ? tunnelEnabled && tunnelMode === 'quick'
      : boolFromValue(merged.upstream?.loopbackMode, false)

  return {
    paths: {
      rootDir: ROOT_DIR,
      configPath: CONFIG_PATH,
      runtimeDir: RUNTIME_DIR,
    },
    server: {
      bindAddress: env.REMOTE_GATEWAY_BIND_ADDRESS ?? merged.server?.bindAddress ?? '127.0.0.1',
      bindPort: readInteger(
        env.REMOTE_GATEWAY_BIND_PORT ?? merged.server?.bindPort,
        8787,
        'REMOTE_GATEWAY_BIND_PORT',
      ),
    },
    upstream: {
      origin: readUpstreamOrigin(env.REMOTE_GATEWAY_UPSTREAM_ORIGIN ?? merged.upstream?.origin),
      loopbackMode: upstreamLoopbackMode,
    },
    auth: {
      password,
      sessionSecret,
      cookieName: env.REMOTE_GATEWAY_COOKIE_NAME ?? merged.auth?.cookieName ?? 'dsh_remote_session',
      sessionTtlMs: readInteger(
        env.REMOTE_GATEWAY_SESSION_TTL_HOURS ?? merged.auth?.sessionTtlHours,
        24 * 7,
        'REMOTE_GATEWAY_SESSION_TTL_HOURS',
      ) * 60 * 60 * 1000,
      secureCookies: boolFromValue(
        env.REMOTE_GATEWAY_SECURE_COOKIES,
        boolFromValue(merged.auth?.secureCookies, false),
      ),
    },
    dsh: {
      command: env.REMOTE_GATEWAY_DSH_COMMAND?.trim() || merged.dsh?.command || undefined,
    },
    tunnel: {
      enabled: tunnelEnabled,
      mode: tunnelMode,
      cloudflaredPath: resolveCloudflaredPath(env.REMOTE_GATEWAY_CLOUDFLARED_PATH ?? merged.tunnel?.cloudflaredPath ?? null),
    },
    share: {
      openOnStart: boolFromValue(env.REMOTE_GATEWAY_SHARE_OPEN_ON_START, boolFromValue(merged.share?.openOnStart, true)),
    },
  }
}
