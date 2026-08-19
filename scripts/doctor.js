import { access } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { resolveGatewayConfig } from '../src/config.js'

const REQUIRED_NODE_MAJOR = 22

function printLine(status, label, detail) {
  console.log(`${status} ${label}: ${detail}`)
}

function formatBool(value) {
  return value ? 'yes' : 'no'
}

function isFilesystemPath(value) {
  return isAbsolute(value) || value.includes('/') || value.includes('\\')
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(2_500),
    })
    return {
      ok: true,
      detail: `HTTP ${response.status} ${response.statusText}`,
    }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkCloudflared(cloudflaredPath) {
  if (!isFilesystemPath(cloudflaredPath)) {
    return {
      ok: true,
      detail: `using PATH lookup (${cloudflaredPath})`,
    }
  }

  try {
    await access(cloudflaredPath)
    return {
      ok: true,
      detail: cloudflaredPath,
    }
  } catch {
    return {
      ok: false,
      detail: `not found at ${cloudflaredPath}`,
    }
  }
}

async function main() {
  console.log('DSH Remote Gateway Doctor')
  console.log('')

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
  if (Number.isNaN(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    printLine('FAIL', 'Node.js', `requires ${REQUIRED_NODE_MAJOR}+, current ${process.versions.node}`)
    process.exitCode = 1
    return
  }
  printLine('PASS', 'Node.js', process.versions.node)

  let config
  try {
    config = resolveGatewayConfig(process.env)
  } catch (error) {
    printLine('FAIL', 'config', error instanceof Error ? error.message : 'Unknown config error')
    process.exitCode = 1
    return
  }

  printLine('PASS', 'config', config.paths.configPath)
  printLine('PASS', 'upstream origin', config.upstream.origin.toString())
  printLine('PASS', 'gateway bind', `${config.server.bindAddress}:${String(config.server.bindPort)}`)
  printLine('PASS', 'tunnel enabled', formatBool(config.tunnel.enabled))
  printLine('PASS', 'share screen auto-open', formatBool(config.share.openOnStart))

  const upstreamProbe = await probeUrl(new URL('/', config.upstream.origin))
  printLine(
    upstreamProbe.ok ? 'PASS' : 'WARN',
    'upstream reachability',
    upstreamProbe.detail,
  )

  if (config.tunnel.enabled) {
    const cloudflaredCheck = await checkCloudflared(config.tunnel.cloudflaredPath)
    printLine(
      cloudflaredCheck.ok ? 'PASS' : 'WARN',
      'cloudflared',
      cloudflaredCheck.detail,
    )
  } else {
    printLine('PASS', 'cloudflared', 'not required because tunnel.enabled=false')
  }

  printLine('PASS', 'dependencies', 'none (zero npm runtime dependencies)')

  printLine('PASS', 'auth mode', 'device whitelist (password auth removed in this fork)')

  console.log('')
  console.log('Suggested next step:')
  console.log('  node scripts/start.js')
}

main().catch((error) => {
  printLine('FAIL', 'doctor', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
