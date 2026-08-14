# `vendor/cloudflared/` 目录说明

这个目录用于存放“按平台发布包”所需的 `cloudflared` 源二进制。

推荐目录结构：

```text
vendor/cloudflared/windows-x64/cloudflared.exe
vendor/cloudflared/macos-arm64/cloudflared
vendor/cloudflared/macos-amd64/cloudflared
vendor/cloudflared/linux-amd64/cloudflared
vendor/cloudflared/linux-arm64/cloudflared
```

补充说明：

- 本地开发时，仍然可以继续直接使用 `bin/cloudflared.exe`
- 发布打包时，脚本会优先从 `vendor/cloudflared/<target>/` 读取对应平台文件
- 每个平台生成的发布包，都会把匹配的 `cloudflared` 复制到它自己的 `bin/` 目录
