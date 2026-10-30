#!/usr/bin/env node
// 项目内快照 / 一键回滚工具（零依赖，任意项目可用）
//
// 用法（在项目根目录执行）：
//   node scripts/snapshot.mjs create [标签]        创建快照 → _snapshots/<时间戳>-<标签>/
//   node scripts/snapshot.mjs list                 列出快照（* 表示最新）
//   node scripts/snapshot.mjs restore <快照名>      恢复到该快照（默认先自动建 pre-restore 快照）
//       可选：--dry-run 只预览不写；--mirror 额外删除快照里不存在的文件
//   node scripts/snapshot.mjs clean [保留个数]      只保留最近 N 个（默认 5）
//
// 设计要点：
//   * 快照目录固定放在项目根 `_snapshots/`，已在 .gitignore 中，不会污染 git。
//   * 默认排除 node_modules / .git / dist / 各类缓存，体积只有源码大小。
//   * 恢复是"覆盖式"，默认不删除新文件；只有 --mirror 才做严格镜像（会删文件！）。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const STORE = path.join(ROOT, "_snapshots");
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".npm-cache",
  ".pnpm-store",
  "dist",
  "build",
  "coverage",
  "_snapshots",
  ".verify-admin-dist",
  ".m2repo",
  ".build",
  ".gradle",
  ".mvn",
  ".idea",
  ".next",
  ".nuxt",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  "target"
]);

function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function isExcluded(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (!rel || rel.startsWith("..")) return true;
  const parts = rel.split(path.sep);
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) return true;
  return /\.(log|tmp|bak)$/i.test(path.basename(rel));
}

function walk(dir, skip) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (skip && skip(abs, entry)) continue;
    if (entry.isDirectory()) out.push(...walk(abs, skip));
    else if (entry.isFile()) out.push(abs);
    else if (entry.isSymbolicLink()) out.push(abs); // 只记录，不跟随
  }
  return out;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function loadMeta(name) {
  const file = path.join(STORE, name, "meta.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function list(namesOnly = false) {
  if (!fs.existsSync(STORE)) {
    if (!namesOnly) console.log("还没有任何快照：node scripts/snapshot.mjs create <标签>");
    return [];
  }
  const names = fs
    .readdirSync(STORE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  const latest = readLatest();
  if (namesOnly) return names;
  if (!names.length) {
    console.log("还没有任何快照：node scripts/snapshot.mjs create <标签>");
    return names;
  }
  console.log(`\n快照目录：${STORE}\n`);
  let total = 0;
  for (const name of names) {
    const meta = loadMeta(name) || {};
    const size = meta.bytes ?? 0;
    total += size;
    const mark = name === latest ? "*" : " ";
    console.log(
      `${mark} ${name.padEnd(34)} 文件 ${String(meta.files ?? "?").padStart(5)}  大小 ${human(size).padStart(9)}  ${meta.label || ""}`
    );
  }
  console.log(`\n共 ${names.length} 个快照，占用 ${human(total)}（* 为最新）`);
  return names;
}

function readLatest() {
  const file = path.join(STORE, "LATEST");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : "";
}

function writeLatest(name) {
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(path.join(STORE, "LATEST"), `${name}\n`);
}

function create(label = "snapshot") {
  fs.mkdirSync(STORE, { recursive: true });
  const name = `${stamp()}-${String(label).replace(/[^\w\u4e00-\u9fa5-]+/g, "_").slice(0, 24) || "snapshot"}`;
  const dest = path.join(STORE, name);
  if (fs.existsSync(dest)) throw new Error(`快照已存在：${dest}`);

  let files = 0;
  let bytes = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const source of walk(ROOT, (abs) => isExcluded(abs))) {
    const rel = path.relative(ROOT, source);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(source), target);
    } else {
      fs.copyFileSync(source, target);
      files += 1;
      bytes += stat.size;
    }
  }
  const meta = {
    name,
    label: String(label),
    createdAt: new Date().toISOString(),
    files,
    bytes,
    node: process.versions.node,
    platform: `${os.platform()} ${os.release()}`
  };
  fs.writeFileSync(path.join(dest, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeLatest(name);
  console.log(`\n✓ 已创建快照 ${name}`);
  console.log(`  文件 ${files} 个，大小 ${human(bytes)}`);
  console.log(`  位置 ${dest}`);
  console.log(`  回滚：node scripts/snapshot.mjs restore ${name}`);
  return name;
}

function restore(name, options = {}) {
  if (!name) throw new Error("用法：node scripts/snapshot.mjs restore <快照名>");
  const source = path.join(STORE, name);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`找不到快照：${name}（用 list 查看可用快照）`);
  }
  const meta = loadMeta(name);
  console.log(`\n准备恢复：${name}${meta ? `（创建于 ${meta.createdAt}）` : ""}`);
  if (!options.dryRun && !options.noSafety) {
    const safety = create(`pre-restore-${name}`.slice(0, 40));
    console.log(`  已在恢复前自动创建安全快照：${safety}`);
  }

  const snapshotFiles = walk(source, (abs) => path.basename(abs) === "meta.json");
  const snapshotRel = new Set(snapshotFiles.map((abs) => path.relative(source, abs)));
  let restored = 0;
  for (const file of snapshotFiles) {
    const rel = path.relative(source, file);
    const target = path.join(ROOT, rel);
    if (options.dryRun) {
      console.log(`  [dry-run] 覆盖 ${rel}`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    restored += 1;
  }

  let removed = 0;
  if (options.mirror) {
    for (const file of walk(ROOT, (abs) => isExcluded(abs))) {
      const rel = path.relative(ROOT, file);
      if (snapshotRel.has(rel)) continue;
      if (options.dryRun) {
        console.log(`  [dry-run] 删除 ${rel}（快照中不存在）`);
        continue;
      }
      fs.rmSync(file, { force: true });
      removed += 1;
    }
  }

  console.log(
    options.dryRun
      ? `\n[dry-run] 结束，未写任何文件。去掉 --dry-run 才会真正恢复。`
      : `\n✓ 恢复完成：覆盖 ${restored} 个文件${options.mirror ? `，删除 ${removed} 个多余文件` : ""}`
  );
}

function clean(keep = 5) {
  const names = list(true);
  const drop = names.slice(0, Math.max(0, names.length - keep));
  if (!drop.length) {
    console.log(`快照 ${names.length} 个，未超过保留数 ${keep}，无需清理。`);
    return;
  }
  for (const name of drop) {
    fs.rmSync(path.join(STORE, name), { recursive: true, force: true });
    console.log(`已删除 ${name}`);
  }
  if (readLatest() && drop.includes(readLatest())) writeLatest(names[names.length - 1] || "");
}

// ---- CLI ----
const [command, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const values = args.filter((arg) => !arg.startsWith("--"));
try {
  if (command === "create") create(values[0] || "snapshot");
  else if (command === "list") list();
  else if (command === "restore") restore(values[0], { dryRun: flags.has("--dry-run"), mirror: flags.has("--mirror"), noSafety: flags.has("--no-safety") });
  else if (command === "clean") clean(Number(values[0] || 5));
  else {
    console.log("用法：");
    console.log("  node scripts/snapshot.mjs create [标签]");
    console.log("  node scripts/snapshot.mjs list");
    console.log("  node scripts/snapshot.mjs restore <快照名> [--dry-run] [--mirror] [--no-safety]");
    console.log("  node scripts/snapshot.mjs clean [保留个数]");
  }
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
}
