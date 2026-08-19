// dsh-remote-gateway — 父进程存活检查（孤儿自清理）测试
// 1. src/index.js 的 startParentLivenessGuard：父进程消失 → 优雅退出 0；父进程存活 → 不退出
// 2. scripts/start.js 接线：由 dsh 托管启动（env REMOTE_GATEWAY_PARENT_PID）后父进程先死 →
//    即使卡在「等待上游」阶段也必须自行退出（而不是挂到 undici 超时 / 留下孤儿网关）
// 运行：node --test test/parent-guard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."); // dsh-plugin
// 仓库根布局：<repo>/src、<repo>/scripts 是 sidecar 本体，dsh-plugin/ 是插件包
const REPO_ROOT = dirname(ROOT);
const GATEWAY_DIR = existsSync(join(REPO_ROOT, "src", "index.js"))
  ? REPO_ROOT
  : existsSync(join(ROOT, "sidecar", "src", "index.js"))
    ? join(ROOT, "sidecar")
    : join(dirname(dirname(ROOT)), "remote-gateway");
const BLACKHOLE_UPSTREAM = "http://192.0.2.1:81/"; // TEST-NET-1：不可路由，连接挂起到超时，确保「等待上游」不会自然结束
function getDeadPid() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["-e", "setTimeout(()=>{},1)"]);
    p.on("exit", () => resolve(p.pid));
  });
}

async function runChild({ scriptArgs, parentPid, expectExit, timeoutMs }) {
  const child = spawn(process.execPath, scriptArgs, {
    cwd: GATEWAY_DIR,
    env: {
      ...process.env,
      REMOTE_GATEWAY_PARENT_PID: String(parentPid),
      REMOTE_GATEWAY_PARENT_CHECK_MS: "50",
      REMOTE_GATEWAY_TUNNEL_ENABLED: "false",
      REMOTE_GATEWAY_UPSTREAM_ORIGIN: BLACKHOLE_UPSTREAM,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { out += c; });
  const done = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal, out })));

  if (expectExit) {
    const result = await Promise.race([
      done,
      new Promise((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (result === null) {
      child.kill();
      throw new Error(`子进程在 ${timeoutMs}ms 内未退出（期望孤儿自清理）。输出: ${out || "(空)"}`);
    }
    return result;
  }

  // expectAlive：等待 timeoutMs 后必须仍然存活
  const finished = await Promise.race([
    done.then((v) => ({ finished: v, alive: false })),
    new Promise((r) => setTimeout(() => r({ finished: null, alive: true }), timeoutMs)),
  ]);
  if (!finished.alive) {
    throw new Error(`子进程应存活（父进程活着），却退出了: ${JSON.stringify(finished.finished)}`);
  }
  child.kill();
  await done;
}

test("guard: 父进程已消失 → 子进程优雅退出 0", async () => {
  const deadPid = await getDeadPid();
  const entry = `import(${JSON.stringify(pathToFileURL(join(GATEWAY_DIR, "src", "index.js")).href)}).then((m) => { m.startParentLivenessGuard(); setInterval(() => {}, 1000); }).catch((e) => { console.error(e); process.exit(3); })`;
  const r = await runChild({
    scriptArgs: ["-e", entry],
    parentPid: deadPid,
    expectExit: true,
    timeoutMs: 3000,
  });
  assert.equal(r.code, 0, `应 exit 0，实际 code=${r.code} signal=${r.signal}`);
});

test("guard: 父进程存活 → 不退出", async () => {
  await runChild({
    scriptArgs: ["-e", `import(${JSON.stringify(pathToFileURL(join(GATEWAY_DIR, "src", "index.js")).href)}).then((m) => { m.startParentLivenessGuard(); setInterval(() => {}, 1000); })`],
    parentPid: process.pid,
    expectExit: false,
    timeoutMs: 1200,
  });
});

test("start.js 接线: dsh 托管启动后父进程先死 → 卡在「等待上游」也必须退出 0", async () => {
  const deadPid = await getDeadPid();
  const r = await runChild({
    scriptArgs: [join(GATEWAY_DIR, "scripts", "start.js")],
    parentPid: deadPid,
    expectExit: true,
    timeoutMs: 4000,
  });
  assert.equal(r.code, 0, `应 exit 0，实际 code=${r.code} signal=${r.signal}`);
});
