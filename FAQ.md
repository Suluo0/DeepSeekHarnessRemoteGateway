# FAQ

## Do I need to modify DeepSeek Harness?

No. This gateway is designed as a sidecar. It proxies DeepSeek Harness Web without editing DeepSeek Harness source code.

## Do I need a public IP or my own domain?

No for the default workflow. Quick Tunnel can provide a random temporary public URL.

## Do I need my own cloud service?

No for basic usage. The default path is lightweight and self-hosted on the local machine.

## Why is the password different every time?

Because `config.json` defaults `auth.password` to `null`. In that mode, every launch generates a fresh random 6-digit password.

If you want a fixed password, write it into `config.json`.

## Can I disable the tunnel and use local-only mode?

Yes. Set:

```json
{
  "tunnel": {
    "enabled": false
  }
}
```

## What if my `dsh web` is not on port `3080`?

Change:

```json
{
  "upstream": {
    "origin": "http://127.0.0.1:YOUR_PORT"
  }
}
```

## Why does the phone page still ask for a password after I scanned the QR code?

That is expected. The QR code opens the public URL, and the gateway login page protects access before forwarding to DeepSeek Harness Web.

## Can I bundle `cloudflared` inside the repo?

Yes. Put it in `remote-gateway/bin/`. See `remote-gateway/bin/README.md`.

## Can I run this on macOS and Linux?

Yes. Use `start_Mac_or_Linux.sh`, `start.sh`, or `start.command` depending on your platform and launch style.
