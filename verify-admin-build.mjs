// 管理端构建验证：用 Rollup + @vue/compiler-sfc 打包 apps/admin/src，
// 不依赖 esbuild/浏览器（沙箱限制），验证 15 个页面与依赖图可编译、可打包。
import fs from "node:fs";
import path from "node:path";
import { rollup } from "rollup";
import { parse, compileScript, compileTemplate } from "vue/compiler-sfc";

const root = path.resolve(import.meta.dirname);
const srcDir = path.join(root, "apps/admin/src");

const vuePlugin = {
  name: "vue-sfc",
  transform(code, id) {
    if (!id.endsWith(".vue")) return null;
    const filename = id;
    const { descriptor, errors } = parse(code, { filename });
    if (errors.length) throw new Error(`${filename}: ${errors[0].message}`);
    const idHash = path.basename(filename, ".vue");
    const hasScript = Boolean(descriptor.script || descriptor.scriptSetup);
    if (hasScript) {
      const compiled = compileScript(descriptor, { id: idHash, inlineTemplate: Boolean(descriptor.template) });
      return { code: compiled.content, map: null };
    }
    if (descriptor.template) {
      const template = compileTemplate({
        source: descriptor.template.content,
        filename,
        id: idHash,
        compilerOptions: {}
      });
      if (template.errors.length) throw new Error(`${filename}: ${template.errors[0]}`);
      return { code: `${template.code}\nexport default { render };`, map: null };
    }
    return { code: "export default {}", map: null };
  }
};

const cssPlugin = {
  name: "css-stub",
  transform(code, id) {
    if (id.endsWith(".css")) return { code: "export default {};", map: null };
    return null;
  }
};

const bundle = await rollup({
  input: path.join(srcDir, "main.js"),
  plugins: [vuePlugin, cssPlugin],
  external: (id) => !id.startsWith(".") && !path.isAbsolute(id),
  onwarn(warning, warn) {
    if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;
    warn(warning);
  }
});

const outDir = path.join(root, ".verify-admin-dist");
fs.rmSync(outDir, { recursive: true, force: true });
const output = await bundle.write({ dir: outDir, format: "esm", entryFileNames: "assets/[name].js" });
await bundle.close();

const files = fs.readdirSync(path.join(outDir, "assets"));
const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(outDir, "assets", file)).size, 0);
console.log(`管理端打包成功：${files.length} 个 chunk，${(totalBytes / 1024).toFixed(1)} KB`);
for (const file of files) console.log(`  ${file}`);
