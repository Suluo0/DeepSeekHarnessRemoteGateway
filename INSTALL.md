# 安装说明

这份文档适合首次从干净目录启动本 fork（白名单改造版）的场景。

## 前置条件

- 本地已经启动 DeepSeek Harness Web（默认 http://127.0.0.1:3080）
- 已安装 Node.js 22+
- 已准备 cloudflared
  - Windows 可放在 bin/（本仓库已内置 bin/cloudflared.exe）
  - 也可以安装到系统 PATH，或在 config.json / 环境变量指定 cloudflaredPath

## 1. 先检查配置文件

打开 config.json，重点确认：

- upstream.origin（默认 http://127.0.0.1:3080）
- tunnel.enabled（默认 true）
- share.openOnStart（默认 true）

注意：auth.* 字段（password / sessionSecret 等）为本 fork 的兼容残留，已无任何消费方，密码登录体系已移除，可忽略。

## 2. 准备 cloudflared

方式 A：使用仓库内置二进制

- Windows：bin/cloudflared.exe（已内置）

方式 B：全局安装（确保命令行可直接执行 cloudflared）

本 fork 不再提供按平台生成发布包 / GitHub Release 附件流程（相关脚本已移除）。

## 3. 运行自检

npm run doctor

理想状态下应看到：

- Node.js 版本正常
- config.json 能正确读取
- 上游 DSH 可访问
- cloudflared 能被发现（或 tunnel.enabled=false 时提示不需要）

## 4. 启动网关

Windows 用户选择任一入口：

- start_Windows.bat（资源管理器双击）
- start.bat（兼容别名）
- start.ps1（PowerShell）
- node scripts/start.js（含健康检查看门狗，失败自动重启）
- restart.bat（重启并把新的公网 URL 复制到剪贴板）

## 5. 在手机端访问（设备审批流程）

1. 手机打开启动后输出的公网 URL，进入「此设备尚未获得授权」门禁页。
2. 电脑打开 http://127.0.0.1:8788/_gateway/approve（管理端口默认 = 主端口 + 1，仅本机可访问）。
3. 点击「批准」，手机端门禁页 3 秒轮询，批准后自动进入 DeepSeek Harness Web。
4. 换设备 / 丢设备：http://127.0.0.1:8788/_gateway/admin 吊销对应设备。

注意：管理端口只监听 127.0.0.1，公网（隧道）物理上不可达；主端口上的管理路径一律返回 403。

## 常见首启问题

### 提示 Node.js 22+ was not found in PATH

说明本机没有可用的 Node.js，安装 Node.js 22 或更高版本后再试。

### 提示 cloudflared not found

说明网关没有找到 cloudflared：

- 要么使用 bin/ 下内置的二进制

- 要么安装到系统 PATH

- 要么在 config.json / 环境变量显式指定 cloudflaredPath

注意：即使 cloudflared 缺失，网关照常启动，本地功能（http://127.0.0.1:8787）不受影响，只是没有公网隧道。

### 上游探测失败

说明网关访问不到 DSH：

- 确认 dsh web 已经启动

- 确认 upstream.origin 配置的是正确的本地地址和端口
