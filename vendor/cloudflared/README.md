# Bundled Cloudflared Sources

This folder is for platform-specific `cloudflared` binaries that will be copied into release bundles.

Expected layout:

```text
vendor/cloudflared/windows-x64/cloudflared.exe
vendor/cloudflared/macos-arm64/cloudflared
vendor/cloudflared/macos-amd64/cloudflared
vendor/cloudflared/linux-amd64/cloudflared
vendor/cloudflared/linux-arm64/cloudflared
```

Notes:

- source development can continue using `bin/cloudflared.exe` on Windows
- release packaging prefers files in `vendor/cloudflared/<target>/`
- each generated bundle will copy the matching binary into its own `bin/`
