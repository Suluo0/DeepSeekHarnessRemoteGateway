// 桥接 handler 端到端测试：mock 网关（主面 + 管理面）+ 假 dsh ctx，
// 真实 http server 承载 lib/index.js 注册的 handler，断言桥接契约。
// 运行：node --test test/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as plugin from "../lib/index.js";

const LISTEN = 19001, ADMIN = 19002, BRIDGE = 19003;
const dir = join(tmpdir(), "rgw-bridge-test");

let main, admin, bridge;
const pending = [{ id: "p1", token: "tok-p1", note: "测试手机", createdAt: Date.now() - 120000, expiresAt: Date.now() + 600000 }];
const devices = [{ token: "tok-dev1", note: "主力笔记本", addedAt: 1700000000000, lastSeen: Date.now() - 3600000 }];

before(async () => {
  // 临时网关配置 → mock 端口
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify({ server: { bindAddress: "127.0.0.1", bindPort: LISTEN } }));
  process.env.REMOTE_GATEWAY_DIR = dir;
  // 生命周期管理器：预置 autoStart=false → apply() 里的 onBoot 保持空闲，
  // 避免测试期间 spawn 真实网关 / 挂住事件循环（controller 行为由 controller.test.mjs 覆盖）
  mkdirSync(join(dir, "runtime"), { recursive: true });
  writeFileSync(join(dir, "runtime", "plugin-state.json"), JSON.stringify({ autoStart: false }));
  main = createServer((req, res) => {
    if (req.url === "/_gateway/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, upstream: "http://127.0.0.1:3080", tunnel: "https://mock.trycloudflare.com" }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });

  admin = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/_gateway/api/pending") return res.end(JSON.stringify({ ok: true, pending }));
    if (req.method === "GET" && req.url === "/_gateway/api/devices") return res.end(JSON.stringify({ ok: true, devices }));
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        if (req.url === "/_gateway/api/approve") { pending.length = 0; res.end(JSON.stringify({ ok: true, result: "approved", echoed: body })); return; }
        if (req.url === "/_gateway/api/reject") res.end(JSON.stringify({ ok: true, result: "rejected", echoed: body }));
        else if (req.url === "/_gateway/api/revoke") res.end(JSON.stringify({ ok: true, result: "revoked", echoed: body }));
        else { res.statusCode = 404; res.end("{}"); }
      });
      return;
    }
    res.statusCode = 404; res.end("{}");
  });

  // 假 dsh ctx → 真 http server 承载插件 handler
  bridge = createServer();
  plugin.apply({
    inject: (deps, cb) => {
      cb({
        webServer: {
          register: ({ handler }) => {
            bridge.on("request", handler);
            return () => bridge.removeAllListeners("request");
          }
        },
        effect: (fn) => fn()
      });
    }
  });

  await new Promise((r) => main.listen(LISTEN, "127.0.0.1", r));
  await new Promise((r) => admin.listen(ADMIN, "127.0.0.1", r));
  await new Promise((r) => bridge.listen(BRIDGE, "127.0.0.1", r));
});

after(() => {
  for (const s of [main, admin, bridge]) {
    if (!s) continue;
    s.closeAllConnections?.();
    s.on("error", () => {});
    try { s.close(); } catch { /* 已关闭 */ }
  }
  rmSync(dir, { recursive: true, force: true });
});

const base = `http://127.0.0.1:${BRIDGE}/_dsh/remote-gateway`;
async function get() { return (await fetch(base)).json(); }
async function post(body) {
  return (await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
}

test("GET: 网关运行时返回完整形状", async () => {
  const j = await get();
  assert.equal(j.ok, true);
  assert.equal(j.running, true);
  assert.equal(j.gateway.localUrl, `http://127.0.0.1:${LISTEN}`);
  assert.equal(j.gateway.adminUrl, `http://127.0.0.1:${ADMIN}`);
  assert.equal(j.gateway.tunnel, "https://mock.trycloudflare.com");
  assert.equal(j.gateway.upstream, "http://127.0.0.1:3080");
  assert.equal(j.pending.length, 1);
  assert.equal(j.pending[0].note, "测试手机");
  assert.equal(j.devices.length, 1);
  assert.equal(j.devices[0].token, "tok-dev1");
});

test("POST approve: 转发并只回传 {ok, result}", async () => {
  const j = await post({ action: "approve", id: "p1" });
  assert.equal(j.ok, true);
  assert.equal(j.result, "approved");
  assert.equal("echoed" in j, false);
});

test("POST reject / revoke: 转发成功", async () => {
  assert.equal((await post({ action: "reject", id: "pX" })).ok, true);
  assert.equal((await post({ action: "revoke", token: "tok-dev1" })).ok, true);
});

test("POST 未知 action: ok=false", async () => {
  const j = await post({ action: "bogus" });
  assert.equal(j.ok, false);
  assert.match(j.error, /Unsupported action/);
});

test("GET: 网关宕机时降级为 running=false + 空列表", async () => {
  main.close(); admin.close();
  await new Promise((r) => setTimeout(r, 300));
  const j = await get();
  assert.equal(j.running, false);
  assert.deepEqual(j.pending, []);
  assert.deepEqual(j.devices, []);
});
