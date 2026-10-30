package com.sanlei.order.common;

/** 业务异常：与 Node 后端 HttpError 一一对应，由 GlobalExceptionHandler 转成统一错误体。 */
public class HttpException extends RuntimeException {

    private final int status;
    private final String code;
    private final transient Object details;

    public HttpException(int status, String code, String message) {
        this(status, code, message, null);
    }

    public HttpException(int status, String code, String message, Object details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Object getDetails() {
        return details;
    }
}
