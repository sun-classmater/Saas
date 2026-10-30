package com.sanlei.order.io;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.HttpException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Base64;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class ImportController {

    private final ImportService importService;

    public ImportController(ImportService importService) {
        this.importService = importService;
    }

    @PostMapping(value = "/imports/{kind}", consumes = {"text/csv", "text/plain", "application/octet-stream"})
    public Map<String, Object> importCsv(@PathVariable String kind,
                                         @RequestBody(required = false) String body,
                                         HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        if (body == null || body.isEmpty()) {
            throw new HttpException(400, "EMPTY_IMPORT", "导入文件没有数据");
        }
        return ApiResponse.data(importService.importCsv(user, kind, body));
    }

    @PostMapping("/imports/{kind}/xlsx")
    public Map<String, Object> importXlsx(@PathVariable String kind,
                                          @RequestBody(required = false) Map<String, Object> body,
                                          HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Object fileBase64 = body == null ? null : body.get("fileBase64");
        if (fileBase64 == null || String.valueOf(fileBase64).isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "缺少Excel文件内容");
        }
        byte[] content;
        try {
            content = Base64.getDecoder().decode(String.valueOf(fileBase64));
        } catch (IllegalArgumentException error) {
            throw new HttpException(400, "INVALID_XLSX", "无法读取Excel文件：Base64 内容非法");
        }
        return ApiResponse.data(importService.importXlsx(user, kind, content));
    }
}
