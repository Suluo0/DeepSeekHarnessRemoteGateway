import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const REQUIRED_NODE_MAJOR = 22

function log(message) {
  console.log(`[remote-gateway:start] ${message}`)
}

function fail(message) {
  console.error(`[remote-gateway:start] ${message}`)
}

function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
  if (Number.isNaN(major) || major < REQUIRED_NODE_MAJOR) {
    throw new Error(`Node.js ${REQUIRED_NODE_MAJOR}+ is required, current version is ${process.versions.node}`)
  }
}

function dependenciesInstalled() {
  return existsSync(join(ROOT_DIR, 'node_modules', 'qrcode', 'package.json'))
}

function installDependencies() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  log('Dependencies not found, running npm install...')

  const result = spawnSync(npmCommand, ['install'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(`Failed to start ${npmCommand}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`npm install failed with exit code ${String(result.status)}`)
  }
}

function renderFailureHints() {
  console.error('')
  console.error('[remote-gateway:start] Common fixes:')
  console.error('  1. Make sure DeepSeek Harness Web is already running on the configured upstream origin.')
  console.error('  2. Make sure cloudflared exists in remote-gateway/bin/ or is installed in your PATH.')
  console.error('  3. Check remote-gateway/config.json if you changed ports, upstream, or auth settings.')
  console.error('')
}

async function main() {
  ensureNodeVersion()

  if (!dependenciesInstalled()) {
    installDependencies()
  }

  log(`Starting from ${ROOT_DIR}`)

  const child = spawn(process.execPath, [join(ROOT_DIR, 'src', 'index.js')], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
    windowsHide: false,
  })

  child.once('error', (error) => {
    fail(`Failed to start gateway: ${error.message}`)
    renderFailureHints()
    process.exitCode = 1
  })

  child.once('exit', (code, signal) => {
    if (code === 0) {
      process.exitCode = 0
      return
    }
    fail(`Gateway exited unexpectedly (code=${String(code)}, signal=${String(signal)})`)
    renderFailureHints()
    process.exitCode = code ?? 1
  })
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : 'Unknown startup error')
  renderFailureHints()
  process.exitCode = 1
})
