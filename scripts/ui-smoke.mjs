import fs from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.DEBUG_PORT || 9222);
const outputDir = process.env.OUTPUT_DIR || ".";
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === "page" && item.url.startsWith("http"));
if (!target) throw new Error("没有找到可调试页面");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const exceptions = [];
let sequence = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    exceptions.push(message.params.exceptionDetails?.text || "runtime exception");
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true
  });
  await fs.writeFile(path.resolve(outputDir, name), Buffer.from(result.data, "base64"));
}

await send("Runtime.enable");
await send("Page.enable");
await evaluate(`
  document.querySelector('[name="username"]').value = 'admin';
  document.querySelector('[name="password"]').value = 'Admin@123';
  document.querySelector('#login-form').requestSubmit();
`);
await new Promise((resolve) => setTimeout(resolve, 1200));

const loginState = await evaluate(`({
  title: document.title,
  appVisible: !document.querySelector('#app-view').hidden,
  bodyText: document.body.innerText.slice(0, 500)
})`);
if (!loginState.appVisible) throw new Error(`管理员登录失败：${loginState.bodyText}`);

await screenshot("dashboard-preview.png");

const routeNames = [
  "customers", "products", "prices", "plans", "orders", "inventory", "shortages",
  "suppliers", "payments", "finance", "after-sales", "reports", "users", "imports"
];
for (const route of routeNames) {
  const clicked = await evaluate(`
    (() => {
      const button = document.querySelector('[data-route="${route}"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) continue;
  await new Promise((resolve) => setTimeout(resolve, 650));
  await screenshot(`${route}-preview.png`);
}

const finalState = await evaluate(`({
  heading: document.querySelector('#page-title').textContent,
  errors: [...document.querySelectorAll('.form-error:not([hidden])')].map((item) => item.textContent),
  toast: document.querySelector('.toast.error')?.textContent || null
})`);

console.log(JSON.stringify({ loginState, finalState, exceptions }, null, 2));
socket.close();
