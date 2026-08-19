# 常见问题

## 需要修改 DeepSeek Harness 本体吗？

不需要。这个网关是 sidecar 形态，它通过代理 DeepSeek Harness Web 来提供远程访问能力，不会修改 DeepSeek Harness 的源码。

## 必须有公网 IP 或自己的域名吗？

默认方案不需要。Quick Tunnel 会提供一个随机的临时公网地址。

## 必须有云服务吗？

基础使用不需要。默认方案是本地自托管，只是在本机上额外起一个网关和隧道。

## 还需要输入密码吗？

不需要。本 fork 已移除密码登录体系，改为设备白名单：新设备访问时进入门禁页，在受控电脑的审批页（http://127.0.0.1:8788/_gateway/approve）点击「批准」后即可访问。

## 手机换了新设备，为什么又要批准？

这是设计行为。每个设备有独立的 192-bit 随机 token，首次访问必须批准；换设备后新 token 需要重新批准。可以在管理页（http://127.0.0.1:8788/_gateway/admin）吊销任意已批准设备。

## 待批条目会自动过期吗？

会。待批条目 120 秒 TTL：设备停留在门禁页轮询时会自动续期，无人理会即过期；同时待批队列有 100 条容量上限，超出时淘汰最旧条目，防止被刷爆。

## 可以关闭隧道，只在本地使用吗？

可以。把配置改成：

```json
{
  "tunnel": {
    "enabled": false
  }
}
```

即使 cloudflared 缺失或隧道启动失败，网关照常启动，本地功能不受影响。

## 管理端口（8788）公网能访问吗？

不能。管理端口只监听 127.0.0.1，隧道只转发主端口（8787），审批/设备管理在物理网络上不可达。主端口上的 /_gateway/approve、/_gateway/admin、/_gateway/api/* 一律返回 403。

## 如果我的 dsh web 不在 3080 端口怎么办？

把配置改成实际使用的端口，例如：

```json
{
  "upstream": {
    "origin": "http://127.0.0.1:YOUR_PORT"
  }
}
```

## 可以把 cloudflared 直接放进仓库里吗？

可以。Windows 二进制已放在 bin/cloudflared.exe（本仓库内置）；也可安装到系统 PATH。具体规则见 bin/README.md。

## 本 fork 支持 macOS 和 Linux 吗？

核心代码仍是跨平台 Node.js，但本 fork 精简了启动入口，只保留 Windows 启动脚本（start_Windows.bat / start.bat / start.ps1 / restart.bat）。macOS/Linux 用户可自行用 node scripts/start.js 启动。

## 为什么 health 接口不再返回密码？

本 fork 移除了密码体系，/_gateway/health 只返回 ok / upstream / tunnel，不再泄露任何凭据。

## 白名单文件被误删/损坏了怎么办？

whitelist.json（runtime/whitelist.json）缺失或损坏时网关 fail-closed：所有设备都不可信，但管理端口（8788）仍可用，重新批准设备即可恢复访问。
