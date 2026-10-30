// 端点清单对照：Node 路由 vs Java 控制器
//   node scripts/endpoint-inventory.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function normalize(routePath) {
  return routePath.replace(/:[A-Za-z_]+/g, ":x").replace(/\/+$/, "");
}

// ---- Node：routes 目录下的 app.get/post/... + 前缀 ----
const nodeRoutes = new Map();
export function collectNodeRoutes() {
  return nodeRoutes;
}
for (const dir of ["apps/backend/src/routes", "apps/backend/src/routes/admin"]) {
  const abs = path.join(root, dir);
  for (const file of fs.readdirSync(abs)) {
    if (!file.endsWith(".js")) continue;
    const text = fs.readFileSync(path.join(abs, file), "utf8");
    const isAdmin = dir.endsWith("/admin");
    for (const match of text.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)) {
      // admin 目录里也有 /mobile/* 路由（注册到 /api 前缀），不能一律按 /api/admin 计算
      const prefix = match[2].startsWith("/mobile/") ? "/api" : isAdmin ? "/api/admin" : "/api";
      const key = `${prefix}${match[2]}`;
      nodeRoutes.set(normalize(`${match[1].toUpperCase()} ${key}`), `${dir}/${file}`);
    }
  }
}

// ---- Java：扫描 @RequestMapping 前缀 + @Get/Post/Put/Patch/DeleteMapping ----
const javaFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs);
    else if (entry.name.endsWith(".java")) javaFiles.push(abs);
  }
}
walk(path.join(root, "apps/backend-java/src/main/java"));

const javaRoutes = new Map();
for (const file of javaFiles) {
  const text = fs.readFileSync(file, "utf8");
  const classPrefix = text.match(/@RequestMapping\("([^"]*)"\)\s*\npublic class/) ?? text.match(/@RequestMapping\("([^"]*)"\)/);
  const prefix = classPrefix ? classPrefix[1] : "";
  for (const match of text.matchAll(/@(Get|Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*)?"([^"]+)"/g)) {
    const method = match[1].toUpperCase();
    const full = normalize(`${method} ${prefix}${match[2]}`);
    javaRoutes.set(full, path.relative(root, file));
  }
}

function canonical(methodPath) {
  const space = methodPath.indexOf(" ");
  const method = methodPath.slice(0, space);
  const rawPath = methodPath.slice(space + 1);
  const normalized = rawPath
    .replace(/\{[^}]+\}/g, ":x")
    .replace(/:[A-Za-z_]+/g, ":x")
    .replace(/\/+$/, "");
  return `${method} ${normalized}`;
}

const nodeCanonical = new Map();
for (const [key, file] of nodeRoutes) nodeCanonical.set(canonical(key), { key, file });
const javaCanonical = new Map();
for (const [key, file] of javaRoutes) javaCanonical.set(canonical(key), { key, file });

const missing = [...nodeCanonical.entries()].filter(([canonicalKey]) => !javaCanonical.has(canonicalKey));
const extra = [...javaCanonical.entries()].filter(([canonicalKey]) => !nodeCanonical.has(canonicalKey));

console.log(`Node 路由：${nodeRoutes.size} 个`);
console.log(`Java 映射：${javaRoutes.size} 个`);
console.log("\n== Node 有、Java 缺 ==");
if (missing.length === 0) console.log("  （无）");
for (const [, item] of missing) console.log(`  ${item.key}   ← ${item.file}`);
console.log("\n== Java 有、Node 无（新增或命名差异） ==");
if (extra.length === 0) console.log("  （无）");
for (const [, item] of extra) console.log(`  ${item.key}   ← ${item.file}`);
console.log(`\n结论：覆盖 ${nodeRoutes.size - missing.length}/${nodeRoutes.size}`);
process.exitCode = missing.length === 0 ? 0 : 1;
