import { randomBytes } from 'node:crypto'
import { approve } from './whitelist.js'

// 待审批：设备 token → 备注 → 受控端直接批准（无验证码、无三选一）
// 安全属性：条目 120s TTL（设备轮询门禁页时自动续期，无人理会即过期）；容量上限防刷
const TTL_MS = 120_000
const MAX_PENDING = 100
const pendings = new Map()

function prune() {
  const now = Date.now()
  for (const [id, p] of pendings) {
    if (p.expiresAt <= now) pendings.delete(id)
  }
}

export function ensurePending(token, note) {
  prune()
  for (const p of pendings.values()) {
    if (p.token === token) {
      p.expiresAt = Date.now() + TTL_MS // 设备仍在轮询门禁页 → 续期
      return { pending: p, isNew: false }
    }
  }
  if (pendings.size >= MAX_PENDING) {
    const oldest = pendings.keys().next().value
    pendings.delete(oldest) // 淘汰最旧条目，防止无界增长
  }
  const pending = {
    id: randomBytes(12).toString('base64url'),
    token,
    note: String(note ?? '').slice(0, 200),
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  }
  pendings.set(pending.id, pending)
  return { pending, isNew: true }
}

export function listPending() {
  prune()
  return [...pendings.values()].map((p) => ({ ...p }))
}

export function approvePending(id) {
  prune()
  const p = pendings.get(id)
  if (!p) return 'missing'
  pendings.delete(id)
  approve(p.token, p.note)
  return 'approved'
}

export function rejectPending(id) {
  prune()
  if (!pendings.delete(id)) return 'missing'
  return 'rejected'
}
