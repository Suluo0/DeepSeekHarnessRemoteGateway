# `bin/` directory

Place platform-specific `cloudflared` binaries here if you want the gateway to use a local bundled copy instead of your system `PATH`.

Expected filenames:

- Windows: `cloudflared.exe`
- macOS / Linux: `cloudflared`

Notes:

- If `config.json` leaves `tunnel.cloudflaredPath` as `null`, the gateway first checks this folder.
- If nothing is found here, it falls back to `cloudflared` from `PATH`.
- On macOS/Linux, remember to make the binary executable:

```bash
chmod +x remote-gateway/bin/cloudflared
```
