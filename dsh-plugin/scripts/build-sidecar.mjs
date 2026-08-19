// build-sidecar.mjs — 把仓库根（sidecar 本体）复制进 dsh-plugin/sidecar/，
// 使 npm 包自带完整网关（src/、scripts/、bin/cloudflared.exe、config.json、启动脚本），
// 插件 ensureGatewayInstalled 首次运行即可部署，实现开箱即用。
// 用法：node scripts/build-sidecar.mjs
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));       // dsh-plugin/scripts
const PLUGIN_ROOT = resolve(HERE, "..");                     // dsh-plugin
const REPO_ROOT = resolve(PLUGIN_ROOT, "..");                // 仓库根（sidecar 本体）
const SIDECAR_DEST = join(PLUGIN_ROOT, "sidecar");

// 需要打包进插件的 sidecar 文件/目录（相对仓库根）
const SIDECAR_ITEMS = [
  "src",
  "scripts",
  "bin",
  "test",
  "config.json",
  "package.json",
  "package-lock.json",
  ".gitignore",
  "restart.bat",
  "start.bat",
  "start.ps1",
  "start_Windows.bat",
  "README.md",
  "INSTALL.md",
  "FAQ.md",
  "LICENSE",
];

function copyItem(from, to) {
  if (statSync(from).isDirectory()) {
    cpSync(from, to, { recursive: true });
  } else {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
}

function main() {
  rmSync(SIDECAR_DEST, { recursive: true, force: true });
  mkdirSync(SIDECAR_DEST, { recursive: true });
  const missing = [];
  for (const item of SIDECAR_ITEMS) {
    const from = join(REPO_ROOT, item);
    if (!existsSync(from)) { missing.push(item); continue; }
    copyItem(from, join(SIDECAR_DEST, item));
  }
  // 确保 runtime/.gitkeep 存在（网关运行时目录占位）
  mkdirSync(join(SIDECAR_DEST, "runtime"), { recursive: true });
  const gitkeep = join(SIDECAR_DEST, "runtime", ".gitkeep");
  if (!existsSync(gitkeep)) writeFileSync(gitkeep, "");
  // 清理打包产物内的开发痕迹
  rmSync(join(SIDECAR_DEST, "node_modules"), { recursive: true, force: true });
  rmSync(join(SIDECAR_DEST, "dist"), { recursive: true, force: true });
  rmSync(join(SIDECAR_DEST, "runtime"), { recursive: true, force: true });
  mkdirSync(join(SIDECAR_DEST, "runtime"), { recursive: true });
  writeFileSync(join(SIDECAR_DEST, "runtime", ".gitkeep"), "");
  console.log("[build-sidecar] sidecar ->", SIDECAR_DEST);
  if (missing.length) {
    console.warn("[build-sidecar] missing (skipped):", missing.join(", "));
  }
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  console.log(`[build-sidecar] sidecar version: ${pkg.version}`);
}

main();
