import { HttpError } from "../../lib/core.js";
import { getTemplate, getXlsxTemplate } from "../../lib/csv.js";
import { requireUser } from "../../lib/request.js";
import { exportData, exportXlsx, importData, importXlsx } from "../../services/io.js";

function attachment(reply, contentType, filename) {
  reply.header("Content-Type", contentType);
  reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  return reply;
}

export async function ioRoutes(app) {
  app.get("/exports/:kind", async (request, reply) => {
    await requireUser(app, request);
    const result = await exportData(app.db, decodeURIComponent(request.params.kind));
    attachment(reply, "text/csv; charset=utf-8", result.filename);
    return reply.send(result.content);
  });

  app.get("/exports/:kind/xlsx", async (request, reply) => {
    await requireUser(app, request);
    const result = await exportXlsx(app.db, decodeURIComponent(request.params.kind));
    attachment(
      reply,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      result.filename
    );
    return reply.send(result.buffer);
  });

  app.get("/import-templates/:kind", async (request, reply) => {
    await requireUser(app, request);
    const kind = decodeURIComponent(request.params.kind);
    attachment(reply, "text/csv; charset=utf-8", `${kind}-template.csv`);
    return reply.send(getTemplate(kind));
  });

  app.get("/import-templates/:kind/xlsx", async (request, reply) => {
    await requireUser(app, request);
    const kind = decodeURIComponent(request.params.kind);
    attachment(
      reply,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `${kind}-template.xlsx`
    );
    return reply.send(getXlsxTemplate(kind));
  });

  app.post("/imports/:kind", async (request) => {
    const user = await requireUser(app, request);
    const kind = decodeURIComponent(request.params.kind);
    const body = typeof request.body === "string" ? request.body : "";
    if (!body) throw new HttpError(400, "EMPTY_IMPORT", "导入文件没有数据");
    return { data: await importData(app.db, user, kind, body) };
  });

  app.post("/imports/:kind/xlsx", async (request) => {
    const user = await requireUser(app, request);
    const kind = decodeURIComponent(request.params.kind);
    const body = request.body || {};
    if (!body.fileBase64) throw new HttpError(400, "VALIDATION_ERROR", "缺少Excel文件内容");
    const buffer = Buffer.from(String(body.fileBase64), "base64");
    return { data: await importXlsx(app.db, user, kind, buffer) };
  });
}
