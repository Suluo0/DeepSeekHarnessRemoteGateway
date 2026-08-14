# `bin/` 目录说明

如果希望网关优先使用项目内自带的 `cloudflared`，可将对应平台的二进制放在这个目录下。

推荐文件名：

- Windows：`cloudflared.exe`
- macOS / Linux：`cloudflared`

补充说明：

- 当 `config.json` 中的 `tunnel.cloudflaredPath` 为 `null` 时，网关会优先检查这个目录
- 如果这里没有找到可用文件，网关会回退到系统 `PATH` 中的 `cloudflared`
- 在 macOS/Linux 上，记得先赋予可执行权限：

```bash
chmod +x remote-gateway/bin/cloudflared
```
