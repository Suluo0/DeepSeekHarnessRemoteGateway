# DSH Remote Gateway

<div align="center">

<h1>DSH Remote Gateway</h1>

<p><strong>让 DeepSeek Harness Web 获得可被手机远程访问的能力</strong></p>

<p>
不修改 DeepSeek Harness 本体代码，通过
<strong>设备白名单 + 本机审批</strong>
替代密码登录。
手机使用浏览器打开临时公网地址，新设备必须经过受控电脑批准后才能访问。
</p>

<p>
  <a href="./INSTALL.md">安装说明</a> ·
  <a href="./FAQ.md">常见问题</a> ·
  <a href="./DELIVERY.md">改造说明</a> ·
  <a href="./LICENSE">许可证</a>
</p>

[![npm](https://img.shields.io/npm/v/dsh-remote-gateway)](https://www.npmjs.com/package/dsh-remote-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js\&logoColor=white)](https://nodejs.org/)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows\&logoColor=white)](#平台支持)
[![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare-Quick%20Tunnel-F38020?logo=cloudflare\&logoColor=white)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

</div>

## 平台支持

> [!IMPORTANT]
> **当前发行版仅支持 Windows。**

npm 包中内置的是 Windows 版 `cloudflared.exe`，当前提供的启动、重启和自动部署流程也均以 Windows 为目标。

| 平台      | 状态   |
| ------- | ---- |
| Windows | 支持   |
| macOS   | 暂不支持 |
| Linux   | 暂不支持 |

macOS 和 Linux 目前没有经过完整测试，也没有提供对应的内置 `cloudflared` 二进制文件及一键安装流程。

## 主要功能

* 使用 Cloudflare Quick Tunnel 生成临时公网地址。
* 手机或其他设备通过浏览器访问 DSH Web。
* 新设备首次访问时进入待审批页面。
* 受控电脑可批准、拒绝或吊销设备。
* 不使用公网密码登录。
* 审批和设备管理界面仅监听本机管理端口。
* 隧道启动失败时不影响本地网关继续运行。
* DSH 插件负责部署、启动和管理 sidecar 网关。

## 安全模型

本项目使用设备白名单代替原有密码登录体系。

### 设备白名单

设备首次访问时会获得随机设备标识，并进入待审批状态。

只有经过受控电脑批准的设备，才能通过网关访问 DSH Web。已批准设备可以随时被吊销。

白名单保存在：

```text
runtime/whitelist.json
```

白名单使用原子写入；文件缺失或损坏时采用 fail-closed 策略，不会默认信任任何设备。

### 独立管理面

| 默认端口   | 绑定地址        | 作用                    | 公网可达           |
| ------ | ----------- | --------------------- | -------------- |
| `8787` | `127.0.0.1` | 门禁、状态检查和 DSH Web 反向代理 | 可通过 Tunnel 访问  |
| `8788` | `127.0.0.1` | 设备审批、白名单管理和本地 API     | 不可通过 Tunnel 访问 |

管理面只存在于本机管理端口：

```text
http://127.0.0.1:8788/_gateway/approve
http://127.0.0.1:8788/_gateway/admin
```

主网关端口上的管理路径会直接返回 `403`。

网关只根据实际 Socket 对端地址判断请求是否来自本机，不信任 `X-Forwarded-For` 等可伪造请求头。

## 安装条件

使用前需要：

* Windows；
* Node.js 22 或更高版本；
* 已安装并能够正常运行 DeepSeek Harness；
* DSH Web Profile 可正常启动。

npm 插件已经内置 Windows 版 `cloudflared.exe`，正常情况下不需要单独安装 Cloudflare Tunnel。

## 一键安装

推荐通过 DSH 插件系统安装：

```bash
dsh plugin --profile web add dsh-remote-gateway
```

安装完成后：

1. 插件首次启动时，将 sidecar 部署到 `~/.dsh/remote-gateway`。
2. 如果目标目录已经存在，插件不会覆盖现有配置和设备白名单。
3. DSH 设置页中会出现“远程网关”配置区域。
4. 在设置页中启动网关并取得公网 URL。
5. 使用手机浏览器打开公网 URL。
6. 手机进入“此设备尚未获得授权”页面。
7. 在电脑端的 DSH 设置页批准该设备。
8. 手机端轮询到批准状态后自动进入 DSH Web。

换设备或设备丢失后，可以在设置页中吊销设备，也可以打开：

```text
http://127.0.0.1:8788/_gateway/admin
```

## 源码运行

首先确认本地 DSH Web 可以访问：

```text
http://127.0.0.1:3080
```

项目已在 `bin/` 中提供 Windows 版：

```text
bin/cloudflared.exe
```

随后可以使用以下任一方式启动：

```text
start_Windows.bat
start.bat
start.ps1
node scripts/start.js
```

重新启动并将新的公网 URL 复制到剪贴板：

```text
restart.bat
```

运行环境检查：

```bash
npm run doctor
```

运行测试：

```bash
npm test
```

## 设备审批流程

1. 手机打开网关输出的公网 URL。
2. 手机显示“此设备尚未获得授权”。
3. 电脑打开 DSH 设置页中的“远程网关”区域。
4. 在待审批设备列表中选择“批准”或“拒绝”。
5. 批准后，手机自动进入 DSH Web。
6. 不再信任该设备时，从设备列表中将其吊销。

待审批记录具有有效期和容量限制，避免无限积累无效请求。

## 配置

默认配置文件为：

```text
config.json
```

示例：

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

`auth.*` 字段是兼容旧配置保留的字段，当前设备白名单模式不会使用密码登录。

### 环境变量

```text
REMOTE_GATEWAY_BIND_ADDRESS
REMOTE_GATEWAY_BIND_PORT
REMOTE_GATEWAY_ADMIN_PORT
REMOTE_GATEWAY_UPSTREAM_ORIGIN
REMOTE_GATEWAY_UPSTREAM_LOOPBACK_MODE
REMOTE_GATEWAY_DSH_COMMAND
REMOTE_GATEWAY_TUNNEL_ENABLED
REMOTE_GATEWAY_TUNNEL_MODE
REMOTE_GATEWAY_CLOUDFLARED_PATH
REMOTE_GATEWAY_SHARE_OPEN_ON_START
REMOTE_GATEWAY_HEALTH_CHECK_MS
```

其中管理端口默认为主端口加一。

## 相对上游的主要改动

本项目 fork 自：

```text
lbwnb666-ai/DeepSeekHarnessRemoteGateway
```

主要改动包括：

* 删除六位数密码登录页面。
* 删除启动时生成和输出密码的流程。
* 删除健康检查接口中的密码信息。
* 删除分享页面中的密码和二维码。
* 删除 HMAC 登录 Session，改为设备白名单 Cookie。
* 删除 `qrcode` 运行时依赖。
* 新增待审批设备管理。
* 新增批准、拒绝和吊销流程。
* 将管理面移动到独立的本机端口。
* 新增父进程存活守卫和健康检查看门狗。
* 新增自动化验收测试。
* 新增 DSH 设置页集成。
* 新增 npm 插件安装和 sidecar 自动部署。

## 仓库结构

```text
bin/            Windows 版 cloudflared
dsh-plugin/     DSH npm 插件
runtime/        白名单等运行时数据
scripts/        启动、自检和看门狗脚本
src/            网关核心代码
test/           自动化验收测试
config.json     默认配置
INSTALL.md      详细安装说明
FAQ.md          常见问题
DELIVERY.md     本 fork 改造说明
```

## 当前限制

* 当前发行版仅支持 Windows。
* macOS 和 Linux 尚未提供正式安装与运行支持。
* 远程状态下无法直接从手机打开电脑端尚未打开的工作区。
* 切换工作区前，仍需先在电脑端打开目标工作区。
* Quick Tunnel 依赖 Cloudflare 网络和边缘服务。
* Quick Tunnel 地址可能在网关重启后发生变化。

## 第三方软件

npm 插件包中包含 `cloudflared.exe`。

`cloudflared` 由 Cloudflare 提供，并依据 Apache License 2.0 分发。其许可证文本随二进制文件一同提供：

```text
sidecar/bin/cloudflared-LICENSE.txt
```

本项目自身代码依据根目录中的 MIT License 发布：

```text
LICENSE
```

## 许可证

本项目采用 [MIT License](./LICENSE)。

项目中包含的第三方软件仍分别遵循其各自的许可证。
