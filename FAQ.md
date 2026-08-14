# 常见问题

## 需要修改 DeepSeek Harness 本体吗？

不需要。这个网关是 sidecar 形态，它通过代理 DeepSeek Harness Web 来提供远程访问能力，不会修改 DeepSeek Harness 的源码。

## 必须有公网 IP 或自己的域名吗？

默认方案不需要。Quick Tunnel 会提供一个随机的临时公网地址。

## 必须有自己的云服务吗？

基础使用不需要。默认方案是本地自托管，只是在本机上额外起一个网关和隧道。

## 为什么每次启动密码都不一样？

因为 `config.json` 默认把 `auth.password` 设为 `null`。在这个模式下，每次启动都会生成新的随机 6 位密码。

如需固定密码，直接在 `config.json` 里写死即可。

## 可以关闭隧道，只在本地使用吗？

可以。把配置改成：

```json
{
  "tunnel": {
    "enabled": false
  }
}
```

## 如果我的 `dsh web` 不在 `3080` 端口怎么办？

把配置改成实际使用的端口，例如：

```json
{
  "upstream": {
    "origin": "http://127.0.0.1:YOUR_PORT"
  }
}
```

## 为什么手机扫了二维码以后，还是要输入密码？

这是正常设计。二维码只负责打开公网访问地址，真正进入 DeepSeek Harness Web 之前，网关会先走一层登录页保护。

## 可以把 `cloudflared` 直接放进仓库里吗？

可以。直接放到 `remote-gateway/bin/` 即可，具体规则见 `remote-gateway/bin/README.md`。

## 支持 macOS 和 Linux 吗？

支持。根据平台选择 `start_Mac_or_Linux.sh`、`start.sh` 或 `start.command` 即可。

## 发布时可以把 `cloudflared` 一起打进包里吗？

可以。当前已经支持按平台生成发布包，并把对应的 `cloudflared` 复制到每个平台包内的 `bin/` 目录。

## Linux 和 macOS 的 `cloudflared` 一定要提交到仓库吗？

不一定。当前推荐策略是：

- Windows 版本可以继续保留在仓库里
- Linux 和 macOS 二进制不提交到主分支
- Linux 和 macOS 版本改为通过 GitHub Release 附件分发
