package com.sanlei.order.common;

import java.util.LinkedHashMap;
import java.util.Map;

/** 统一成功响应：{"data": ...}。 */
public final class ApiResponse {

    private ApiResponse() {
    }

    public static Map<String, Object> data(Object data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("data", data);
        return body;
    }

    public static Map<String, Object> map(Object... keyValues) {
        Map<String, Object> body = new LinkedHashMap<>();
        for (int index = 0; index + 1 < keyValues.length; index += 2) {
            body.put(String.valueOf(keyValues[index]), keyValues[index + 1]);
        }
        return body;
    }
}
