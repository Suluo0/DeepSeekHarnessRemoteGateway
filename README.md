# DSH Remote Gateway

在不修改 **DeepSeek Harness** 本体代码的前提下，把 **DeepSeek Harness Web** 变成一个可被手机远程访问的工作界面。

轻量 sidecar、启动即生成随机公网地址、默认随机 6 位密码、自动输出二维码。

[安装说明](./INSTALL.md) | [常见问题](./FAQ.md) | [发布检查清单](./RELEASE_CHECKLIST.md) | [Release 附件策略](./RELEASE_ASSETS.md) | [许可证](./LICENSE)

## 项目简介

`DSH Remote Gateway` 是一个围绕 `DeepSeek Harness Web` 的轻量侧车服务。

它不修改 DeepSeek Harness 本体，而是在本地电脑旁边增加一层远程访问能力：

- 启动后自动生成随机公网 URL
- 默认自动生成随机 6 位密码
- 自动输出二维码，手机扫码即可访问
- 手机端只需要浏览器，不需要安装 App
- 适合临时远程访问、移动端查看和继续对话

## 30 秒上手

1. 先在本地启动 `dsh web`，并确认它可通过 `http://127.0.0.1:3080` 访问。
2. 准备 `cloudflared`，放到 `remote-gateway/bin/`，或者确保系统 `PATH` 里可直接调用。
3. 运行 `npm run doctor` 做一次环境检查。
4. 根据你的平台启动 `start_Windows.bat`、`start.ps1`、`start_Mac_or_Linux.sh`、`start.sh` 或 `start.command`。
5. 用手机扫描启动后生成的二维码，输入 6 位密码即可访问。

更完整的安装和排障说明见 [INSTALL.md](./INSTALL.md)。

## 截图建议

如果后续要把它发到 GitHub 仓库首页，推荐至少准备这几张图：

- 桌面端分享页，展示二维码、公网 URL 和 6 位密码
- 手机登录页
- 手机端 DeepSeek Harness 对话页
- 可选：`doctor` 自检输出截图

建议截图路径：

- `docs/screenshots/share-screen.png`
- `docs/screenshots/phone-login.png`
- `docs/screenshots/phone-chat.png`
- `docs/screenshots/doctor-terminal.png`

截图准备好以后，可以在 README 中这样展示：

```md
![分享页](docs/screenshots/share-screen.png)
![手机登录页](docs/screenshots/phone-login.png)
![手机对话页](docs/screenshots/phone-chat.png)
```

## 为什么做这个

- DeepSeek Harness 本身已经有成熟的 Web UI
- 真正需要补的是“远程接入能力”，不是再造一个新前端
- 对手机场景来说，最有价值的是远程继续任务，而不是维护第二套 UI
- 这种 sidecar 形式更轻、更适合插件化复用，也更容易发布到 `topics/dsh-plugin`

## 核心特点

- 不修改 DeepSeek Harness 源码
- 默认随机公网 URL
- 默认随机 6 位密码
- 二维码扫码进入
- 手机只需浏览器
- 支持 Windows、macOS、Linux
- 可按平台生成自带 `cloudflared` 的发布包
- 支持把 macOS / Linux 版本作为 GitHub Release 附件分发

## 默认行为

正常启动后，网关会自动完成以下动作：

- 在 `127.0.0.1:8787` 启动本地 HTTP 网关
- 当未配置密码时，自动生成随机 6 位密码
- 当 `cloudflared` 可用时，自动启动 Cloudflare Quick Tunnel
- 在终端打印临时公网 URL、密码和二维码
- 在 `runtime/share.html` 生成本地分享页
- 默认自动在桌面打开这个分享页

这个默认流程非常适合插件分发场景：不需要固定域名、不需要公网 IP、也不需要改动 DSH 核心代码。

## 平台支持

- Windows
- macOS
- Linux

项目主体是纯 Node.js。平台相关的主要差异只在 `cloudflared` 二进制和启动脚本上。

## 它能做什么

- 提供一个简单的登录页
- 通过 `HttpOnly` Cookie 维护会话
- 反向代理 DeepSeek Harness Web UI
- 转发 `/api/*`
- 转发 Harness 使用的两个 WebSocket 下行通道：
  - `/api/events.mux`
  - `/api/events.host`
- 通过临时公网地址把本地网关暴露给手机端

## 它不做什么

- 不修改 DeepSeek Harness 代码
- 不自己提供 TLS 证书能力
- 不要求固定公网域名

## 配置文件

可编辑配置文件：

```text
remote-gateway/config.json
```

如果 `auth.password` 为 `null`，则每次启动都会生成一个新的随机 6 位密码。

如果你想使用固定密码，直接在 `config.json` 中手动填写即可。

## 配置示例

```json
{
  "server": {
    "bindAddress": "127.0.0.1",
    "bindPort": 8787
  },
  "upstream": {
    "origin": "http://127.0.0.1:3080",
    "loopbackMode": null
  },
  "auth": {
    "password": null,
    "sessionSecret": null,
    "cookieName": "dsh_remote_session",
    "sessionTtlHours": 168,
    "secureCookies": false
  },
  "dsh": {
    "command": null
  },
  "tunnel": {
    "enabled": true,
    "mode": "quick",
    "cloudflaredPath": null
  },
  "share": {
    "openOnStart": true
  }
}
```

## 重要说明

### Quick Tunnel 模式

默认隧道模式是 `quick`，会生成一个随机的 `*.trycloudflare.com` 地址。

当 `upstream.loopbackMode` 保持为 `null` 时，网关会在 Quick Tunnel 模式下自动启用 loopback 风格的上游请求头。这样每次随机域名变化时，不需要反复重启 `dsh web`。

这非常适合临时分享和插件分发，但它不是固定域名部署的最终形态。

### `cloudflared` 二进制

默认查找顺序如下：

- Windows：`remote-gateway/bin/cloudflared.exe`
- macOS/Linux：`remote-gateway/bin/cloudflared`

如果本地 `bin/` 目录里没有对应文件，网关会回退到系统 `PATH` 中的 `cloudflared`。

你也可以在 `config.json` 或环境变量中显式指定 `cloudflaredPath`。

### macOS/Linux 说明

如果你把二进制放到 `remote-gateway/bin/` 里，记得先赋予可执行权限：

```bash
chmod +x remote-gateway/bin/cloudflared
```

如果你的桌面环境没有 `xdg-open`，网关仍然可以正常启动，只是不会自动打开分享页，你可以手动打开输出的分享页路径。

## 环境变量覆盖

以下主要配置项都可以通过环境变量覆盖：

- `REMOTE_GATEWAY_BIND_ADDRESS`
- `REMOTE_GATEWAY_BIND_PORT`
- `REMOTE_GATEWAY_UPSTREAM_ORIGIN`
- `REMOTE_GATEWAY_UPSTREAM_LOOPBACK_MODE`
- `REMOTE_GATEWAY_PASSWORD`
- `REMOTE_GATEWAY_SESSION_SECRET`
- `REMOTE_GATEWAY_COOKIE_NAME`
- `REMOTE_GATEWAY_SESSION_TTL_HOURS`
- `REMOTE_GATEWAY_SECURE_COOKIES`
- `REMOTE_GATEWAY_DSH_COMMAND`
- `REMOTE_GATEWAY_TUNNEL_ENABLED`
- `REMOTE_GATEWAY_TUNNEL_MODE`
- `REMOTE_GATEWAY_CLOUDFLARED_PATH`
- `REMOTE_GATEWAY_SHARE_OPEN_ON_START`

## 直接运行

```bash
node src/index.js
```

如果 `share.openOnStart` 为 `true`，会自动打开本地分享页。否则可以手动打开：

```text
remote-gateway/runtime/share.html
```

## 一键启动

按平台选择合适的启动入口：

- Windows 资源管理器 / CMD：`remote-gateway/start_Windows.bat`
- Windows 兼容别名：`remote-gateway/start.bat`
- Windows PowerShell：`remote-gateway/start.ps1`
- macOS/Linux 终端：`remote-gateway/start_Mac_or_Linux.sh`
- macOS/Linux 兼容别名：`remote-gateway/start.sh`
- macOS Finder 双击：`remote-gateway/start.command`

这些启动器会自动完成三件事：

- 检查本机是否有 Node.js 22+
- 如果缺依赖，首次启动时自动执行 `npm install`
- 按当前 `config.json` 启动网关

macOS/Linux 首次使用前，建议先执行：

```bash
chmod +x remote-gateway/start.sh remote-gateway/start.command
```

## Doctor 自检

首次启动前，建议先运行一次环境检查：

```bash
npm run doctor
```

它会检查：

- Node.js 版本
- `config.json` 是否可解析
- 上游 DSH 是否可达
- `cloudflared` 是否能被发现
- 依赖是否已安装
- 当前密码模式是固定还是随机

## 适合发布的目录结构

- 运行时文件已通过 `remote-gateway/.gitignore` 忽略
- 日志文件已通过 `remote-gateway/.gitignore` 忽略
- `remote-gateway/bin/README.md` 说明了如何替换或内置 `cloudflared`
- `remote-gateway/INSTALL.md` 提供首次安装步骤
- `remote-gateway/FAQ.md` 提供常见问题答案
- `remote-gateway/RELEASE_CHECKLIST.md` 提供发布前检查项
- `remote-gateway/RELEASE_ASSETS.md` 说明了 GitHub Release 附件策略

## 发布到 GitHub / topics/dsh-plugin

如果你准备把它发布到 `topics/dsh-plugin`，推荐最少做这几步：

1. 保持 `README.md`、`INSTALL.md`、`FAQ.md` 一起发布。
2. 保持启动脚本文件名稳定，不要频繁变更。
3. 发布前先跑一次 `npm run doctor`。
4. Windows 版本可继续保留仓库内 `bin/cloudflared.exe`。
5. macOS / Linux 版本推荐走 GitHub Release 附件，不直接提交二进制到主分支。
5. 如果要按平台发包，执行 `npm run release:bundle -- <target>`。
6. 如果要上传附件，执行 `npm run release:assets -- <target>`。

### 支持的发布目标

- `windows-x64`
- `macos-arm64`
- `macos-amd64`
- `linux-amd64`
- `linux-arm64`

### 发布包命令

```bash
npm run release:bundle -- windows-x64
npm run release:bundle -- --all --allow-missing
npm run release:assets -- macos-arm64
npm run release:assets -- --all
```

生成的分发目录位于：

```text
remote-gateway/dist/
```

生成的 Release 附件位于：

```text
remote-gateway/release-assets/
```

## 仓库结构

- `src/` 网关核心运行代码
- `scripts/` 启动、自检、打包脚本
- `bin/` 本地开发或直接运行时使用的 `cloudflared`
- `vendor/cloudflared/` 按平台打包发布时使用的源二进制目录
- `runtime/` 运行时生成的分享页和临时产物
- `INSTALL.md` 安装说明
- `FAQ.md` 常见问题
- `RELEASE_CHECKLIST.md` 发布检查清单
- `RELEASE_ASSETS.md` GitHub Release 附件说明

## 健康检查接口

```text
GET /_gateway/health
```

该接口会返回网关状态、上游探测结果、当前公网 URL 和当前生效密码。
