import { resolveGatewayConfig } from '../src/config.js'
import { startRemoteGateway, startParentLivenessGuard } from '../src/index.js'

function usage() {
  console.log([
    'Usage: node scripts/start.js',
    '',
    'Starts the gateway (tunnel + reverse proxy + device whitelist gate).',
  ].join('\n'))
}

function parseArgs(argv) {
  if (argv.length === 0) return { command: 'start' }
  if (argv.length === 1 && (argv[0] === '-h' || argv[0] === '--help')) return { command: 'help' }
  return null
}

function startWatchdog({ port, healthPath, intervalMs }) {
  const timer = setInterval(() => {
    fetch(`http://127.0.0.1:${port}${healthPath}`)
      .then((res) => { if (!res.ok) throw new Error('unhealthy') })
      .catch((err) => {
        console.error('[remote-gateway] health check failed, restarting:', err?.message || err)
        process.exit(75)
      })
      .catch(() => {})
  }, intervalMs)
  timer.unref()
}

async function ensureDshUpstream(config) {
  const probe = await fetch(config.upstream.origin.toString(), { method: 'HEAD', redirect: 'manual' })
    .then((res) => ({ ok: true, status: res.status }))
    .catch(() => ({ ok: false, status: 0 }))
  if (probe.ok) return
  if (!config.dsh.command) {
    console.error('[remote-gateway] upstream is not running and no dsh.command is configured; refusing to launch a DSH instance on my own')
    process.exit(1)
  }
  const { startManagedDsh } = await import('../src/dsh.js')
  await startManagedDsh(config.dsh)
  console.log('[remote-gateway] started DSH upstream on', config.upstream.origin)
}

function watchdogConfig(config) {
  return {
    port: config.server.bindPort,
    healthPath: '/_gateway/health',
    intervalMs: Number(process.env.REMOTE_GATEWAY_HEALTH_CHECK_MS ?? '30000'),
  }
}

async function runStart(config) {
  await ensureDshUpstream(config)
  const gateway = await startRemoteGateway(process.env)
  startWatchdog(watchdogConfig(config))
  console.log(`[remote-gateway] local http://127.0.0.1:${config.server.bindPort}`)
  console.log(`[remote-gateway] admin  http://127.0.0.1:${config.admin.port} (loopback only)`)
  if (gateway.tunnel?.url) console.log(`[remote-gateway] tunnel ${gateway.tunnel.url}`)
}

async function main() {
  // 父进程（dsh）先死 → 孤儿自清理：即使在「等待上游」阶段卡住也必须退出
  startParentLivenessGuard()
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed) {
    usage()
    process.exit(1)
  }
  if (parsed.command === 'help') {
    usage()
    return
  }
  const config = resolveGatewayConfig(process.env)
  await runStart(config)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
