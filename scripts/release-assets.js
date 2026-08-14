import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const DIST_DIR = join(ROOT_DIR, 'dist')
const RELEASE_ASSETS_DIR = join(ROOT_DIR, 'release-assets')
const packageJson = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'))

const TARGETS = [
  'windows-x64',
  'macos-arm64',
  'macos-amd64',
  'linux-amd64',
  'linux-arm64',
]

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/release-assets.js <target>')
  console.log('  node scripts/release-assets.js --all')
  console.log('')
  console.log(`Available targets: ${TARGETS.join(', ')}`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const wantsAll = args.includes('--all')
  const positional = args.filter((arg) => !arg.startsWith('--'))

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  if (wantsAll) {
    return TARGETS
  }

  if (positional.length !== 1 || !TARGETS.includes(positional[0])) {
    printUsage()
    process.exit(1)
  }

  return [positional[0]]
}

function bundleDirForTarget(target) {
  return join(DIST_DIR, `dsh-remote-gateway-v${packageJson.version}-${target}`)
}

function zipPathForTarget(target) {
  return join(RELEASE_ASSETS_DIR, `dsh-remote-gateway-v${packageJson.version}-${target}.zip`)
}

function assertBundleExists(target) {
  const bundleDir = bundleDirForTarget(target)
  if (!existsSync(bundleDir)) {
    throw new Error(`Bundle not found for ${target}: ${bundleDir}\nRun "npm run release:bundle -- ${target}" first.`)
  }
  return bundleDir
}

function compressOnWindows(bundleDir, zipPath) {
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `if (Test-Path -LiteralPath '${zipPath.replaceAll("'", "''")}') { Remove-Item -LiteralPath '${zipPath.replaceAll("'", "''")}' -Force }`,
    `Compress-Archive -LiteralPath '${bundleDir.replaceAll("'", "''")}' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`,
  ].join('; ')

  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(`Failed to start PowerShell for zip creation: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`PowerShell zip creation failed with exit code ${String(result.status)}`)
  }
}

function compressOnUnix(bundleDir, zipPath) {
  const parentDir = resolve(bundleDir, '..')
  const bundleName = basename(bundleDir)
  const result = spawnSync('zip', ['-r', '-q', zipPath, bundleName], {
    cwd: parentDir,
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(`Failed to start zip command: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`zip command failed with exit code ${String(result.status)}`)
  }
}

function compressBundle(bundleDir, zipPath) {
  rmSync(zipPath, { force: true })
  if (process.platform === 'win32') {
    compressOnWindows(bundleDir, zipPath)
    return
  }
  compressOnUnix(bundleDir, zipPath)
}

function main() {
  const targets = parseArgs(process.argv)
  mkdirSync(RELEASE_ASSETS_DIR, { recursive: true })

  for (const target of targets) {
    const bundleDir = assertBundleExists(target)
    const zipPath = zipPathForTarget(target)
    compressBundle(bundleDir, zipPath)
    console.log(`[release-assets] created ${zipPath}`)
  }
}

main()
