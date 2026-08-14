# DSH Remote Gateway v0.1.0

让 **DeepSeek Harness Web** 在不修改本体代码的前提下，获得可被手机远程访问的能力。

## 本版本内容

- 提供面向 DeepSeek Harness Web 的轻量 sidecar 网关
- 默认生成随机公网 URL
- 默认生成随机 6 位密码
- 启动时自动输出二维码，方便手机扫码访问
- 支持 Windows、macOS、Linux
- 支持按平台生成发布包
- 支持把 macOS / Linux 版本作为 GitHub Release 附件分发

## 适合谁使用

- 想把本地运行的 DeepSeek Harness Web 临时暴露给手机访问的人
- 不想修改 DeepSeek Harness 本体代码的人
- 不想额外维护一套独立移动端 UI，而是直接复用现有 Web UI 的人

## 快速使用

1. 本地先启动 `dsh web`
2. 下载对应平台的发布包或 Release 附件
3. 解压后运行对应启动脚本
4. 用手机扫描二维码
5. 输入 6 位密码访问

## 本次附件

### Windows

- 仓库内保留 `bin/cloudflared.exe`

### macOS

- `dsh-remote-gateway-v0.1.0-macos-arm64.zip`
- `dsh-remote-gateway-v0.1.0-macos-amd64.zip`

### Linux

- `dsh-remote-gateway-v0.1.0-linux-amd64.zip`
- `dsh-remote-gateway-v0.1.0-linux-arm64.zip`

## 使用前注意

- 请先确认本地 `dsh web` 已经启动
- 默认上游地址是 `http://127.0.0.1:3080`
- 如果本地端口不是 `3080`，请先修改 `config.json`
- 默认密码为随机生成，如需固定密码请手动编辑 `config.json`
- macOS / Linux 如果遇到执行权限问题，请先执行 `chmod +x`

## 文档入口

- 安装说明：`INSTALL.md`
- 常见问题：`FAQ.md`
- 发布检查清单：`RELEASE_CHECKLIST.md`
- Release 附件策略：`RELEASE_ASSETS.md`
