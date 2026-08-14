# 发布检查清单

## 发布前确认

- 确认 `remote-gateway/README.md` 与实际文件名一致
- 确认 `remote-gateway/INSTALL.md` 在干净机器上也能走通
- 确认至少有一台真实机器通过了 `npm run doctor`
- 确认你计划发布的目标都能成功执行 `npm run release:bundle -- <target>`
- 确认至少有一个 Windows 启动入口可用
- 确认至少有一个 macOS 或 Linux 启动入口可用
- 确认二维码流程仍然可以正常打开远程 DeepSeek Harness Web
- 确认提交的 `config.json` 中，`auth.password` 是否符合你的默认发布策略
- 确认没有把本地日志和运行时临时文件带进发布内容

## 推荐保留的发布文件

- `README.md`
- `INSTALL.md`
- `FAQ.md`
- `RELEASE_CHECKLIST.md`
- `config.json`
- `package.json`
- `package-lock.json`
- `src/`
- `scripts/`
- `bin/README.md`
- 启动器：`start_Windows.bat`、`start.bat`、`start.ps1`、`start_Mac_or_Linux.sh`、`start.sh`、`start.command`

## 可选发布策略

- 把 `cloudflared` 直接放进 `bin/`
- 不内置 `cloudflared`，改为文档说明用户自行准备
- 默认使用随机密码
- 默认改成固定密码

## 打包命令

- 单平台打包：`npm run release:bundle -- windows-x64`
- 多平台打包并跳过缺失二进制：`npm run release:bundle -- --all --allow-missing`
