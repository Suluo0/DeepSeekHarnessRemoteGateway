# DSH Remote Gateway（白名单改造版）

<div align="center">

<h1>DSH Remote Gateway</h1>

<p><strong>让 DeepSeek Harness Web 获得可被手机远程访问的能力</strong></p>

<p>不修改 DeepSeek Harness 本体代码。以<strong>设备白名单 + 受控端审批</strong>替代上游的密码登录体系：默认生成随机公网 URL，手机端仅需浏览器即可访问，新设备必须经受控电脑批准后才能进入。</p>

<p>
  <a href="./INSTALL.md">安装说明</a> ·
  <a href="./FAQ.md">常见问题</a> ·
  <a href="./DELIVERY.md">改造说明（本 fork 改动清单）</a> ·
  <a href="./LICENSE">许可证</a>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Plugin-4D6BFE)](https://github.com/topics/dsh-plugin)
[![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare-Quick%20Tunnel-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

</div>

## 本 fork 是什么

这是对上游 [lbwnb666-ai/DeepSeekHarnessRemoteGateway](https://github.com/lbwnb666-ai/DeepSeekHarnessRemoteGateway) 的 fork 改造，核心变化是：

- **fork 自上游 main 分支**（上游 HEAD：d20d22e "Final submission，dsh YYDS"），改造分支为 feat/dsh-plugin-integration。
- **删除密码登录体系**（登录页、health 明文泄露密码、控制台打印密码、HMAC session cookie 全部移除）。
- **改为设备白名单 + 待审批流程**：设备首次访问进入门禁页，受控电脑批准后才可访问；可随时吊销。
- **管理面物理隔离**：审批/设备管理只监听本机独立端口（默认主端口 + 1），公网（隧道）物理上不可达。
- **移除 qrcode 依赖**，无任何 npm 运行时依赖；新增 npm test 验收测试。

## 新增功能（相对上游）

1. **设备白名单**（src/whitelist.js）
   - 名单存于 runtime/whitelist.json，原子写入（tmp + rename），缺失/损坏时 fail-closed（任何设备都不可信）。
   - 设备以 192-bit 随机 token 作为 cookie（dsh_device，HttpOnly，一年有效）识别。
2. **待审批 + 直接批准/驳回**（src/pending.js）
   - 新设备访问门禁页时生成待批条目，条目 120 秒 TTL（设备轮询门禁页时自动续期，无人理会即过期），容量上限 100 防刷。
   - 受控端在审批页一键「批准」或「拒绝」，无验证码、无三选一（比早前设计更简单直接）。
3. **独立管理面**（src/index.js）
   - 主端口（隧道可达）只保留：/_gateway/health、/_gateway/gate/status、白名单门禁 + 反代上游；管理路径一律 403。
   - 管理端口（默认 127.0.0.1:8788，仅 loopback 监听）提供：/_gateway/approve 审批页、/_gateway/admin 设备管理页（含吊销）、/_gateway/api/* JSON API（供 DSH 设置页集成）。
4. **健康接口不再泄露密码**：/_gateway/health 只返回 ok / upstream / tunnel。
5. **隧道失败不再致命**：cloudflared 缺失或隧道启动失败时，网关照常启动，本地功能不受影响。
6. **存活守卫 + 看门狗**：startParentLivenessGuard() 检测 dsh 父进程消失后孤儿自清理；scripts/start.js 内置健康检查看门狗（失败自动重启，退出码 75）。
7. **测试套件**：test/gateway.test.mjs 覆盖门禁、批准、驳回、吊销、health 无密码、loopback 判定、隧道失败容错、管理面隔离、fail-closed 恢复等 10 项验收测试。

## 禁用的功能（相对上游）

| 上游功能 | 本 fork 状态 |
| --- | --- |
| 6 位密码登录页 + 登录保护 | 删除（auth.js 改为设备 token 白名单） |
| 每次启动生成随机 6 位密码并打印 | 删除（config.js 中残留生成函数但已无消费方） |
| 分享页/二维码展示密码 | 删除（share.js 不再渲染密码与二维码） |
| /_gateway/health 返回当前密码 | 删除 |
| HMAC session cookie（dsh_remote_session） | 删除（改用 dsh_device 白名单 cookie） |
| qrcode npm 依赖 | 删除（package.json 无 dependencies） |
| macOS / Linux 启动脚本 | 本 fork 移除（代码仍跨平台，仅精简启动入口） |
| GitHub Release 打包脚本 / 模板 | 本 fork 移除（scripts/release-*.js、RELEASE_*.md、vendor/） |

## 端口与安全模型

| 端口 | 绑定 | 作用 | 公网可达 |
| --- | --- | --- | --- |
| 8787（默认） | 127.0.0.1 | 主网关：门禁 + 反代 DSH Web | 是（经 cloudflared quick tunnel） |
| 8788（默认 = 主端口+1） | 127.0.0.1 | 管理面：审批、设备管理、JSON API | 否（物理不可达） |

- 主端口上的 /_gateway/approve、/_gateway/admin、/_gateway/api/* 一律返回 403，即使请求来自 loopback —— 管理面只在独立管理端口存在。
- loopback 判定只信 socket 对端地址（isLoopbackAddress），绝不信任 X-Forwarded-For 等可伪造头。

## 一键安装（npm）

本仓库同时发布 npm 插件包 `dsh-remote-gateway`（含白名单版 sidecar 网关 + DSH 设置页「远程网关」段，开箱即用）：

```bash
dsh plugin --profile web add dsh-remote-gateway
```

装完后：

1. 插件首次启动自动把 sidecar 部署到 `~/.dsh/remote-gateway`（已存在则不覆盖，保留你的 config.json / 白名单）。
2. DSH 设置页出现「远程网关」段：审批待批设备、管理白名单、启停网关、autoStart 开关。
3. 手机打开公网 URL -> 进入「此设备尚未获得授权」门禁页。
4. 设置页点「批准」-> 手机自动进入（门禁页 3s 轮询）。
5. 换设备/丢设备：设置页或 http://127.0.0.1:8788/_gateway/admin 吊销对应设备。

## 源码手动运行

1. 本地启动 dsh web，确认 http://127.0.0.1:3080 可访问。
2. 准备 cloudflared（放 bin/ 或系统 PATH，也可在 config.json / 环境变量指定 cloudflaredPath）。
3. 启动：node scripts/start.js（或 start_Windows.bat / start.ps1 / start.bat；restart.bat 可重启并把新公网 URL 复制到剪贴板）。
4. 管理面：http://127.0.0.1:8788/_gateway/approve（审批）、/_gateway/admin（设备管理）。

## 配置文件

config.json（auth.* 字段为兼容残留，已无消费方，可忽略）：

```json
{
  "server": { "bindAddress": "127.0.0.1", "bindPort": 8787 },
  "upstream": { "origin": "http://127.0.0.1:3080", "loopbackMode": null },
  "auth": { "password": null, "sessionSecret": null, "cookieName": "dsh_remote_session", "sessionTtlHours": 168, "secureCookies": false },
  "dsh": { "command": null },
  "tunnel": { "enabled": true, "mode": "quick", "cloudflaredPath": null },
  "share": { "openOnStart": true }
}
```

主要环境变量覆盖：

- REMOTE_GATEWAY_BIND_ADDRESS / REMOTE_GATEWAY_BIND_PORT
- REMOTE_GATEWAY_ADMIN_PORT（管理端口，默认 = 主端口 + 1）
- REMOTE_GATEWAY_UPSTREAM_ORIGIN / REMOTE_GATEWAY_UPSTREAM_LOOPBACK_MODE
- REMOTE_GATEWAY_DSH_COMMAND
- REMOTE_GATEWAY_TUNNEL_ENABLED / REMOTE_GATEWAY_TUNNEL_MODE / REMOTE_GATEWAY_CLOUDFLARED_PATH
- REMOTE_GATEWAY_SHARE_OPEN_ON_START
- REMOTE_GATEWAY_HEALTH_CHECK_MS（看门狗检查间隔，默认 30000）

## 测试

```bash
npm test
```

运行 node --test test/*.mjs，覆盖 10 项验收测试（见上「新增功能」第 7 条）。

## 仓库结构

- src/ 网关核心（index.js 主程序，auth.js 设备 token，whitelist.js 白名单，pending.js 待审批，proxy.js 反代，share.js 分享页，config.js 配置，dsh.js 托管 DSH，tunnel.js 隧道）
- scripts/ 启动（start.js 含看门狗）与自检（doctor.js）
- test/ 验收测试
- bin/ 本地 cloudflared（Windows）
- runtime/ 运行时产物（whitelist.json 等，已 gitignore）
- restart.bat Windows 重启 + 复制公网 URL 到剪贴板
- dsh-plugin/ npm 插件包（lib/ 服务端+设置页 UI、cordis.patch.yml、scripts/build-sidecar.mjs 打包脚本、test/）
- README.md / INSTALL.md / FAQ.md / DELIVERY.md 文档
## 当前限制

- 远程状态下无法直接从手机端打开本地尚未打开的工作区；切换工作区仍需先在电脑端打开目标工作区。
- 信任 Cloudflare 边缘（quick tunnel 既定前提）。

## 已知取舍

- 不回馈上游、无密码、无新 npm 依赖。
- 上游 config.js 中 6 位随机密码生成仍在但已无任何消费方（无害残留）。
