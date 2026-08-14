import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import QRCode from 'qrcode'

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderShareHtml({ publicUrl, password, qrDataUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DSH Remote Gateway Share</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        background:
          radial-gradient(circle at top, rgba(125, 158, 248, 0.18), transparent 26%),
          linear-gradient(180deg, #fafbff, #f3f6fb);
        color: #151b26;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.25rem;
      }
      .card {
        width: min(100%, 760px);
        display: grid;
        gap: 1.2rem;
        grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
        padding: 1.4rem;
        border-radius: 32px;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(21, 27, 38, 0.08);
        box-shadow: 0 18px 44px rgba(84, 99, 131, 0.14);
      }
      .qr-box {
        display: grid;
        place-items: center;
        padding: 1rem;
        border-radius: 28px;
        background: #fff;
        border: 1px solid rgba(21, 27, 38, 0.08);
      }
      .qr-box img {
        width: min(100%, 260px);
        height: auto;
      }
      .meta {
        display: grid;
        align-content: center;
        gap: 0.9rem;
      }
      h1 {
        margin: 0;
        font-size: 2rem;
        letter-spacing: -0.04em;
      }
      p {
        margin: 0;
        color: rgba(21, 27, 38, 0.68);
        line-height: 1.5;
      }
      .line {
        display: grid;
        gap: 0.3rem;
        padding: 0.9rem 1rem;
        border-radius: 22px;
        background: #f8faff;
        border: 1px solid rgba(21, 27, 38, 0.08);
      }
      .label {
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: rgba(21, 27, 38, 0.46);
      }
      .value {
        font-size: 1.05rem;
        font-weight: 700;
        word-break: break-all;
      }
      .password {
        font-size: 2.8rem;
        letter-spacing: 0.2em;
      }
      @media (max-width: 720px) {
        .card {
          grid-template-columns: 1fr;
        }
        .password {
          font-size: 2.2rem;
        }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <section class="qr-box">
        <img alt="QR code for DeepSeek Harness public URL" src="${qrDataUrl}">
      </section>
      <section class="meta">
        <p>DeepSeek Harness Remote Gateway</p>
        <h1>Scan and open</h1>
        <p>Use your phone camera to scan the QR code, then enter the password below.</p>
        <div class="line">
          <span class="label">Public URL</span>
          <span class="value">${escapeHtml(publicUrl)}</span>
        </div>
        <div class="line">
          <span class="label">Access password</span>
          <span class="value password">${escapeHtml(password)}</span>
        </div>
      </section>
    </main>
  </body>
</html>`
}

function openTarget(target) {
  const spec = process.platform === 'win32'
    ? {
        command: 'cmd',
        args: ['/c', 'start', '', target],
        options: { detached: true, windowsHide: true, stdio: 'ignore' },
      }
    : process.platform === 'darwin'
      ? {
          command: 'open',
          args: [target],
          options: { detached: true, stdio: 'ignore' },
        }
      : {
          command: 'xdg-open',
          args: [target],
          options: { detached: true, stdio: 'ignore' },
        }

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, spec.options)
    let settled = false

    child.once('error', (error) => {
      if (settled) return
      settled = true
      console.warn(`[remote-gateway] failed to auto-open share screen: ${error instanceof Error ? error.message : 'Unknown error'}`)
      resolve(false)
    })

    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve(true)
    })
  })
}

export async function prepareShareArtifacts(config, publicUrl) {
  const qrDataUrl = await QRCode.toDataURL(publicUrl, {
    margin: 1,
    width: 320,
  })
  const qrTerminal = await QRCode.toString(publicUrl, {
    type: 'terminal',
    small: true,
  })
  const sharePath = join(config.paths.runtimeDir, 'share.html')
  await writeFile(
    sharePath,
    renderShareHtml({ publicUrl, password: config.auth.password, qrDataUrl }),
    'utf8',
  )

  return {
    publicUrl,
    password: config.auth.password,
    qrTerminal,
    sharePath,
    open() {
      openTarget(sharePath)
    },
  }
}

export function printShareSummary(share) {
  console.log('')
  console.log('[remote-gateway] Public URL:')
  console.log(`  ${share.publicUrl}`)
  console.log('[remote-gateway] Access password:')
  console.log(`  ${share.password}`)
  console.log('[remote-gateway] QR code:')
  process.stdout.write(`${share.qrTerminal}\n`)
  console.log('[remote-gateway] Share screen:')
  console.log(`  ${share.sharePath}`)
  console.log('')
}
