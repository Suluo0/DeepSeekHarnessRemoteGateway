# Release 附件策略

当前仓库采用下面这套分发策略：

- `Windows` 版本可以继续保留 `bin/cloudflared.exe`
- `macOS` 和 `Linux` 的 `cloudflared` 不直接放在仓库主分支
- `macOS` 和 `Linux` 版本通过 GitHub Release 附件分发

这样做的目的：

- 避免把多个平台的大体积二进制长期放在主仓库里
- 保持主仓库更轻
- 让 GitHub 仓库首页更聚焦源码和文档

## 推荐流程

### 1. 准备平台二进制

把对应平台的 `cloudflared` 放到：

```text
vendor/cloudflared/macos-arm64/cloudflared
vendor/cloudflared/macos-amd64/cloudflared
vendor/cloudflared/linux-amd64/cloudflared
vendor/cloudflared/linux-arm64/cloudflared
```

这些文件已被 `.gitignore` 忽略，默认不会被提交到主仓库。

### 2. 生成平台发布目录

```bash
npm run release:bundle -- macos-arm64
npm run release:bundle -- macos-amd64
npm run release:bundle -- linux-amd64
npm run release:bundle -- linux-arm64
```

生成结果会出现在：

```text
remote-gateway/dist/
```

### 3. 生成可上传的 zip 附件

```bash
npm run release:assets -- macos-arm64
npm run release:assets -- linux-amd64
```

或者一次性处理全部已经准备好的目标：

```bash
npm run release:assets -- --all
```

生成结果会出现在：

```text
remote-gateway/release-assets/
```

### 4. 上传到 GitHub Release

推荐把这些 zip 作为 GitHub Release 附件上传：

- `dsh-remote-gateway-v0.1.0-macos-arm64.zip`
- `dsh-remote-gateway-v0.1.0-macos-amd64.zip`
- `dsh-remote-gateway-v0.1.0-linux-amd64.zip`
- `dsh-remote-gateway-v0.1.0-linux-arm64.zip`

## 说明

- 如果某个平台的 `dist` 目录不存在，先执行 `release:bundle`
- `release:assets` 只负责把已经生成的发布目录压缩成 zip
- Windows 用户可以在本机直接为 macOS/Linux 目录生成 zip 附件
