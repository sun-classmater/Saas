package com.sanlei.order.io;

import com.sanlei.order.auth.AuthInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class ExportController {

    private static final MediaType XLSX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping("/exports/{kind}")
    public ResponseEntity<byte[]> exportCsv(@PathVariable String kind, HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        byte[] content = exportService.exportCsv(kind);
        return download(content, "text/csv; charset=utf-8", exportService.exportFilename(kind, "csv"));
    }

    @GetMapping("/exports/{kind}/xlsx")
    public ResponseEntity<byte[]> exportXlsx(@PathVariable String kind, HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        byte[] content = exportService.exportXlsx(kind);
        return download(content, null, exportService.exportFilename(kind, "xlsx"));
    }

    @GetMapping("/import-templates/{kind}")
    public ResponseEntity<byte[]> templateCsv(@PathVariable String kind, HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return download(exportService.templateCsv(kind), "text/csv; charset=utf-8", kind + "-template.csv");
    }

    @GetMapping("/import-templates/{kind}/xlsx")
    public ResponseEntity<byte[]> templateXlsx(@PathVariable String kind, HttpServletRequest request) {
        AuthInterceptor.currentUser(request);
        return download(exportService.templateXlsx(kind), null, kind + "-template.xlsx");
    }

    private ResponseEntity<byte[]> download(byte[] content, String contentType, String filename) {
        MediaType media = contentType == null ? XLSX : MediaType.parseMediaType(contentType);
        return ResponseEntity.ok()
                .contentType(media)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename*=UTF-8''" + URLEncoder.encode(filename, StandardCharsets.UTF_8)
                                .replace("+", "%20"))
                .body(content);
    }
}
