package com.sanlei.order.io;

import com.sanlei.order.common.HttpException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 导出与导入模板：CSV / XLSX（Apache POI）。 */
@Service
public class ExportService {

    private static final DateTimeFormatter DATE_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    private final JdbcTemplate jdbcTemplate;

    public ExportService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private ExportSpecs.Spec spec(String kind) {
        return switch (kind == null ? "" : kind) {
            case "orders" -> new ExportSpecs.Spec("orders", "订单", "订单导出",
                    ExportSpecs.ORDER_HEADERS, ExportSpecs.ORDER_SQL, ExportSpecs.orderMapper());
            case "inventory" -> new ExportSpecs.Spec("inventory", "库存", "库存导出",
                    ExportSpecs.INVENTORY_HEADERS, ExportSpecs.INVENTORY_SQL, ExportSpecs.inventoryMapper());
            case "payments" -> new ExportSpecs.Spec("payments", "收款", "收款导出",
                    ExportSpecs.PAYMENT_HEADERS, ExportSpecs.PAYMENT_SQL, ExportSpecs.paymentMapper());
            case "plans" -> new ExportSpecs.Spec("plans", "采购计划", "采购计划导出",
                    ExportSpecs.PLAN_HEADERS, ExportSpecs.PLAN_SQL, ExportSpecs.planMapper());
            default -> null;
        };
    }

    private List<List<Object>> rows(String sql, Function<List<Object>, List<Object>> mapper) {
        return jdbcTemplate.query(sql, (resultSet, rowNum) -> {
            int columns = resultSet.getMetaData().getColumnCount();
            List<Object> values = new ArrayList<>(columns);
            for (int index = 1; index <= columns; index++) {
                values.add(resultSet.getObject(index));
            }
            return values;
        }).stream().map(mapper).toList();
    }

    public static String dateStamp() {
        return DATE_STAMP.format(ZonedDateTime.now(SHANGHAI));
    }

    public byte[] exportCsv(String kind) {
        ExportSpecs.Spec spec = spec(kind);
        if (spec == null) {
            throw new HttpException(404, "EXPORT_NOT_FOUND", "导出类型不存在");
        }
        List<List<Object>> data = rows(spec.sql(), spec.mapper());
        return toCsv(spec.headers(), data);
    }

    public String exportFilename(String kind, String extension) {
        ExportSpecs.Spec spec = spec(kind);
        if (spec == null) {
            throw new HttpException(404, "EXPORT_NOT_FOUND", "导出类型不存在");
        }
        return spec.filenamePrefix() + "-" + dateStamp() + "." + extension;
    }

    public byte[] exportXlsx(String kind) {
        ExportSpecs.Spec spec = spec(kind);
        if (spec == null) {
            throw new HttpException(404, "EXPORT_NOT_FOUND", "导出类型不存在");
        }
        return toXlsx(spec.sheet(), spec.headers(), rows(spec.sql(), spec.mapper()));
    }

    // ---------- 导入模板 ----------

    static final List<String> TEMPLATE_CUSTOMERS = List.of(
            "客户编码", "客户名称", "省份", "城市", "渠道类型", "客户等级", "价格等级",
            "结算方式", "账期天数", "授信额度", "预付款比例", "最多发货批次", "手机号", "地址");
    static final List<String> TEMPLATE_PRODUCTS = List.of(
            "物料号", "品名", "分类", "车型", "最小包装", "基础价", "质保月数", "质保公里", "说明");
    static final List<String> TEMPLATE_PRICES = List.of("范围", "价格等级或客户编码", "物料号", "价格");
    static final List<String> TEMPLATE_INVENTORY = List.of("物料号", "仓库名称", "库存类型", "数量", "供应商名称");

    static List<String> templateHeaders(String kind) {
        return switch (kind == null ? "" : kind) {
            case "customers" -> TEMPLATE_CUSTOMERS;
            case "products" -> TEMPLATE_PRODUCTS;
            case "prices" -> TEMPLATE_PRICES;
            case "inventory" -> TEMPLATE_INVENTORY;
            default -> null;
        };
    }

    static String templateSheet(String kind) {
        return switch (kind == null ? "" : kind) {
            case "customers" -> "客户档案";
            case "products" -> "产品档案";
            case "prices" -> "价格矩阵";
            case "inventory" -> "期初库存";
            default -> "导入模板";
        };
    }

    public byte[] templateCsv(String kind) {
        List<String> headers = templateHeaders(kind);
        if (headers == null) {
            throw new HttpException(404, "TEMPLATE_NOT_FOUND", "导入模板不存在");
        }
        return toCsv(headers, List.of());
    }

    public byte[] templateXlsx(String kind) {
        List<String> headers = templateHeaders(kind);
        if (headers == null) {
            throw new HttpException(404, "TEMPLATE_NOT_FOUND", "导入模板不存在");
        }
        return toXlsx(templateSheet(kind), headers, List.of());
    }

    // ---------- 序列化 ----------

    public static byte[] toCsv(List<String> headers, List<List<Object>> data) {
        StringBuilder builder = new StringBuilder("\uFEFF");
        builder.append(joinRow(headers.stream().map(ExportSpecs::text).toList()));
        for (List<Object> row : data) {
            builder.append("\r\n").append(joinRow(row.stream().map(ExportSpecs::text).toList()));
        }
        return builder.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String joinRow(List<String> values) {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(escape(values.get(index)));
        }
        return builder.toString();
    }

    private static String escape(String value) {
        String text = value == null ? "" : value;
        if (text.indexOf('"') >= 0 || text.indexOf(',') >= 0 || text.indexOf('\r') >= 0 || text.indexOf('\n') >= 0) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }

    public static byte[] toXlsx(String sheetName, List<String> headers, List<List<Object>> data) {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet(sheetName);
            Row headerRow = sheet.createRow(0);
            for (int index = 0; index < headers.size(); index++) {
                headerRow.createCell(index).setCellValue(headers.get(index));
            }
            for (int rowIndex = 0; rowIndex < data.size(); rowIndex++) {
                Row row = sheet.createRow(rowIndex + 1);
                List<Object> values = data.get(rowIndex);
                for (int cellIndex = 0; cellIndex < values.size(); cellIndex++) {
                    // 与 Node 端 writeWorkbookRows 一致：全部按文本写入（避免数字/文本类型差异）
                    row.createCell(cellIndex).setCellValue(ExportSpecs.text(values.get(cellIndex)));
                }
            }
            workbook.write(output);
            return output.toByteArray();
        } catch (Exception error) {
            throw new HttpException(500, "EXPORT_FAILED", "导出 Excel 失败：" + error.getMessage());
        }
    }
}
