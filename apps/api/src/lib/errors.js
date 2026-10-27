import { HttpError } from "./core.js";

export { HttpError };

export function errorHandler(error, request, reply) {
  if (error.validation) {
    return reply.status(400).send({
      error: { code: "VALIDATION_ERROR", message: "请求参数不合法", details: error.validation }
    });
  }
  if (error.code === "FST_ERR_CTP_INVALID_JSON_BODY" || error.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
    return reply.status(400).send({
      error: { code: "INVALID_JSON", message: "请求内容不是有效JSON", details: null }
    });
  }
  if (error instanceof HttpError) {
    return reply.status(error.status).send({
      error: { code: error.code, message: error.message, details: error.details }
    });
  }
  if (error.statusCode === 413) {
    return reply.status(413).send({ error: { code: "BODY_TOO_LARGE", message: "上传内容超过限制" } });
  }
  request.log.error({ err: error }, "unhandled error");
  return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "服务器处理失败", details: null } });
}
