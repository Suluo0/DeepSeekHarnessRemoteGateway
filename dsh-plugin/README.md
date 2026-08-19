# dsh-remote-gateway（DSH 插件包）

DeepSeek Harness 的「远程网关」设置页插件：在 DSH 设置页提供远程网关的待批设备审批、已信任设备白名单管理与网关生命周期控制，并随包自带白名单版 sidecar 网关（开箱即用）。

## 安装

```bash
dsh plugin --profile web add dsh-remote-gateway
```

或本地 tarball：

```bash
npm pack          # 产出 dsh-remote-gateway-<ver>.tgz（先 npm run build:sidecar）
dsh plugin --profile web add ./dsh-remote-gateway-<ver>.tgz
```

装完后：

1. DSH 设置页出现「远程网关」段（顺序 45）。
2. 插件首次启动自动把包内 sidecar 部署到 `~/.dsh/remote-gateway`（已存在则不覆盖，保留你的 config.json / 白名单）。
3. 默认 autoStart 开启，网关随 dsh 自动启停；崩溃自动重启（指数退避）。
4. 手机访问隧道 URL 进入门禁页 → 在设置页「远程网关」段批准设备 → 入白名单可访问。

## 开发

```bash
npm install          # 安装 peer 依赖（schemastery / client-ui-primitives）
npm test             # bridge / controller / ensure-install 测试
node scripts/build-sidecar.mjs   # 把仓库根 sidecar 复制进 sidecar/（pack 前必做）
npm pack             # 产出可安装 tgz
```

## 结构

- `lib/index.js` 服务端：同源桥接 `/_dsh/remote-gateway` + 网关生命周期控制器 + `ensureGatewayInstalled`（首次运行部署 sidecar）
- `lib/client.js` 设置页 UI（审批、设备管理、启停、autoStart）
- `cordis.patch.yml` bundle patch（向 profile 挂载本插件）
- `sidecar/` 随包分发的白名单版 sidecar 网关（构建产物，不入 git）
- `test/` 测试

## 依赖

peerDependencies：`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/schemastery`（由 dsh web profile 提供）。

## License

MIT
