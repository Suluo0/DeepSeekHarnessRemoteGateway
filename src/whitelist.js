import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 设备白名单：runtime/whitelist.json
// { "devices": { "<token>": { "note": "...", "addedAt": 0, "lastSeen": 0 } } }
// 原则：fail closed —— 文件缺失/损坏时任何设备都不可信，但本机管理页永远可用。

const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'runtime')
const WHITELIST_PATH = join(RUNTIME_DIR, 'whitelist.json')

let devices = {}
let loaded = false
let dirtySince = 0
let lastPersist = 0

function load() {
  if (loaded) return
  loaded = true
  try {
    const parsed = JSON.parse(readFileSync(WHITELIST_PATH, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.devices && typeof parsed.devices === 'object') {
      devices = parsed.devices
    }
  } catch {
    devices = {} // 缺失或损坏 → 空名单（fail closed）
  }
}

function persist() {
  mkdirSync(dirname(WHITELIST_PATH), { recursive: true })
  const tmp = WHITELIST_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify({ devices }, null, 2) + '\n', 'utf8')
  renameSync(tmp, WHITELIST_PATH) // 原子替换，避免半截文件
  lastPersist = Date.now()
  dirtySince = 0
}

export function isAllowed(token) {
  load()
  if (typeof token !== 'string' || token.length < 10) return false
  return Object.prototype.hasOwnProperty.call(devices, token)
}

export function approve(token, note = '') {
  load()
  if (typeof token !== 'string' || token.length < 10) {
    throw new Error('invalid device token')
  }
  devices[token] = {
    note: String(note ?? '').slice(0, 120),
    addedAt: Date.now(),
    lastSeen: 0,
  }
  persist()
}

export function revoke(token) {
  load()
  if (!Object.prototype.hasOwnProperty.call(devices, token)) return false
  delete devices[token]
  persist()
  return true
}

export function touch(token) {
  load()
  const entry = devices[token]
  if (!entry) return
  entry.lastSeen = Date.now()
  // lastSeen 落盘做 30s 节流，避免每个请求都写盘
  if (Date.now() - lastPersist > 30_000) persist()
}

export function list() {
  load()
  return Object.entries(devices).map(([token, info]) => ({ token, ...info }))
}

export function whitelistPath() {
  return WHITELIST_PATH
}

// loopback 判定只信 socket 对端地址，绝不看 X-Forwarded-For 之类可伪造头
export function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}
