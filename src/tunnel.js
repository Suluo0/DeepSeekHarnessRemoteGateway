import { access } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

const QUICK_TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu

function isFilesystemPath(value) {
  return isAbsolute(value) || value.includes('/') || value.includes('\\')
}

async function assertCloudflaredExists(path) {
  if (!isFilesystemPath(path)) {
    return
  }
  try {
    await access(path)
  } catch {
    throw new Error(`cloudflared not found at ${path}`)
  }
}

export async function startTunnel(config) {
  if (!config.tunnel.enabled) {
    return null
  }
  if (config.tunnel.mode !== 'quick') {
    throw new Error(`Unsupported tunnel mode: ${config.tunnel.mode}`)
  }

  await assertCloudflaredExists(config.tunnel.cloudflaredPath)

  const child = spawn(config.tunnel.cloudflaredPath, ['tunnel', '--url', `http://${config.server.bindAddress}:${String(config.server.bindPort)}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let settled = false
  let resolveReady
  let rejectReady
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const onLine = (line) => {
    console.log(`[remote-gateway:tunnel] ${line}`)
    if (settled) return
    const match = line.match(QUICK_TUNNEL_PATTERN)
    if (!match) return
    settled = true
    resolveReady(match[0])
  }

  const stdout = createInterface({ input: child.stdout })
  const stderr = createInterface({ input: child.stderr })
  stdout.on('line', onLine)
  stderr.on('line', onLine)

  child.once('error', (error) => {
    if (settled) return
    settled = true
    rejectReady(new Error(`Failed to start cloudflared (${config.tunnel.cloudflaredPath}): ${error instanceof Error ? error.message : 'Unknown error'}`))
  })

  child.once('exit', (code, signal) => {
    if (!settled) {
      settled = true
      rejectReady(new Error(`cloudflared exited before Quick Tunnel URL was ready (code=${String(code)}, signal=${String(signal)})`))
    }
  })

  const publicUrl = await Promise.race([
    ready,
    new Promise((_, reject) => {
      setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('Timed out waiting for Quick Tunnel URL'))
        }
      }, 45_000)
    }),
  ])

  return {
    publicUrl,
    async close() {
      stdout.close()
      stderr.close()
      if (child.killed || child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 5_000)
        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    },
  }
}
