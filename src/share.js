import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME = path.join(ROOT, 'runtime')
const SHARE_DIR = path.join(RUNTIME, 'share')

export function defaultShareName(dshUrl) {
  const host = new URL(dshUrl).hostname
  return `dsh-${host}`
}

export async function prepareShareArtifacts(config, { targetUrl, dshUrl }) {
  await mkdir(SHARE_DIR, { recursive: true })
  const name = config.share.name || defaultShareName(dshUrl)
  const textPath = path.join(SHARE_DIR, `${name}.txt`)
  const htmlPath = path.join(SHARE_DIR, `${name}.html`)
  const text = [
    'DeepSeek Harness 远程访问',
    '',
    `本机 DSH: ${dshUrl}`,
    `公网隧道: ${targetUrl}`,
    '',
    '手机/外部设备：浏览器打开上面的公网隧道地址；本机：打开本机 DSH 地址。',
    '首次访问会进入设备门禁页，需要在本机受控端批准该设备（DSH 设置页 → 远程网关）。',
    '批准一次后该设备即可正常访问。',
  ].join('\n')
  await writeFile(textPath, text, 'utf8')
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${name}</title>
</head>
<body>
  <h1>DeepSeek Harness 远程访问</h1>
  <p>本机 DSH：<a href="${dshUrl}">${dshUrl}</a></p>
  <p>公网隧道：<a href="${targetUrl}">${targetUrl}</a></p>
  <p>手机/外部设备请使用公网隧道地址；本机请使用本机 DSH 地址。</p>
</body>
</html>
`
  await writeFile(htmlPath, html, 'utf8')
  return {
    name,
    textPath,
    htmlPath,
  }
}

export function printShareSummary(artifacts) {
  console.log('[remote-gateway] share artifacts:')
  console.log(`  text: ${artifacts.textPath}`)
  console.log(`  html: ${artifacts.htmlPath}`)
}

export function openTarget(config) {
  try {
    const target = config.target || config.share?.targetUrl || config.upstream.origin.toString()
    if (!config.share?.openOnStart) return
    const platform = process.platform
    // execFile 返回 ChildProcess（不是 Promise）：吞掉 spawn 错误，便捷功能不得影响网关
    const child = platform === 'win32'
      ? execFile('cmd.exe', ['/c', 'start', '', target], { windowsHide: true })
      : platform === 'darwin'
        ? execFile('open', [target])
        : execFile('xdg-open', [target])
    child.on('error', () => {})
  } catch {
    // 便捷功能永远不能让网关抛异常
  }
}

export async function readShareText(name) {
  const textPath = path.join(SHARE_DIR, `${name}.txt`)
  try {
    return await readFile(textPath, 'utf8')
  } catch {
    return null
  }
}
