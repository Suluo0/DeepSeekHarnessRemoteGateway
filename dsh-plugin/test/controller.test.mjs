// dsh-remote-gateway — GatewayController 生命周期测试
// 纯工厂 + 假子进程（EventEmitter 桩），不 spawn 真实进程、不依赖真实网关。
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createGatewayController } from "../lib/index.js";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function makeFakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.killCalls = [];
  child.kill = (signal) => {
    child.killed = true;
    child.killCalls.push(signal);
    return true;
  };
  return child;
}

function makeController({ dir, port, spawnCalls, children, stateFile } = {}) {
  return createGatewayController({
    gatewayDir: dir,
    probeUrl: `http://127.0.0.1:${port}`,
    logFile: join(dir, "managed.log"),
    stateFile: stateFile || join(dir, "state.json"),
    nodeBin: "node",
    startArgs: [join(dir, "scripts", "start.js")],
    backoffBaseMs: 20,
    backoffCapMs: 80,
    killGraceMs: 50,
    probeTimeoutMs: 200,
    spawnFn: (bin, args, opts) => {
      spawnCalls.push({ bin, args, opts });
      const c = makeFakeChild();
      children.push(c);
      setImmediate(() => c.emit("spawn"));
      return c;
    },
    log: () => {},
  });
}

test("createGatewayController is exported as a factory", () => {
  assert.equal(typeof createGatewayController, "function");
});

test("start() adopts an externally running gateway without spawning", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, status: "running", port: 0 }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const spawnCalls = [];
  const children = [];
  const ctl = makeController({ dir, port, spawnCalls, children });

  const r = await ctl.start();
  assert.equal(r.result, "adopted");
  assert.equal(spawnCalls.length, 0);
  const s = ctl.getState();
  assert.equal(s.managed, false);
  assert.equal(s.childAlive, false);
  assert.equal(s.desired, "running");
  ctl.dispose();
  server.close();
});

test("start() spawns when probe fails; stop() sends SIGTERM; intentional exit does not restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  const spawnCalls = [];
  const children = [];
  const ctl = makeController({ dir, port: 1, spawnCalls, children }); // port 1 → probe refused

  const r = await ctl.start();
  assert.equal(r.result, "starting");
  assert.equal(spawnCalls.length, 1);
  assert.deepEqual(spawnCalls[0].args, [join(dir, "scripts", "start.js")]);
  assert.equal(spawnCalls[0].opts.env.REMOTE_GATEWAY_PARENT_PID, String(process.pid));
  await tick();
  let s = ctl.getState();
  assert.equal(s.childAlive, true);
  assert.equal(s.managed, true);

  const stopR = ctl.stop();
  assert.equal(stopR.result, "stopping");
  assert.deepEqual(children[0].killCalls, ["SIGTERM"]);

  children[0].emit("exit", 0, "SIGTERM");
  s = ctl.getState();
  assert.equal(s.childAlive, false);
  assert.equal(s.lastExit.intentional, true);
  await tick(100); // backoff window — must NOT restart after stop
  assert.equal(spawnCalls.length, 1);
  ctl.dispose();
});

test("crash triggers backoff restart; backoff grows; stop cancels pending restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  const spawnCalls = [];
  const children = [];
  const ctl = makeController({ dir, port: 1, spawnCalls, children });

  await ctl.start();
  assert.equal(spawnCalls.length, 1);

  children[0].emit("exit", 1, null); // crash
  let s = ctl.getState();
  assert.equal(s.lastExit.intentional, false);
  assert.equal(s.lastExit.code, 1);
  assert.equal(s.restartPending, true);
  assert.ok(s.backoffMs >= 40, "backoff must have grown after scheduling");

  await tick(100); // base 20ms → restart must have happened
  assert.equal(spawnCalls.length, 2);
  assert.equal(ctl.getState().childAlive, true);

  children[1].emit("exit", 75, null); // watchdog-style exit 75
  await tick(200); // 2nd backoff 40ms (cap 80) → restart again
  assert.equal(spawnCalls.length, 3);

  const stopR = ctl.stop(); // must cancel the running/pending state
  assert.equal(stopR.result, "stopping");
  children[2].emit("exit", 0, "SIGTERM");
  await tick(200);
  assert.equal(spawnCalls.length, 3, "no restart after stop");
  ctl.dispose();
});

test("dispose() suppresses restarts and persists state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  const spawnCalls = [];
  const children = [];
  const ctl = makeController({ dir, port: 1, spawnCalls, children });

  ctl.setAutoStart(true);
  const persisted = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.deepEqual(persisted, { autoStart: true });

  ctl.onBoot(); // autoStart=true → starts
  await tick();
  assert.equal(spawnCalls.length, 1);

  await ctl.dispose(); // shuttingDown
  children[0].emit("exit", 1, null);
  await tick(150);
  assert.equal(spawnCalls.length, 1, "no restart after dispose");
});

test("onBoot() with autoStart=false does not spawn", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  mkdirSync(join(dir, "runtime"), { recursive: true });
  const stateFile = join(dir, "state.json");
  writeFileSync(stateFile, JSON.stringify({ autoStart: false }));
  const spawnCalls = [];
  const children = [];
  const ctl = makeController({ dir, port: 1, spawnCalls, children, stateFile });

  ctl.onBoot();
  await tick(100);
  assert.equal(spawnCalls.length, 0);
  assert.equal(ctl.getState().desired, "stopped");
  ctl.dispose();
});

test("setAutoStart(false) persists and is honored by a fresh controller onBoot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  const stateFile = join(dir, "state.json");
  const a = makeController({ dir, port: 1, spawnCalls: [], children: [], stateFile });
  a.setAutoStart(false);
  a.dispose();

  const spawnCalls = [];
  const children = [];
  const b = makeController({ dir, port: 1, spawnCalls, children, stateFile });
  b.onBoot();
  await tick(100);
  assert.equal(spawnCalls.length, 0);
  b.dispose();
});

test("restartCount 随每次退避重启递增（UI「自动重启 × N」数据源）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rgw-ctl-"));
  const spawnCalls = [];
  const children = [];
  const ctl = makeController({ dir, port: 1, spawnCalls, children });

  await ctl.start();
  await tick(50);
  assert.equal(spawnCalls.length, 1);
  assert.equal(ctl.getState().restartCount, 0, "尚未发生重启 → 计数为 0");

  children[0].emit("exit", 1, null);
  await tick(50); // base 20ms → 第 1 次退避重启
  assert.equal(spawnCalls.length, 2);
  assert.equal(ctl.getState().restartCount, 1);

  children[1].emit("exit", 1, null);
  await tick(100); // 40ms 退避 → 第 2 次
  assert.equal(spawnCalls.length, 3);
  assert.equal(ctl.getState().restartCount, 2);
  ctl.dispose();
});
