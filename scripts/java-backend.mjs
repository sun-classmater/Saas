// Java 后端构建/运行助手：自动定位 JDK 与 Maven，避免记长命令
//   node scripts/java-backend.mjs build     # mvn package（跳过测试）
//   node scripts/java-backend.mjs test      # mvn test
//   node scripts/java-backend.mjs run       # 运行 jar（默认端口沿用 API_PORT/8788）
//   node scripts/java-backend.mjs where     # 打印定位到的 JDK / Maven
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const projectDir = path.join(root, "apps", "backend-java");
const settings = path.join(root, ".mvn-settings.xml");
const jar = path.join(root, ".build", "backend-java", "order-backend-0.1.0.jar");

function firstExisting(candidates) {
  for (const candidate of candidates.flat()) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findJdk() {
  if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, "bin", "java.exe"))) {
    return process.env.JAVA_HOME;
  }
  const home = os.homedir();
  const candidates = [];
  for (const base of [path.join(home, ".jdks"), "C:\\Program Files\\Java", "C:\\Program Files\\Eclipse Adoptium", "C:\\Program Files\\Microsoft"]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      candidates.push(path.join(base, entry));
    }
  }
  return firstExisting(candidates.filter((dir) => fs.existsSync(path.join(dir, "bin", "java.exe"))));
}

function findMaven() {
  if (process.env.MVN && fs.existsSync(process.env.MVN)) return process.env.MVN;
  const candidates = [
    "C:\\Program Files\\JetBrains",
    "D:\\IDEA",
    "D:\\Program Files\\JetBrains",
    "C:\\Program Files\\JetBrains\\IntelliJ IDEA"
  ];
  const found = [];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const mvn = path.join(base, entry, "plugins", "maven", "lib", "maven3", "bin", "mvn.cmd");
      if (fs.existsSync(mvn)) found.push(mvn);
    }
  }
  if (found.length) return found[0];
  return "mvn";
}

const javaHome = findJdk();
const maven = findMaven();
const env = { ...process.env, JAVA_HOME: javaHome || process.env.JAVA_HOME };

function run(command, args, options = {}) {
  // Windows 下 .cmd 需要通过 cmd.exe 启动（Node 24 直接 spawn .cmd 会 EINVAL）。
  // 交给 Node 做参数转义：把命令与参数分开传，避免手写引号被二次转义。
  const isShim = /\.(cmd|bat)$/i.test(command);
  const result = isShim
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", command, ...args], {
        cwd: projectDir,
        env,
        stdio: "inherit",
        windowsVerbatimArguments: false,
        ...options
      })
    : spawnSync(command, args, { cwd: projectDir, env, stdio: "inherit", ...options });
  if (result.error) {
    console.error(`✗ 无法执行 ${command}: ${result.error.message}`);
    process.exitCode = 1;
  }
  return result.status ?? 1;
}

const [command = "build"] = process.argv.slice(2);

if (!javaHome) {
  console.error("✗ 没有找到 JDK：请安装 JDK 21（或设置 JAVA_HOME 后再执行）");
  process.exit(1);
}

if (command === "where") {
  console.log(`JDK_HOME = ${javaHome}`);
  console.log(`Maven    = ${maven}`);
  console.log(`项目     = ${projectDir}`);
  console.log(`构建输出 = ${path.dirname(jar)}`);
  console.log(`settings = ${fs.existsSync(settings) ? settings : "(默认)"}`);
  process.exit(0);
}

const mavenArgs = ["-B"];
if (fs.existsSync(settings)) mavenArgs.push("-s", settings);

if (command === "build") {
  process.exitCode = run(maven, [...mavenArgs, "-DskipTests", "package"]);
} else if (command === "test") {
  process.exitCode = run(maven, [...mavenArgs, "test"]);
} else if (command === "clean") {
  process.exitCode = run(maven, [...mavenArgs, "clean"]);
} else if (command === "run") {
  if (!fs.existsSync(jar)) {
    console.error(`✗ 还没有构建产物：先执行 node scripts/java-backend.mjs build`);
    process.exit(1);
  }
  const port = process.env.API_PORT || "8788";
  console.log(`启动 Java 后端：端口 ${port}，jar = ${jar}`);
  const result = spawnSync(path.join(javaHome, "bin", "java.exe"), ["-jar", jar], {
    cwd: root,
    env: { ...env, API_PORT: port },
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
} else {
  console.log("用法：node scripts/java-backend.mjs <build|test|clean|run|where>");
  process.exitCode = 1;
}
