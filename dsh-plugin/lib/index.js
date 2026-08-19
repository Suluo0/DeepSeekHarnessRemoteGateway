// dsh-remote-gateway — 服务端 bundle（Node 半边）
// 两个职责：
//   1. 同源桥接：设置页「远程网关」段同源访问 /_dsh/remote-gateway，
//      转发到 remote-gateway 的管理面（仅监听 loopback，端口 = bindPort + 1）。
//   2. 生命周期管理：dsh 启动时按 autoStart（默认开，状态文件可关）把网关
//      spawn 为子进程（node scripts/start.js）；崩溃（含 watchdog 的 exit 75）
//      指数退避自动重启；dsh 关闭时由框架 dispose 返回值停掉子进程。
//   GET  /_dsh/remote-gateway  → { running, gateway{...}, control{...}, pending, devices }
//   POST /_dsh/remote-gateway  → { action: approve|reject|revoke|start|stop|setAutoStart, ... }
//                                → { ok, result|error }

import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import z from "@deepseek-ai/schemastery";

export const name = "remote-gateway";
export const inject = [];

export const Config = z.object({}).default({});

const ACTION_ROUTES = {
  approve: "_gateway/api/approve",
  reject: "_gateway/api/reject",
  revoke: "_gateway/api/revoke",
};

function resolveGatewayDir() {
  return process.env.REMOTE_GATEWAY_DIR || join(homedir(), ".dsh", "remote-gateway");
}

function resolveGatewayUrls() {
  // 与网关启动脚本同源：~/.dsh/remote-gateway/config.json 的 server.bindPort；管理端口 = bindPort + 1
  let bindPort = 8787;
  try {
    const raw = JSON.parse(readFileSync(join(resolveGatewayDir(), "config.json"), "utf8"));
    const parsed = Number.parseInt(String(raw?.server?.bindPort), 10);
    if (Number.isFinite(parsed) && parsed > 0) bindPort = parsed;
  } catch {
    // 配置缺失 → 用默认端口
  }
  return {
    localUrl: `http://127.0.0.1:${bindPort}`,
    adminUrl: `http://127.0.0.1:${bindPort + 1}`,
  };
}

// 包内 sidecar 目录：npm 包自带 src/、scripts/、bin/、config.json、启动脚本等
// （由 scripts/build-sidecar.mjs 在 pack 前从仓库根复制生成）。
function resolveBundledSidecarDir() {
  const here = dirname(fileURLToPath(import.meta.url)); // <pkg>/lib
  return join(dirname(here), "sidecar");
}

// 开箱即用：首次运行把包内 sidecar 复制到 gatewayDir（~/.dsh/remote-gateway）。
//  - gatewayDir 已有 scripts/start.js → 视为已安装，跳过（不覆盖用户 config.json / 白名单）
//  - 半安装（缺 scripts/start.js）→ 补全缺失文件，保留已有 config.json / runtime
//  - 返回 { installed, reason }：installed=true 表示本次完成安装/补全
//  - 包内无 sidecar 时降级为 not-bundled（例如纯源码目录里直接 import）
export function ensureGatewayInstalled({ gatewayDir = resolveGatewayDir(), sourceDir = resolveBundledSidecarDir(), log = (m) => console.error(`[remote-gateway] ${m}`) } = {}) {
  try {
    if (!existsSync(join(gatewayDir, "scripts", "start.js"))) {
      if (!existsSync(sourceDir)) {
        log(`包内未找到 sidecar 目录: ${sourceDir}（跳过自动安装）`);
        return { installed: false, reason: "not-bundled" };
      }
      mkdirSync(gatewayDir, { recursive: true });
      // 复制但不覆盖已有文件：保留用户 config.json / runtime（白名单、状态等）
      cpSync(sourceDir, gatewayDir, { recursive: true, force: false, errorOnExist: false });
      // 强制确保 runtime 目录存在
      mkdirSync(join(gatewayDir, "runtime"), { recursive: true });
      const marker = existsSync(join(gatewayDir, "scripts", "start.js"));
      log(`sidecar 安装完成（${marker ? "完整" : "部分"}）→ ${gatewayDir}`);
      return { installed: true, reason: marker ? "installed" : "partial" };
    }
    return { installed: false, reason: "already-installed" };
  } catch (err) {
    log(`sidecar 安装失败: ${err?.message || err}`);
    return { installed: false, reason: "error" };
  }
}

async function fetchJson(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || "invalid json" };
    }
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(response, status, payload) {
  if (response.headersSent) return;
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    request.on("error", () => resolve({}));
  });
}

// ── 网关生命周期管理 ──────────────────────────────────────────────────────────
// 子进程 = `node <gatewayDir>/scripts/start.js`（cwd = gatewayDir）。
//  - start() 先探测健康：已有外部运行实例则「接管」（managed=false，只读展示，不替它停）
//  - 崩溃（含 watchdog exit 75）按指数退避（base→cap）自动重启；稳定运行 30s 后重置退避
//  - stop()/dispose() 发 SIGTERM（网关自带 handler 清理内部进程），宽限期内未退出则强杀
export function createGatewayController(options = {}) {
  const {
    gatewayDir = resolveGatewayDir(),
    probeUrl = resolveGatewayUrls().localUrl,
    logFile = join(gatewayDir, "runtime", "dsh-managed.log"),
    stateFile = join(gatewayDir, "runtime", "plugin-state.json"),
    nodeBin = process.execPath,
    startArgs = [join(gatewayDir, "scripts", "start.js")],
    backoffBaseMs = 1000,
    backoffCapMs = 60000,
    killGraceMs = 5000,
    probeTimeoutMs = 1500,
    spawnFn = spawn,
    log = (message) => console.error(`[remote-gateway] ${message}`),
  } = options;

  let autoStart = true;
  let desired = "stopped";
  let managed = false;
  let child = null;
  let spawning = false;
  let startedAt = 0;
  let restartTimer = null;
  let forceKillTimer = null;
  let lastExit = null;
  let shuttingDown = false;
  let backoffMs = backoffBaseMs;
  let restartCount = 0;

  function loadState() {
    try {
      const raw = JSON.parse(readFileSync(stateFile, "utf8"));
      if (typeof raw?.autoStart === "boolean") autoStart = raw.autoStart;
    } catch {
      // 首次启动 → 默认 autoStart=true
    }
  }

  function saveState() {
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(stateFile, JSON.stringify({ autoStart }, null, 2));
    } catch (err) {
      log(`写入状态失败: ${err.message}`);
    }
  }

  async function probe() {
    try {
      const r = await fetchJson(`${probeUrl}/_gateway/health`, {}, probeTimeoutMs);
      return r.status === 200 && Boolean(r.data && r.data.ok);
    } catch {
      return false;
    }
  }

  function scheduleRestart() {
    if (shuttingDown || desired !== "running" || restartTimer) return;
    const delay = backoffMs;
    restartCount += 1;
    backoffMs = Math.min(backoffMs * 2, backoffCapMs);
    log(`网关已退出，${delay}ms 后自动重启（下次退避 ${backoffMs}ms）`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void spawnChild();
    }, delay);
  }

  async function spawnChild() {
    if (shuttingDown || desired !== "running" || child || spawning) return "noop";
    const already = await probe();
    if (shuttingDown || desired !== "running") return "noop";
    if (already) {
      managed = false;
      log("网关已在运行（外部启动），接管为只读管理");
      return "adopted";
    }
    managed = true;
    spawning = true;
    let logFd = -1;
    try {
      mkdirSync(dirname(logFile), { recursive: true });
      logFd = openSync(logFile, "a");
    } catch (err) {
      log(`无法打开日志 ${logFile}（${err.message}），子进程输出走 stderr`);
      logFd = 2;
    }
    let proc;
    try {
      proc = spawnFn(nodeBin, startArgs, {
        cwd: gatewayDir,
        env: { ...process.env, REMOTE_GATEWAY_PARENT_PID: String(process.pid) },
        stdio: ["ignore", logFd, logFd],
        windowsHide: true,
      });
    } catch (err) {
      if (logFd > 0) { try { closeSync(logFd); } catch {} }
      spawning = false;
      lastExit = { code: null, signal: null, at: Date.now(), error: String(err?.message || err) };
      log(`spawn 失败: ${err.message}`);
      scheduleRestart();
      return "noop";
    }
    child = proc;
    startedAt = Date.now();
    proc.on("spawn", () => {
      spawning = false;
      if (logFd > 0) { try { closeSync(logFd); } catch {} }
      log(`网关已启动 pid=${proc.pid}`);
    });
    proc.on("error", (err) => {
      spawning = false;
      if (child === proc) child = null;
      lastExit = { code: null, signal: null, at: Date.now(), error: String(err?.message || err) };
      log(`子进程错误: ${err.message}`);
      scheduleRestart();
    });
    proc.on("exit", (code, signal) => {
      spawning = false;
      if (child === proc) child = null;
      lastExit = {
        code,
        signal,
        at: Date.now(),
        intentional: shuttingDown || desired === "stopped",
      };
      log(`网关退出 code=${code} signal=${signal} intentional=${lastExit.intentional}`);
      if (!lastExit.intentional && Date.now() - startedAt > 30000) {
        backoffMs = backoffBaseMs; // 稳定运行过 30s → 重置退避
      }
      scheduleRestart();
    });
    return "spawned";
  }

  async function start() {
    if (shuttingDown) return { result: "shutting-down" };
    desired = "running";
    if (child) return { result: "already-running" };
    if (spawning || restartTimer) return { result: "pending" };
    const how = await spawnChild();
    if (how === "adopted") return { result: "adopted" };
    return { result: "starting" };
  }

  function stop() {
    desired = "stopped";
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (!child) return { result: "already-stopped" };
    const proc = child;
    log("停止网关 (SIGTERM)...");
    try { proc.kill("SIGTERM"); } catch {}
    if (forceKillTimer) clearTimeout(forceKillTimer);
    forceKillTimer = setTimeout(() => {
      forceKillTimer = null;
      if (proc.exitCode === null && proc.signalCode === null) {
        log("子进程未在宽限期内退出，强杀 (SIGKILL)");
        try { proc.kill("SIGKILL"); } catch {}
      }
    }, killGraceMs);
    return { result: "stopping" };
  }

  function setAutoStart(enabled) {
    autoStart = Boolean(enabled);
    saveState();
    log(`autoStart=${autoStart}`);
    return { result: autoStart ? "auto-start-enabled" : "auto-start-disabled" };
  }

  function onBoot() {
    loadState();
    desired = autoStart ? "running" : "stopped";
    if (autoStart) {
      void start().catch((err) => log(`自动启动失败: ${err?.message || err}`));
    } else {
      log("autoStart 已关闭（状态文件），不自动启动网关");
    }
  }

  async function dispose() {
    shuttingDown = true;
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (forceKillTimer) { clearTimeout(forceKillTimer); forceKillTimer = null; }
    saveState();
    if (child) {
      const proc = child;
      log("dsh 正在退出，停止网关子进程...");
      await new Promise((resolve) => {
        if (proc.exitCode !== null || proc.signalCode !== null) { resolve(); return; }
        try { proc.kill("SIGTERM"); } catch {}
        const force = setTimeout(() => {
          if (proc.exitCode === null && proc.signalCode === null) {
            try { proc.kill("SIGKILL"); } catch {}
            setTimeout(resolve, 300).unref?.();
          }
        }, killGraceMs);
        proc.once("exit", () => { clearTimeout(force); resolve(); });
      });
    }
  }

  function getState() {
    return {
      autoStart,
      desired,
      managed,
      pid: child ? child.pid : null,
      childAlive: Boolean(child),
      spawning,
      restartPending: Boolean(restartTimer),
      backoffMs,
      restartCount,
      lastExit,
    };
  }

  return { start, stop, setAutoStart, onBoot, dispose, getState };
}

// ── 插件入口 ──────────────────────────────────────────────────────────────────

export function apply(ctx) {
  // 开箱即用：首次运行安装 sidecar（失败不阻断，仅桥接仍可用）
  let controller = null;
  try {
    const dir = resolveGatewayDir();
    mkdirSync(join(dir, "runtime"), { recursive: true });
    ensureGatewayInstalled({ gatewayDir: dir });
    controller = createGatewayController({
      gatewayDir: dir,
      probeUrl: resolveGatewayUrls().localUrl,
      logFile: join(dir, "runtime", "dsh-managed.log"),
      stateFile: join(dir, "runtime", "plugin-state.json"),
    });
    controller.onBoot();
  } catch (err) {
    console.error("[remote-gateway] 生命周期管理器初始化失败（仅桥接可用）:", err.message);
    controller = null;
  }

  ctx.inject(["webServer"], function (webCtx) {
    webCtx.effect(function () {
      const dispose = webCtx.webServer.register({
        kind: "exact",
        path: "/_dsh/remote-gateway",
        handler: async function (req, res) {
          const { localUrl, adminUrl } = resolveGatewayUrls();

          if (req.method === "GET") {
            let health = null;
            try {
              const h = await fetchJson(`${localUrl}/_gateway/health`);
              if (h.status === 200 && h.data && h.data.ok) health = h.data;
            } catch {
              // 网关未运行
            }
            let pending = [];
            let devices = [];
            if (health) {
              try {
                const [p, d] = await Promise.all([
                  fetchJson(`${adminUrl}/_gateway/api/pending`),
                  fetchJson(`${adminUrl}/_gateway/api/devices`),
                ]);
                pending = (p.data && p.data.pending) || [];
                devices = (d.data && d.data.devices) || [];
              } catch {
                // 管理面不可达时保持空列表
              }
            }
            sendJson(res, 200, {
              ok: true,
              running: Boolean(health),
              gateway: {
                localUrl,
                adminUrl,
                upstream: health ? health.upstream || null : null,
                tunnel: health ? health.tunnel || null : null,
              },
              control: controller ? controller.getState() : { lifecycle: "disabled" },
              pending,
              devices,
            });
            return;
          }

          if (req.method === "POST") {
            const body = await readBody(req);
            const action = String(body.action ?? "");

            // 生命周期动作（本地处理，不经过网关）
            if (controller) {
              if (action === "start" || action === "stop") {
                try {
                  const r = action === "start" ? await controller.start() : controller.stop();
                  sendJson(res, 200, { ok: true, result: r.result });
                } catch (err) {
                  sendJson(res, 200, { ok: false, error: String(err?.message || err) });
                }
                return;
              }
              if (action === "setAutoStart") {
                try {
                  const r = controller.setAutoStart(body.enabled === true);
                  sendJson(res, 200, { ok: true, result: r.result });
                } catch (err) {
                  sendJson(res, 200, { ok: false, error: String(err?.message || err) });
                }
                return;
              }
            }

            const route = ACTION_ROUTES[action];
            if (!route) {
              sendJson(res, 400, { ok: false, error: `Unsupported action: ${action}` });
              return;
            }
            const payload =
              action === "revoke"
                ? { token: String(body.token ?? "") }
                : { id: String(body.id ?? "") };
            try {
              const r = await fetchJson(`${adminUrl}/${route}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (r.status === 200) {
                sendJson(res, 200, { ok: true, result: r.data ? r.data.result ?? null : null });
              } else {
                sendJson(res, 200, { ok: false, error: (r.data && r.data.error) || `HTTP ${r.status}` });
              }
            } catch {
              sendJson(res, 200, { ok: false, error: "gateway-unreachable" });
            }
            return;
          }

          sendJson(res, 405, { ok: false, error: "method not allowed" });
        },
      });
      console.error("[remote-gateway] 同源设置路由: /_dsh/remote-gateway");
      return dispose;
    }, "remote-gateway: web settings route");
  });

  return function () {
    if (controller) {
      return controller.dispose().catch((err) => {
        console.error("[remote-gateway] dispose 失败:", err.message);
      });
    }
  };
}
