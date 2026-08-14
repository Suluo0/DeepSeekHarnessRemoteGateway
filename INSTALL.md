# 安装说明

这份文档适合第一次从干净目录启动 `DSH Remote Gateway` 的用户。

## 前置条件

- 本地已经启动 `DeepSeek Harness Web`
- 已安装 `Node.js 22+`
- 已准备 `cloudflared`
  - 可以放在 `remote-gateway/bin/`
  - 也可以安装到系统 `PATH`

默认上游地址为：

```text
http://127.0.0.1:3080
```

如果你的 `dsh web` 不是这个端口，请修改 `config.json`。

## 1. 先检查配置文件

打开：

```text
remote-gateway/config.json
```

重点确认以下字段：

- `upstream.origin`
- `tunnel.enabled`
- `share.openOnStart`
- `auth.password`

如果 `auth.password` 为 `null`，每次启动都会自动生成一个新的随机 6 位密码。

## 2. 准备 `cloudflared`

方式 A：直接放二进制到项目内

- Windows：`remote-gateway/bin/cloudflared.exe`
- macOS/Linux：`remote-gateway/bin/cloudflared`

方式 B：全局安装

- 确保命令行里可以直接执行 `cloudflared`

如果你要做“按平台发布包”，请把平台二进制放到：

```text
remote-gateway/vendor/cloudflared/<target>/
```

然后执行：

```bash
npm run release:bundle -- <target>
```

## 3. 运行自检

```bash
npm run doctor
```

理想状态下，你应该看到这些检查通过：

- Node.js 版本正常
- `config.json` 能正确读取
- 上游 DSH 可访问
- `cloudflared` 能被发现

## 4. 启动网关

根据你的平台选择一个入口：

- Windows 资源管理器：`start_Windows.bat`
- Windows 兼容别名：`start.bat`
- PowerShell：`start.ps1`
- macOS/Linux 终端：`./start_Mac_or_Linux.sh`
- macOS/Linux 兼容别名：`./start.sh`
- macOS Finder：`start.command`

首次启动时，如果缺少 npm 依赖，启动器会自动执行安装。

## 5. 在手机端访问

启动成功后，网关会输出：

- 一个临时公网 URL
- 一个 6 位密码
- 一份终端二维码
- 一个本地分享页路径

如果桌面自动打开成功，你可以直接用手机扫描分享页上的二维码进入。

## 常见首启问题

### 提示 `Node.js 22+ was not found in PATH`

说明本机没有可用的 Node.js，安装 `Node.js 22` 或更高版本后再试。

### 提示 `cloudflared not found`

说明网关没有找到 `cloudflared`：

- 要么把文件放到 `bin/`
- 要么安装到系统 `PATH`

### 上游探测失败

说明网关访问不到 DSH：

- 确认 `dsh web` 已经启动
- 确认 `upstream.origin` 配置的是正确的本地地址和端口
