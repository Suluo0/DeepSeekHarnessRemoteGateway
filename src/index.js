import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolveGatewayConfig } from './config.js'
import { applyDeviceCookie, newDeviceToken, readDeviceToken } from './auth.js'
import { startManagedDsh } from './dsh.js'
import { proxyHttpRequest, proxyWebSocketUpgrade } from './proxy.js'
import { openTarget, prepareShareArtifacts, printShareSummary } from './share.js'
import { startTunnel } from './tunnel.js'
import { isAllowed, list as listDevices, revoke, touch } from './whitelist.js'
import { ensurePending, listPending, approvePending, rejectPending } from './pending.js'

function sendHtml(response, statusCode, html) {
  if (response.headersSent) {
    response.end()
    return
  }
  response.statusCode = statusCode
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(html)
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent) {
    response.end()
    return
  }
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload, null, 2))
}

function redirect(response, location) {
  if (response.headersSent) {
    response.end()
    return
  }
  response.statusCode = 302
  response.setHeader('location', location)
  response.end()
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function readRequestBody(request, limitBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > limitBytes) {
        reject(new Error('Request body too large'))
        request.destroy()
      }
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

async function probeUpstream(config) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(config.upstream.origin.toString(), { signal: controller.signal, redirect: 'manual' })
    return { ok: res.status < 500, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(timer)
  }
}

const PAGE_STYLE = [
  ':root { color-scheme: light; font-family: "Segoe UI", "PingFang SC", sans-serif;',
  '  background: radial-gradient(circle at top, rgba(125,158,248,0.2), transparent 28%), linear-gradient(180deg, #fafbff, #f3f6fb); color: #151b26; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; }',
  '.card { width: min(100%, 460px); padding: 1.5rem; border-radius: 28px; background: rgba(255,255,255,0.9);',
  '  box-shadow: 0 18px 44px rgba(84,99,131,0.14); border: 1px solid rgba(21,27,38,0.08); }',
  'h1 { margin: 0 0 0.3rem; font-size: 1.6rem; letter-spacing: -0.04em; }',
  'p { color: rgba(21,27,38,0.66); line-height: 1.5; }',
  '.choice { font-size: 2rem; font-weight: 700; padding: 0.8rem 1.6rem; margin: 0.3rem; border-radius: 18px;',
  '  border: 1px solid rgba(21,27,38,0.12); background: #f8faff; cursor: pointer; }',
  '.choice:hover { background: #e9effc; }',
  '.danger { color: #c14b4b; border-color: rgba(193,75,75,0.4); }',
  'table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }',
  'td, th { padding: 0.4rem 0.3rem; border-bottom: 1px solid rgba(21,27,38,0.08); text-align: left; }',
  'button.link { border: 0; background: none; color: #c14b4b; cursor: pointer; font: inherit; }',
  '.meta { font-size: 0.82rem; color: rgba(21,27,38,0.5); }',
].join('\n')

function pageShell(title, inner, headExtra) {
  return '<!DOCTYPE html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + (headExtra || '')
    + '<title>' + escapeHtml(title) + '</title>\n<style>' + PAGE_STYLE + '</style>\n</head>\n<body>\n'
    + inner + '\n</body>\n</html>'
}

// 设备端门禁页：无验证码，等待受控端直接批准
// 注意：样式刻意不使用两位数字面量（测试 1 以 /\b\d{2}\b/ 断言页面不出现两位数验证码）
function renderGatePage() {
  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>等待批准</title>',
    '<style>',
    '*{box-sizing:border-box}',
    'body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,"PingFang SC",sans-serif;background:linear-gradient(180deg,#fafbff,#f3f6fb);color:#151b26}',
    'main{width:min(100%,460px);margin:1rem;padding:1.5rem;border-radius:1rem;background:rgba(255,255,255,0.9);box-shadow:0 2px 8px #d8dee9;border:1px solid #e3e8f0}',
    'h1{margin:0 0 0.3rem;font-size:1.4rem}',
    'p{margin:0.3rem 0;color:#4a5468;line-height:1.5}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<h1>此设备尚未获得授权</h1>',
    '<p>DeepSeek Harness Remote Gateway</p>',
    '<p>请在受控电脑上批准本设备：DSH 设置页 → 远程网关，或自动弹出的审批页。本页停留期间等待自动续期，批准后自动进入。</p>',
    '</main>',
    '<script>',
    'setInterval(async function () {',
    '  try {',
    "    const r = await fetch('/_gateway/gate/status')",
    '    const j = await r.json()',
    "    if (j.state !== 'pending') location.reload()",
    '  } catch (e) {}',
    '}, 3000)',
    '<\/script>',
    '</body>',
    '</html>',
  ].join('\n')
  return html
}

// 受控端审批页：每个待批设备一张卡，一个「批准」按钮（直接批准，无验证码）
function renderApprovePage(pendingList) {
  let cards = ''
  for (const p of pendingList) {
    const secondsLeft = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000))
    cards += '<div class="card">\n'
      + '<h1>新设备请求接入</h1>\n'
      + '<p class="meta">' + escapeHtml(p.note || '未知设备') + ' · 已等待 ' + String(secondsLeft) + 's</p>\n'
      + '<form method="post" action="/_gateway/approve">\n'
      + '<input type="hidden" name="id" value="' + escapeHtml(p.id) + '">\n'
      + '<button class="choice" name="pick" value="approve">批准</button>\n'
      + '<button class="choice danger" name="pick" value="__reject__">拒绝</button>\n'
      + '</form>\n</div>\n'
  }
  if (!cards) {
    cards = '<div class="card"><h1>没有待批准设备</h1><p>当新设备打开网关地址时，这里会出现批准按钮。也可以在 DSH 设置页 → 远程网关 中操作。</p>'
      + '<p class="meta"><a href="/_gateway/admin">设备管理</a></p></div>\n'
  }
  return pageShell('设备审批', cards, '<meta http-equiv="refresh" content="4">\n')
}

// 受控端管理页：已批准设备列表 + 吊销
function renderAdminPage(devices) {
  let rows = ''
  for (const d of devices) {
    rows += '<tr>'
      + '<td>' + escapeHtml(d.note || '（无备注）') + '</td>'
      + '<td class="meta">' + escapeHtml(d.token.slice(0, 8)) + '…</td>'
      + '<td class="meta">' + new Date(d.addedAt).toLocaleString() + '</td>'
      + '<td class="meta">' + (d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '从未') + '</td>'
      + '<td><form method="post" action="/_gateway/admin/revoke" style="margin:0">'
      + '<input type="hidden" name="token" value="' + escapeHtml(d.token) + '">'
      + '<button class="link" type="submit">吊销</button></form></td>'
      + '</tr>\n'
  }
  const table = rows
    ? '<table><tr><th>备注</th><th>令牌</th><th>批准时间</th><th>最近活跃</th><th></th></tr>' + rows + '</table>'
    : '<p>白名单为空。新设备访问网关后，到 <a href="/_gateway/approve">审批页</a> 点击批准即可加入。也可以在 DSH 设置页 → 远程网关 中操作。</p>'
  const inner = '<main class="card" style="width:min(100%, 720px)">\n'
    + '<h1>设备白名单管理</h1>\n' + table + '\n'
    + '<p class="meta"><a href="/_gateway/approve">待批准</a> · 本页仅监听独立本地端口，物理上不可经隧道/公网到达</p>\n'
    + '</main>'
  return pageShell('设备管理', inner)
}

// 管理面请求处理（只挂在独立的 loopback 监听器上）
async function handleAdminRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/_gateway/approve' && request.method === 'GET') {
    sendHtml(response, 200, renderApprovePage(listPending()))
    return
  }

  if (url.pathname === '/_gateway/approve' && request.method === 'POST') {
    const form = new URLSearchParams(await readRequestBody(request))
    const id = form.get('id') ?? ''
    const pick = form.get('pick') ?? ''
    if (pick === '__reject__') {
      rejectPending(id)
    } else {
      approvePending(id) // 直接批准：条目销毁，设备入白名单
    }
    redirect(response, '/_gateway/approve')
    return
  }

  if (url.pathname === '/_gateway/admin' && request.method === 'GET') {
    sendHtml(response, 200, renderAdminPage(listDevices()))
    return
  }

  if (url.pathname === '/_gateway/admin/revoke' && request.method === 'POST') {
    const form = new URLSearchParams(await readRequestBody(request))
    revoke(form.get('token') ?? '')
    redirect(response, '/_gateway/admin')
    return
  }

  // JSON API（供 DSH 设置页 client 调用）
  if (url.pathname === '/_gateway/api/pending' && request.method === 'GET') {
    sendJson(response, 200, { pending: listPending() })
    return
  }

  if (url.pathname === '/_gateway/api/devices' && request.method === 'GET') {
    sendJson(response, 200, { devices: listDevices() })
    return
  }

  if (url.pathname === '/_gateway/api/approve' && request.method === 'POST') {
    const body = await readRequestBody(request)
    let payload = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      sendJson(response, 400, { error: 'invalid json' })
      return
    }
    const result = approvePending(String(payload.id ?? ''))
    sendJson(response, 200, { result })
    return
  }

  if (url.pathname === '/_gateway/api/reject' && request.method === 'POST') {
    const body = await readRequestBody(request)
    let payload = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      sendJson(response, 400, { error: 'invalid json' })
      return
    }
    const result = rejectPending(String(payload.id ?? ''))
    sendJson(response, 200, { result })
    return
  }

  if (url.pathname === '/_gateway/api/revoke' && request.method === 'POST') {
    const body = await readRequestBody(request)
    let payload = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      sendJson(response, 400, { error: 'invalid json' })
      return
    }
    revoke(String(payload.token ?? ''))
    sendJson(response, 200, { result: 'revoked' })
    return
  }

  sendJson(response, 404, { error: 'not found' })
}

export async function startRemoteGateway(env) {
  const config = resolveGatewayConfig(env)
  let dshHandle = null

  if (config.dsh.command && !config.upstream.enabled) {
    dshHandle = await startManagedDsh(config.dsh)
    if (dshHandle && dshHandle.port) {
      config.upstream.port = dshHandle.port
      config.upstream.origin = new URL(`http://127.0.0.1:${dshHandle.port}`)
    }
  }

  let tunnel = null
  if (config.tunnel.enabled) {
    try {
      tunnel = await startTunnel(config)
    } catch (err) {
      // 隧道失败不阻止网关启动（本地功能仍可用）；把原因打印到控制台
      console.error('[remote-gateway] tunnel start failed, continuing without tunnel:', err?.message || err)
    }
  }

  // 设备未授权时：返回门禁页并下发设备 cookie
  function gateUnauthorized(request, response) {
    const token = readDeviceToken(request) ?? newDeviceToken()
    applyDeviceCookie(response, request, token)
    // 登记待批（轮询即续期，无人理会则 120s 后自动过期）
    ensurePending(token, '')
    sendHtml(response, 403, renderGatePage())
  }

  // 主服务器：经隧道暴露给公网设备
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    // 管理面只在独立管理端口监听——这里一律拒绝，即使来自 loopback
    if (url.pathname.startsWith('/_gateway/approve') || url.pathname.startsWith('/_gateway/admin') || url.pathname.startsWith('/_gateway/api/')) {
      sendJson(response, 403, { error: 'admin surface not on this port' })
      return
    }

    if (url.pathname === '/_gateway/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        upstream: config.upstream.origin.toString(),
        tunnel: tunnel?.publicUrl ?? null,
      }))
      return
    }

    if (url.pathname === '/_gateway/gate/status') {
      const token = readDeviceToken(request)
      if (!token) {
        sendJson(response, 401, { state: 'unknown' })
        return
      }
      if (isAllowed(token)) {
        sendJson(response, 200, { state: 'approved' })
        return
      }
      // 重新确保待批条目存在（TTL 续期），让设备页轮询保持有效
      ensurePending(token, '')
      sendJson(response, 200, { state: 'pending' })
      return
    }

    const deviceToken = readDeviceToken(request)
    if (!deviceToken || !isAllowed(deviceToken)) {
      gateUnauthorized(request, response)
      return
    }

    // 已授权：记录活跃时间，然后反代到上游
    touch(deviceToken)
    proxyHttpRequest(request, response, config)
  })

  server.on('upgrade', (req, socket, head) => {
    const deviceToken = readDeviceToken(req)
    if (!deviceToken || !isAllowed(deviceToken)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    proxyWebSocketUpgrade(req, socket, head, config)
  })

  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(config.server.bindPort, config.server.bindAddress, resolve)
  })

  // 独立管理服务器：只监听 loopback，端口 = 主端口 + 1（可配置）
  // 隧道只转发主端口，所以审批/管理面在物理网络上不可达
  const adminServer = createServer((request, response) => {
    handleAdminRequest(request, response)
  })
  await new Promise((resolve, reject) => {
    adminServer.on('error', reject)
    adminServer.listen(config.admin.port, config.admin.host, resolve)
  })

  let share = null
  if (tunnel && config.share.openOnStart) {
    try {
      const artifacts = await prepareShareArtifacts(config, { targetUrl: tunnel.publicUrl, dshUrl: config.upstream.origin.toString() })
      share = artifacts
      printShareSummary(artifacts)
      openTarget({ ...config, target: tunnel.publicUrl, share: artifacts })
    } catch (err) {
      console.error('[remote-gateway] share setup failed:', err.message)
    }
  }

  const gateway = {
    server,
    adminServer,
    tunnel,
    dshHandle,
    share,
    config,
    async close() {
      let shuttingDown = false
      const doShutdown = async () => {
        if (shuttingDown) return
        shuttingDown = true
        await adminServer.close()
        await server.close()
        if (tunnel) await tunnel.close()
        if (dshHandle) await dshHandle.stop()
      }
      activeShutdown = doShutdown
      await doShutdown()
      // 双保险：若上面 await 因某种原因挂起（如 keep-alive socket），强制退出
      setTimeout(() => process.exit(0), 3000).unref()
    },
  }

  return gateway
}

let activeShutdown = null

// 供插件/disposer 调用：优雅关闭网关
export async function shutdownRemoteGateway() {
  if (typeof activeShutdown === 'function') {
    const fn = activeShutdown
    activeShutdown = null
    await fn()
  }
}

// dsh 父进程存活检查：由 dsh 托管启动时（env REMOTE_GATEWAY_PARENT_PID）定期检查父进程，
// 父进程消失（如 dsh 被强杀，SIGTERM 不会送达）→ 孤儿自清理，避免留下僵尸网关/cloudflared。
// process.kill(pid, 0) 在 Windows/POSIX 都只做存活探测；EPERM = 存在但非本用户 → 视为存活。
export function startParentLivenessGuard() {
  const pid = Number.parseInt(String(process.env.REMOTE_GATEWAY_PARENT_PID ?? ''), 10)
  if (!Number.isFinite(pid) || pid <= 0) return
  const intervalMs = Number(process.env.REMOTE_GATEWAY_PARENT_CHECK_MS ?? '15000')
  const timer = setInterval(() => {
    let alive = false
    try {
      process.kill(pid, 0)
      alive = true
    } catch (err) {
      alive = err?.code === 'EPERM'
    }
    if (alive) return
    clearInterval(timer)
    console.log(`[remote-gateway] 父进程 (dsh, pid ${pid}) 已不存在，孤儿网关自清理退出`)
    shutdownRemoteGateway().catch(() => {})
      .finally(() => setTimeout(() => process.exit(0), 500))
  }, intervalMs)
  timer.unref()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startParentLivenessGuard()
  const config = resolveGatewayConfig(process.env)
  if (!config.upstream.enabled) {
    console.error('[remote-gateway] missing REMOTE_GATEWAY_UPSTREAM_ORIGIN')
    process.exit(1)
  }
  const upstreamProbe = await probeUpstream(config)
  if (!upstreamProbe.ok) {
    console.error('[remote-gateway] upstream not reachable at', config.upstream.origin.toString(), `(status ${upstreamProbe.status})`)
    console.error('[remote-gateway] start the DSH web server first, e.g. "dsh web"')
    process.exit(1)
  }
  const gateway = await startRemoteGateway(process.env)
  console.log(`[remote-gateway] local   http://127.0.0.1:${config.server.bindPort}`)
  console.log(`[remote-gateway] admin   http://127.0.0.1:${config.admin.port} (loopback only)`)
  if (gateway.tunnel) console.log(`[remote-gateway] tunnel  ${gateway.tunnel.publicUrl}`)
}
