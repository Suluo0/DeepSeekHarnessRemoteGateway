# Installation Guide

This guide is for people who want to run `DSH Remote Gateway` from a clean checkout.

## What you need

- DeepSeek Harness Web already running locally
- Node.js 22+
- `cloudflared`
  - either placed in `remote-gateway/bin/`
  - or installed in your system `PATH`

Default upstream:

```text
http://127.0.0.1:3080
```

If your `dsh web` uses another port, change `config.json`.

## 1. Prepare the folder

Open:

```text
remote-gateway/config.json
```

Check these values:

- `upstream.origin`
- `tunnel.enabled`
- `share.openOnStart`
- `auth.password`

If `auth.password` is `null`, startup will generate a random 6-digit password for that run.

## 2. Put `cloudflared` in place

Option A: bundled binary

- Windows: `remote-gateway/bin/cloudflared.exe`
- macOS/Linux: `remote-gateway/bin/cloudflared`

Option B: global install

- make sure `cloudflared` is available in your shell `PATH`

If you are preparing a platform release bundle, place platform binaries in:

```text
remote-gateway/vendor/cloudflared/<target>/
```

Then run:

```bash
npm run release:bundle -- <target>
```

## 3. Run the doctor check

```bash
npm run doctor
```

Expected result:

- Node.js passes
- config loads
- upstream is reachable
- `cloudflared` is found

## 4. Start the gateway

Choose one:

- Windows Explorer: `start_Windows.bat`
- Windows compatibility alias: `start.bat`
- PowerShell: `start.ps1`
- macOS/Linux terminal: `./start_Mac_or_Linux.sh`
- macOS/Linux compatibility alias: `./start.sh`
- macOS Finder: `start.command`

On first launch, the starter auto-installs missing npm dependencies.

## 5. Open on your phone

After startup, the gateway prints:

- a temporary public URL
- a 6-digit password
- a terminal QR code
- a local share page path

If desktop auto-open works, you can scan the QR code directly from the generated share page.

## Common first-run issues

- `Node.js 22+ was not found in PATH`
  - install Node.js 22 or newer
- `cloudflared not found`
  - put the binary in `bin/` or install it globally
- upstream probe failed
  - confirm `dsh web` is already running
  - confirm `upstream.origin` matches the real local address
