import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { startRemoteGateway } from '../src/index.js'

const PORT = 18987
const BASE = 'http://127.0.0.1:' + PORT

let upstream
let gateway

test.before(async () => {
  upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('dsh-web-ok')
  })
  upstream.listen(18999, '127.0.0.1')
  await once(upstream, 'listening')
  process.env.REMOTE_GATEWAY_TUNNEL_ENABLED = '0'
  process.env.REMOTE_GATEWAY_SHARE_OPEN_ON_START = '0'
  process.env.REMOTE_GATEWAY_BIND_PORT = String(PORT)
  process.env.REMOTE_GATEWAY_UPSTREAM_ORIGIN = 'http://127.0.0.1:18999'
  gateway = await startRemoteGateway(process.env)
})

test.after(async () => {
  await gateway?.close()
  upstream?.close()
})

async function req(path, { cookie } = {}) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  })
  const text = await res.text()
  return { status: res.status, text, setCookie: res.headers.get('set-cookie') ?? '' }
}

const cookieOf = (r) => r.setCookie.split(';')[0]
const tokenOf = (r) => cookieOf(r).split('=')[1]

test('1. 未授权设备被挡：门禁页无验证码、下发设备 cookie、不代理上游', async () => {
  const r = await req('/')
  assert.notEqual(r.text, 'dsh-web-ok')
  const m = r.setCookie.match(/dsh_device=([A-Za-z0-9_-]{10,})/)
  assert.ok(m, '应设置 dsh_device cookie')
  assert.ok(!/\b\d{2}\b/.test(r.text), '门禁页不应显示两位数验证码')
})

test('2. 直接批准流程：受控端批准 → 设备入白名单 → 可访问上游', async () => {
  const first = await req('/')
  const cookie = cookieOf(first)
  const token = tokenOf(first)
  const { listPending, approvePending } = await import('../src/pending.js')
  const pending = listPending().find((p) => p.token === token)
  assert.ok(pending, '应存在该设备的待批条目')
  assert.equal(approvePending(pending.id), 'approved')
  const r = await req('/', { cookie })
  assert.equal(r.status, 200)
  assert.equal(r.text, 'dsh-web-ok')
})

test('3. 驳回：待批条目销毁且设备不入白名单', async () => {
  const first = await req('/')
  const cookie = cookieOf(first)
  const token = tokenOf(first)
  const { listPending, rejectPending } = await import('../src/pending.js')
  const pending = listPending().find((p) => p.token === token)
  assert.ok(pending, '应存在该设备的待批条目')
  assert.equal(rejectPending(pending.id), 'rejected')
  assert.equal(listPending().find((p) => p.token === token), undefined, '条目应被销毁')
  const r = await req('/', { cookie })
  assert.notEqual(r.text, 'dsh-web-ok')
})

test('4. /_gateway/health 不含 password 字段', async () => {
  const r = await req('/_gateway/health')
  assert.ok(!r.text.includes('"password"'))
})

test('5. 吊销设备后立即被挡回', async () => {
  const first = await req('/')
  const cookie = cookieOf(first)
  const token = tokenOf(first)
  const { listPending, approvePending } = await import('../src/pending.js')
  const { revoke } = await import('../src/whitelist.js')
  const pending = listPending().find((p) => p.token === token)
  approvePending(pending.id)
  assert.equal((await req('/', { cookie })).text, 'dsh-web-ok')
  revoke(token)
  assert.notEqual((await req('/', { cookie })).text, 'dsh-web-ok')
})

test('6. loopback 判定只信 socket 地址', async () => {
  const { isLoopbackAddress } = await import('../src/whitelist.js')
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('8.8.8.8'), false)
})

test('7. cloudflared 缺失时网关仍能启动（隧道失败不影响本地功能）', async () => {
  const gw = await startRemoteGateway({
    ...process.env,
    REMOTE_GATEWAY_TUNNEL_ENABLED: '1',
    REMOTE_GATEWAY_CLOUDFLARED_PATH: 'C:\\nonexistent\\cloudflared.exe',
    REMOTE_GATEWAY_BIND_PORT: '18990',
    REMOTE_GATEWAY_UPSTREAM_ORIGIN: 'http://127.0.0.1:18999',
    REMOTE_GATEWAY_SHARE_OPEN_ON_START: '0',
  })
  assert.ok(gw, '隧道失败不应阻止网关启动')
  const r = await fetch('http://127.0.0.1:18990/_gateway/health')
  assert.equal(r.status, 200)
  await gw.close()
})

test('8. 主端口（隧道可达）上的管理路径一律拒绝，即使来自 loopback；管理端口独立可用', async () => {
  // 主端口 18987 上：/_gateway/approve、/_gateway/admin 与管理 API 必须不存在（隧道转发够不到管理面）
  for (const p of ['/_gateway/approve', '/_gateway/admin', '/_gateway/api/pending', '/_gateway/api/devices']) {
    const r = await fetch(BASE + p)
    assert.ok(r.status === 404 || r.status === 403, p + ' 在主端口应拒绝，实际 ' + r.status)
  }
  // 独立管理端口（默认主端口+1 = 18988，仅 loopback 监听）可用
  const admin = await fetch('http://127.0.0.1:18988/_gateway/admin')
  assert.equal(admin.status, 200)
})

test('9. whitelist.json 损坏时 fail-closed 且可通过批准恢复', async () => {
  const { whitelistPath, isAllowed, approve } = await import('../src/whitelist.js')
  const fs = await import('node:fs')
  const backup = fs.readFileSync(whitelistPath(), 'utf8')
  try {
    fs.writeFileSync(whitelistPath(), '{broken json!!!')
    const w = await import('../src/whitelist.js?bust=' + Date.now())
    assert.equal(w.isAllowed('anytoken1234567890'), false, '损坏时任何令牌都不可信')
    w.approve('recoverytoken1234567890', '恢复测试')
    assert.equal(w.isAllowed('recoverytoken1234567890'), true, '损坏后仍可批准新设备')
  } finally {
    fs.writeFileSync(whitelistPath(), backup)
  }
})

test('10. 管理 JSON API 仅在管理端口可用', async () => {
  const pendingRes = await fetch('http://127.0.0.1:18988/_gateway/api/pending')
  assert.equal(pendingRes.status, 200)
  assert.ok(Array.isArray((await pendingRes.json()).pending), 'pending 应为数组')
  const devicesRes = await fetch('http://127.0.0.1:18988/_gateway/api/devices')
  assert.equal(devicesRes.status, 200)
  assert.ok(Array.isArray((await devicesRes.json()).devices), 'devices 应为数组')
  // 主端口（隧道可达）拒绝管理 API
  for (const p of ['/_gateway/api/pending', '/_gateway/api/devices']) {
    const r = await fetch(BASE + p)
    assert.ok(r.status === 404 || r.status === 403, p + ' 在主端口应拒绝')
  }
})
