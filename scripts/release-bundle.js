import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const DIST_DIR = join(ROOT_DIR, 'dist')
const PACKAGE_JSON_PATH = join(ROOT_DIR, 'package.json')
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'))

const TARGETS = {
  'windows-x64': {
    launcherFiles: ['start_Windows.bat', 'start.bat', 'start.ps1'],
    cloudflaredDestName: 'cloudflared.exe',
    cloudflaredCandidates: [
      join(ROOT_DIR, 'vendor', 'cloudflared', 'windows-x64', 'cloudflared.exe'),
      join(ROOT_DIR, 'bin', 'cloudflared.exe'),
    ],
  },
  'macos-arm64': {
    launcherFiles: ['start_Mac_or_Linux.sh', 'start.sh', 'start.command'],
    cloudflaredDestName: 'cloudflared',
    cloudflaredCandidates: [
      join(ROOT_DIR, 'vendor', 'cloudflared', 'macos-arm64', 'cloudflared'),
      join(ROOT_DIR, 'bin', 'cloudflared-macos-arm64'),
    ],
  },
  'macos-amd64': {
    launcherFiles: ['start_Mac_or_Linux.sh', 'start.sh', 'start.command'],
    cloudflaredDestName: 'cloudflared',
    cloudflaredCandidates: [
      join(ROOT_DIR, 'vendor', 'cloudflared', 'macos-amd64', 'cloudflared'),
      join(ROOT_DIR, 'bin', 'cloudflared-macos-amd64'),
    ],
  },
  'linux-amd64': {
    launcherFiles: ['start_Mac_or_Linux.sh', 'start.sh'],
    cloudflaredDestName: 'cloudflared',
    cloudflaredCandidates: [
      join(ROOT_DIR, 'vendor', 'cloudflared', 'linux-amd64', 'cloudflared'),
      join(ROOT_DIR, 'bin', 'cloudflared-linux-amd64'),
    ],
  },
  'linux-arm64': {
    launcherFiles: ['start_Mac_or_Linux.sh', 'start.sh'],
    cloudflaredDestName: 'cloudflared',
    cloudflaredCandidates: [
      join(ROOT_DIR, 'vendor', 'cloudflared', 'linux-arm64', 'cloudflared'),
      join(ROOT_DIR, 'bin', 'cloudflared-linux-arm64'),
    ],
  },
}

const ROOT_FILES = [
  '.gitignore',
  'README.md',
  'INSTALL.md',
  'FAQ.md',
  'RELEASE_CHECKLIST.md',
  'config.json',
  'package.json',
  'package-lock.json',
  'start_Windows.bat',
  'start.bat',
  'start.ps1',
  'start_Mac_or_Linux.sh',
  'start.sh',
  'start.command',
]

const ROOT_DIRECTORIES = [
  'src',
  'scripts',
  'runtime',
]

function listTargets() {
  return Object.keys(TARGETS)
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/release-bundle.js <target>')
  console.log('  node scripts/release-bundle.js --all')
  console.log('  node scripts/release-bundle.js --all --allow-missing')
  console.log('')
  console.log(`Available targets: ${listTargets().join(', ')}`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const allowMissing = args.includes('--allow-missing')
  const wantsAll = args.includes('--all')
  const positional = args.filter((arg) => !arg.startsWith('--'))

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  if (wantsAll) {
    return {
      targets: listTargets(),
      allowMissing,
    }
  }

  if (positional.length !== 1 || !TARGETS[positional[0]]) {
    printUsage()
    process.exit(1)
  }

  return {
    targets: [positional[0]],
    allowMissing,
  }
}

function ensureCleanDirectory(path) {
  rmSync(path, { recursive: true, force: true })
  mkdirSync(path, { recursive: true })
}

function resolveCloudflaredSource(targetName) {
  const target = TARGETS[targetName]
  return target.cloudflaredCandidates.find((candidate) => existsSync(candidate)) ?? null
}

function copyFileIfExists(source, destination) {
  if (!existsSync(source)) return
  cpSync(source, destination, { recursive: true })
}

function removeLogsFromRuntime(runtimeDir) {
  if (!existsSync(runtimeDir)) return
  for (const entry of readdirSync(runtimeDir)) {
    const entryPath = join(runtimeDir, entry)
    const entryStats = statSync(entryPath)
    if (entryStats.isFile() && entry !== '.gitkeep') {
      rmSync(entryPath, { force: true })
    }
  }
}

function removeBundledCloudflaredReadme(binDir) {
  const readmePath = join(binDir, 'README.md')
  if (existsSync(readmePath)) {
    rmSync(readmePath, { force: true })
  }
}

function writeBundleReadme(bundleDir, targetName, cloudflaredSource) {
  const target = TARGETS[targetName]
  const content = [
    `DSH Remote Gateway ${packageJson.version}`,
    '',
    `Target: ${targetName}`,
    `Bundled cloudflared: ${basename(cloudflaredSource)}`,
    '',
    'Start here:',
    target.launcherFiles.map((file) => `- ${file}`).join('\n'),
    '',
    'Before startup:',
    '- Make sure DeepSeek Harness Web is already running locally.',
    '- If needed, edit config.json to match your upstream port.',
  ].join('\n')

  writeFileSync(join(bundleDir, 'BUNDLE_INFO.txt'), `${content}\n`, 'utf8')
}

function buildTarget(targetName, allowMissing) {
  const target = TARGETS[targetName]
  const cloudflaredSource = resolveCloudflaredSource(targetName)

  if (!cloudflaredSource) {
    if (allowMissing) {
      console.warn(`[release-bundle] skipping ${targetName}: missing cloudflared binary`)
      return null
    }
    throw new Error(`Missing cloudflared binary for ${targetName}. Expected one of:\n${target.cloudflaredCandidates.join('\n')}`)
  }

  const bundleName = `dsh-remote-gateway-v${packageJson.version}-${targetName}`
  const bundleDir = join(DIST_DIR, bundleName)
  const bundleBinDir = join(bundleDir, 'bin')

  ensureCleanDirectory(bundleDir)

  for (const file of ROOT_FILES) {
    copyFileIfExists(join(ROOT_DIR, file), join(bundleDir, file))
  }

  for (const directory of ROOT_DIRECTORIES) {
    copyFileIfExists(join(ROOT_DIR, directory), join(bundleDir, directory))
  }

  mkdirSync(bundleBinDir, { recursive: true })
  cpSync(cloudflaredSource, join(bundleBinDir, target.cloudflaredDestName))
  removeBundledCloudflaredReadme(bundleBinDir)
  removeLogsFromRuntime(join(bundleDir, 'runtime'))
  writeBundleReadme(bundleDir, targetName, cloudflaredSource)

  return {
    targetName,
    bundleDir,
    cloudflaredSource,
  }
}

function writeDistOverview(results) {
  const lines = [
    'DSH Remote Gateway release bundles',
    '',
    ...results.map((result) => `- ${result.targetName}: ${result.bundleDir}`),
    '',
    'Each bundle contains a platform-specific cloudflared binary under bin/.',
  ]
  writeFileSync(join(DIST_DIR, 'README.txt'), `${lines.join('\n')}\n`, 'utf8')
}

function main() {
  const { targets, allowMissing } = parseArgs(process.argv)
  mkdirSync(DIST_DIR, { recursive: true })

  const results = []
  for (const targetName of targets) {
    const built = buildTarget(targetName, allowMissing)
    if (built) {
      console.log(`[release-bundle] built ${targetName}`)
      console.log(`  ${built.bundleDir}`)
      results.push(built)
    }
  }

  if (results.length === 0) {
    throw new Error('No release bundles were produced')
  }

  writeDistOverview(results)
}

main()
