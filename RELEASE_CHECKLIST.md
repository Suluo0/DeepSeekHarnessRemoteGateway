# Release Checklist

## Before publishing

- Confirm `remote-gateway/README.md` matches the actual filenames in the folder
- Confirm `remote-gateway/INSTALL.md` works from a clean machine
- Confirm `npm run doctor` passes on at least one real machine
- Confirm `npm run release:bundle -- <target>` succeeds for each target you plan to publish
- Confirm one launcher works on Windows
- Confirm one launcher works on macOS or Linux
- Confirm the generated QR flow still opens the DeepSeek Harness Web UI remotely
- Confirm `auth.password` is `null` in the committed `config.json` if random password is the intended default
- Confirm no local logs or runtime artifacts are staged for release

## Release contents

Recommended files to keep:

- `README.md`
- `INSTALL.md`
- `FAQ.md`
- `RELEASE_CHECKLIST.md`
- `config.json`
- `package.json`
- `package-lock.json`
- `src/`
- `scripts/`
- `bin/README.md`
- launchers: `start_Windows.bat`, `start.bat`, `start.ps1`, `start_Mac_or_Linux.sh`, `start.sh`, `start.command`

## Optional release choices

- Include `cloudflared` in `bin/`
- Keep `cloudflared` external and document download steps
- Keep random password as default
- Replace random password with a user-defined fixed password in `config.json`

## Bundle commands

- single target: `npm run release:bundle -- windows-x64`
- all targets and skip missing binaries: `npm run release:bundle -- --all --allow-missing`
