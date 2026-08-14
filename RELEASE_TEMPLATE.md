# GitHub Release 文案模板

下面这份模板可直接作为 GitHub Release 的正文使用。

发布时建议将以下内容：

- 版本号
- 本次变更
- 对应平台附件
- 已知注意事项

按实际情况替换。

---

## DSH Remote Gateway vX.Y.Z

让 **DeepSeek Harness Web** 在不修改本体代码的前提下，获得可被手机远程访问的能力。

### 本版本内容

- 支持通过本地 sidecar 暴露 DeepSeek Harness Web
- 默认生成随机公网 URL
- 默认生成随机 6 位密码
- 启动时自动输出二维码
- 支持 Windows、macOS、Linux
- 支持按平台打包发布
- 支持把 macOS / Linux 版本作为 GitHub Release 附件分发

### 快速使用

1. 本地先启动 `dsh web`
2. 下载对应平台的发布包或附件
3. 解压后运行对应启动脚本
4. 用手机扫描二维码
5. 输入 6 位密码访问

### 附件说明

- Windows:
  - `dsh-remote-gateway-vX.Y.Z-windows-x64.zip`
- macOS:
  - `dsh-remote-gateway-vX.Y.Z-macos-arm64.zip`
  - `dsh-remote-gateway-vX.Y.Z-macos-amd64.zip`
- Linux:
  - `dsh-remote-gateway-vX.Y.Z-linux-amd64.zip`
  - `dsh-remote-gateway-vX.Y.Z-linux-arm64.zip`

### 注意事项

- 使用前请确认本地 `dsh web` 已经启动
- 默认上游地址是 `http://127.0.0.1:3080`
- 如果端口不同，请先修改 `config.json`
- 默认密码为随机生成，如需固定密码请手动编辑 `config.json`

### 文档入口

- 安装说明：`INSTALL.md`
- 常见问题：`FAQ.md`
- 发布检查清单：`RELEASE_CHECKLIST.md`
- Release 附件策略：`RELEASE_ASSETS.md`

---

## 简短版模板

如果需要更短的 Release 文案，可直接使用下面这份：

### DSH Remote Gateway vX.Y.Z

- DeepSeek Harness Web 手机远程访问网关
- 默认随机公网 URL + 随机 6 位密码 + 二维码
- Windows 版本保留主仓库分发
- macOS / Linux 版本通过 Release 附件分发

附件：

- `dsh-remote-gateway-vX.Y.Z-windows-x64.zip`
- `dsh-remote-gateway-vX.Y.Z-macos-arm64.zip`
- `dsh-remote-gateway-vX.Y.Z-macos-amd64.zip`
- `dsh-remote-gateway-vX.Y.Z-linux-amd64.zip`
- `dsh-remote-gateway-vX.Y.Z-linux-arm64.zip`
