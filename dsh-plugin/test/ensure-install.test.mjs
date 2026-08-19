// dsh-remote-gateway — ensureGatewayInstalled 测试
// 新行为：首次运行时把包内 sidecar（src/、scripts/、bin/、config.json 等）复制到 gatewayDir，
// 实现 npm 安装后开箱即用（与本地手工部署体验无差别）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGatewayInstalled } from "../lib/index.js";

function makeSidecar(root) {
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "src", "index.js"), "export default 1");
  writeFileSync(join(root, "scripts", "start.js"), "console.log(1)");
  writeFileSync(join(root, "bin", "cloudflared.exe"), "MZ-binary");
  writeFileSync(join(root, "config.json"), JSON.stringify({ server: { bindPort: 8787 } }));
  writeFileSync(join(root, "runtime", ".gitkeep"), "");
  return root;
}

test("ensureGatewayInstalled: 目标目录为空 → 完整复制 sidecar（开箱即用）", async () => {
  const src = makeSidecar(mkdtempSync(join(tmpdir(), "rgw-src-")));
  const dst = mkdtempSync(join(tmpdir(), "rgw-dst-"));
  try {
    const result = ensureGatewayInstalled({ gatewayDir: dst, sourceDir: src });
    assert.equal(result.installed, true);
    assert.equal(result.reason, "installed");
    assert.equal(existsSync(join(dst, "scripts", "start.js")), true);
    assert.equal(existsSync(join(dst, "src", "index.js")), true);
    assert.equal(existsSync(join(dst, "bin", "cloudflared.exe")), true);
    assert.equal(existsSync(join(dst, "config.json")), true);
    assert.equal(readFileSync(join(dst, "config.json"), "utf8"), JSON.stringify({ server: { bindPort: 8787 } }));
  } finally { rmSync(src, { recursive: true, force: true }); rmSync(dst, { recursive: true, force: true }); }
});

test("ensureGatewayInstalled: 已安装（scripts/start.js 存在）→ 跳过，不覆盖用户数据", async () => {
  const src = makeSidecar(mkdtempSync(join(tmpdir(), "rgw-src-")));
  const dst = mkdtempSync(join(tmpdir(), "rgw-dst-"));
  try {
    mkdirSync(join(dst, "scripts"), { recursive: true });
    writeFileSync(join(dst, "scripts", "start.js"), "existing");
    writeFileSync(join(dst, "config.json"), JSON.stringify({ server: { bindPort: 9999 }, userCustom: true }));
    const result = ensureGatewayInstalled({ gatewayDir: dst, sourceDir: src });
    assert.equal(result.installed, false);
    assert.equal(result.reason, "already-installed");
    assert.equal(readFileSync(join(dst, "config.json"), "utf8"), JSON.stringify({ server: { bindPort: 9999 }, userCustom: true }), "不得覆盖已有 config.json");
    assert.equal(readFileSync(join(dst, "scripts", "start.js"), "utf8"), "existing");
  } finally { rmSync(src, { recursive: true, force: true }); rmSync(dst, { recursive: true, force: true }); }
});

test("ensureGatewayInstalled: 目标存在但缺 scripts/start.js（半安装）→ 补全且保留已有配置", async () => {
  const src = makeSidecar(mkdtempSync(join(tmpdir(), "rgw-src-")));
  const dst = mkdtempSync(join(tmpdir(), "rgw-dst-"));
  try {
    mkdirSync(join(dst, "runtime"), { recursive: true });
    writeFileSync(join(dst, "config.json"), JSON.stringify({ server: { bindPort: 7777 }, keep: true }));
    const result = ensureGatewayInstalled({ gatewayDir: dst, sourceDir: src });
    assert.equal(result.installed, true);
    assert.equal(result.reason, "installed");
    assert.equal(existsSync(join(dst, "scripts", "start.js")), true);
    assert.equal(readFileSync(join(dst, "config.json"), "utf8"), JSON.stringify({ server: { bindPort: 7777 }, keep: true }), "半安装时不得覆盖已有 config.json");
  } finally { rmSync(src, { recursive: true, force: true }); rmSync(dst, { recursive: true, force: true }); }
});
