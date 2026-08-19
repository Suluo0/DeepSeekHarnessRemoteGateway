# DSH Remote Gateway 白名单改造 — 交付说明

## 改造基线

- 上游仓库：lbwnb666-ai/DeepSeekHarnessRemoteGateway
- fork 分支：上游 main 分支（HEAD d20d22e "Final submission，dsh YYDS"）
- 本 fork 分支：feat/dsh-plugin-integration
- 本地副本：C:\Users\suluo\.dsh\remote-gateway（含上游 git 历史）
- 发布仓库：https://github.com/Suluo0/DeepSeekHarnessRemoteGateway

## 改动摘要

- 删除密码登录体系：登录页、/_gateway/health 明文泄露密码、控制台打印密码全部移除
- 新增设备白名单：src/whitelist.js（runtime/whitelist.json，原子写入，fail-closed）
- 新增待审批：src/pending.js（设备 token -> 待批条目，120s TTL 自动续期，容量上限 100 防刷，受控端一键批准/驳回，无验证码）
- index.js 重写：主端口（隧道可达）只保留 health + 设备状态轮询 + 白名单门禁；管理面（审批/设备管理）独立监听 127.0.0.1:<主端口+1>，公网物理不可达
- auth.js 重写：HMAC session cookie 改为 192-bit 随机设备 token cookie（dsh_device）
- share.js 去掉密码展示；隧道失败不再致命（本地功能不受影响）
- proxy.js：客户端断开时销毁上游请求
- scripts/start.js：新增看门狗（健康检查失败自动重启，退出码 75）、上游探测、父进程存活守卫
- package.json：0.2.0，移除 qrcode 依赖（无任何 npm 运行时依赖），新增 npm test
- 新增 restart.bat：一键重启并把新公网 URL 复制到剪贴板
- 新增 test/gateway.test.mjs：10 项验收测试，全绿
- 新增 dsh-plugin/ npm 插件包：DSH 设置页「远程网关」段（审批/白名单/生命周期 UI）+ ensureGatewayInstalled（首次运行把包内 sidecar 部署到 ~/.dsh/remote-gateway，开箱即用）+ scripts/build-sidecar.mjs（pack 前复制 sidecar 进包）
- 发布形态：npm registry（dsh-remote-gateway），用户 dsh plugin --profile web add dsh-remote-gateway 一行安装（不走 GitHub Release）

## 运行方式

- npm 安装（推荐）：dsh plugin --profile web add dsh-remote-gateway，插件自动部署 sidecar 到 ~/.dsh/remote-gateway 并管理生命周期
- 手动：cd C:\Users\suluo\.dsh\remote-gateway && node src\index.js
- 开机自启：Startup 文件夹 dsh-remote-gateway.vbs（隐藏窗口，日志 runtime/gateway.log）
- 主端口 8787（cloudflared quick tunnel 转发的就是它）；管理端口 8788（仅本机）
- 审批入口：http://127.0.0.1:8788/_gateway/approve ；设备管理：http://127.0.0.1:8788/_gateway/admin

## 使用流程

1. 手机打开隧道 URL -> 门禁页显示「此设备尚未获得授权」
2. 电脑打开审批页（或 DSH 设置页 -> 远程网关）-> 点击「批准」-> 设备入白名单
3. 换手机/丢手机 -> 管理页吊销对应设备即可
## 仓库精简（相对上游）

本 fork 删除了与插件运行无关的上游文件：

- GitHub Release 打包脚本：scripts/release-assets.js、scripts/release-bundle.js
- Release 模板文档：RELEASE_ASSETS.md、RELEASE_CHECKLIST.md、RELEASE_TEMPLATE.md、RELEASE_v0.1.0.md
- vendor/cloudflared/（按平台打包发布用的源二进制目录）
- docs/screenshots/（旧密码登录 UI 截图）
- macOS / Linux 启动脚本：start.sh、start.command、start_Mac_or_Linux.sh

## 已知取舍（与用户对齐过）

- 信任 Cloudflare 边缘（quick tunnel 既定前提，"CF 都挂了就没啥好说的"）
- 不回馈上游、无密码、无新 npm 依赖
- 上游 config.js 里 6 位随机密码生成仍在但已无任何消费方（无害残留）
