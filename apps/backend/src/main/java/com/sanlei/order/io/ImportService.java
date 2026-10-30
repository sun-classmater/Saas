package com.sanlei.order.io;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 导入：客户/产品/价格/期初库存，整批事务，失败全部回滚。 */
@Service
public class ImportService {

    private static final List<String> KINDS = List.of("customers", "products", "prices", "inventory");

    private final JdbcTemplate jdbcTemplate;
    private final XlsxReader xlsxReader;
    private final AuditService auditService;

    public ImportService(JdbcTemplate jdbcTemplate, XlsxReader xlsxReader, AuditService auditService) {
        this.jdbcTemplate = jdbcTemplate;
        this.xlsxReader = xlsxReader;
        this.auditService = auditService;
    }

    @Transactional
    public Map<String, Object> importCsv(AuthUser user, String kind, String text) {
        return importRows(user, kind, CsvCodec.parse(text));
    }

    @Transactional
    public Map<String, Object> importXlsx(AuthUser user, String kind, byte[] content) {
        return importRows(user, kind, xlsxReader.read(content));
    }

    /** 注意：必须由外部（Controller）调用才走事务代理，类内自调用不会开启事务。 */
    @Transactional
    public Map<String, Object> importRows(AuthUser user, String kind, List<Map<String, String>> rows) {
        if (rows.isEmpty()) {
            throw new HttpException(400, "EMPTY_IMPORT", "导入文件没有数据");
        }
        if (rows.size() > 5000) {
            throw new HttpException(400, "IMPORT_TOO_LARGE", "单次最多导入5000行");
        }
        if (!KINDS.contains(kind)) {
            throw new HttpException(404, "IMPORT_NOT_FOUND", "导入类型不存在");
        }
        List<Map<String, Object>> errors = new ArrayList<>();
        int imported = 0;
        for (int index = 0; index < rows.size(); index++) {
            try {
                switch (kind) {
                    case "customers" -> importCustomer(rows.get(index));
                    case "products" -> importProduct(rows.get(index));
                    case "prices" -> importPrice(rows.get(index));
                    default -> importInventory(rows.get(index));
                }
                imported++;
            } catch (HttpException error) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("row", index + 2);
                item.put("message", error.getMessage());
                errors.add(item);
            }
        }
        if (!errors.isEmpty()) {
            throw new HttpException(400, "IMPORT_VALIDATION_FAILED",
                    "有" + errors.size() + "行导入失败，整批已回滚",
                    errors.subList(0, Math.min(errors.size(), 100)));
        }
        auditService.record(user, "IMPORT_DATA", "IMPORT", kind, Map.of("imported", imported));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("imported", imported);
        result.put("kind", kind);
        return result;
    }

    private void importCustomer(Map<String, String> row) {
        String code = Validation.requireText(row.get("客户编码"), "客户编码");
        String name = Validation.requireText(row.get("客户名称"), "客户名称");
        String channelRaw = Validation.cleanText(row.get("渠道类型"), 50);
        String channelType = switch (channelRaw) {
            case "批发商" -> "WHOLESALER";
            case "4S集团" -> "4S_GROUP";
            case "连锁" -> "CHAIN";
            default -> channelRaw.toUpperCase();
        };
        if (channelType.isEmpty()) {
            channelType = "WHOLESALER";
        }
        String settlementRaw = Validation.cleanText(row.get("结算方式"), 50);
        String settlementMethod = switch (settlementRaw) {
            case "账期" -> "CREDIT";
            case "预付款" -> "PREPAY";
            default -> settlementRaw.toUpperCase();
        };
        if (settlementMethod.isEmpty()) {
            settlementMethod = "CREDIT";
        }
        double paymentTermsDays = jsNumber(row.get("账期天数"), 0d);
        double creditLimit = jsNumber(row.get("授信额度"), 0d);
        double prepayRatio = jsNumber(row.get("预付款比例"), 1d);
        double batchLimit = jsNumber(row.get("最多发货批次"), 3d);

        if (!List.of("WHOLESALER", "4S_GROUP", "CHAIN").contains(channelType)) {
            throw new HttpException(400, "VALIDATION_ERROR", "渠道类型无效");
        }
        if (!List.of("CREDIT", "PREPAY").contains(settlementMethod)) {
            throw new HttpException(400, "VALIDATION_ERROR", "结算方式无效");
        }
        if (!isInteger(paymentTermsDays) || paymentTermsDays < 0) {
            throw new HttpException(400, "VALIDATION_ERROR", "账期天数必须为非负整数");
        }
        if (!isFinite(creditLimit) || creditLimit < 0) {
            throw new HttpException(400, "VALIDATION_ERROR", "信用额度必须为非负数");
        }
        if (!(prepayRatio > 0 && prepayRatio <= 1)) {
            throw new HttpException(400, "VALIDATION_ERROR", "预付款比例必须大于0且不超过1");
        }
        if (!isInteger(batchLimit) || batchLimit <= 0 || batchLimit > 20) {
            throw new HttpException(400, "VALIDATION_ERROR", "最多发货批次必须为正整数且不超过20");
        }
        if (!jdbcTemplate.queryForList("SELECT id FROM customers WHERE code = ?", String.class, code).isEmpty()) {
            throw new HttpException(400, "CUSTOMER_CODE_EXISTS", "客户编码已存在");
        }
        jdbcTemplate.update("""
                INSERT INTO customers (id, code, name, province, city, channel_type, grade, price_tier,
                  settlement_method, payment_terms_days, credit_limit, prepay_ratio, batch_limit,
                  allow_overpayment, phone, address, active, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, NULL, ?)
                """,
                Ids.next("cust"), code, name,
                Validation.cleanText(row.get("省份"), 50), Validation.cleanText(row.get("城市"), 50),
                channelType, Validation.requireText(row.get("客户等级"), "客户等级", 20),
                Validation.requireText(row.get("价格等级"), "价格等级", 20),
                settlementMethod, (int) paymentTermsDays, BigDecimal.valueOf(Validation.money(creditLimit)),
                BigDecimal.valueOf(prepayRatio), (int) batchLimit,
                Validation.cleanText(row.get("手机号"), 30), Validation.cleanText(row.get("地址"), 500),
                Times.nowIso());
    }

    private void importProduct(Map<String, String> row) {
        String sku = Validation.requireText(row.get("物料号"), "物料号", 80);
        double minPackage = jsNumber(row.get("最小包装"), 1d);
        if (!isInteger(minPackage) || minPackage <= 0) {
            throw new HttpException(400, "VALIDATION_ERROR", "最小包装必须为正整数");
        }
        double basePrice = Validation.parsePositiveNumber(row.get("基础价"), "基础价格");
        if (!jdbcTemplate.queryForList("SELECT id FROM products WHERE sku = ?", String.class, sku).isEmpty()) {
            throw new HttpException(400, "PRODUCT_SKU_EXISTS", "物料号已存在");
        }
        jdbcTemplate.update("""
                INSERT INTO products (id, sku, name, category, vehicle_model, min_package, base_price,
                  warranty_months, warranty_km, active, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                Ids.next("prod"), sku,
                Validation.requireText(row.get("品名"), "产品名称", 200),
                Validation.requireText(row.get("分类"), "产品分类", 50),
                Validation.requireText(row.get("车型"), "车型", 100),
                (int) minPackage, BigDecimal.valueOf(Validation.money(basePrice)),
                (int) jsNumber(row.get("质保月数"), 12d), (int) jsNumber(row.get("质保公里"), 60000d),
                Validation.cleanText(row.get("说明"), 2000), Times.nowIso());
    }

    private void importPrice(Map<String, String> row) {
        String sku = Validation.cleanText(row.get("物料号"), 80);
        List<String> productIds = jdbcTemplate.queryForList("SELECT id FROM products WHERE sku = ?", String.class, sku);
        if (productIds.isEmpty()) {
            throw new HttpException(400, "PRODUCT_NOT_FOUND", "物料号" + sku + "不存在");
        }
        String productId = productIds.get(0);
        double price = Validation.parsePositiveNumber(row.get("价格"), "价格");
        String scope = Validation.cleanText(row.get("范围"), 50).toUpperCase();
        String target = Validation.cleanText(row.get("价格等级或客户编码"), 100);
        String now = Times.nowIso();
        if ("客户".equals(scope) || "CUSTOMER".equals(scope)) {
            List<String> customerIds = jdbcTemplate.queryForList("SELECT id FROM customers WHERE code = ?",
                    String.class, target);
            if (customerIds.isEmpty()) {
                throw new HttpException(400, "CUSTOMER_NOT_FOUND", "客户" + target + "不存在");
            }
            jdbcTemplate.update("""
                    INSERT INTO customer_prices (id, customer_id, product_id, price, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = VALUES(updated_at)
                    """, Ids.next("cp"), customerIds.get(0), productId,
                    BigDecimal.valueOf(Validation.money(price)), now, now);
        } else {
            jdbcTemplate.update("""
                    INSERT INTO price_rules (id, price_tier, product_id, price, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = VALUES(updated_at)
                    """, Ids.next("price"), target, productId,
                    BigDecimal.valueOf(Validation.money(price)), now, now);
        }
    }

    private void importInventory(Map<String, String> row) {
        String sku = Validation.cleanText(row.get("物料号"), 80);
        List<String> productIds = jdbcTemplate.queryForList("SELECT id FROM products WHERE sku = ?", String.class, sku);
        if (productIds.isEmpty()) {
            throw new HttpException(400, "PRODUCT_NOT_FOUND", "物料号" + sku + "不存在");
        }
        String productId = productIds.get(0);
        String warehouse = Validation.cleanText(row.get("仓库名称"), 100);
        if (warehouse.isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "仓库名称不能为空");
        }
        String rawType = Validation.cleanText(row.get("库存类型"), 16).toUpperCase();
        String sourceType = "虚拟".equals(Validation.cleanText(row.get("库存类型"), 16)) || "VIRTUAL".equals(rawType)
                ? "VIRTUAL" : "REAL";
        double quantityValue = jsNumber(row.get("数量"), Double.NaN);
        if (!isInteger(quantityValue) || quantityValue < 0) {
            throw new HttpException(400, "VALIDATION_ERROR", "库存数量必须为非负整数");
        }
        int quantity = (int) quantityValue;
        String supplierId = null;
        String supplierName = Validation.cleanText(row.get("供应商名称"), 200);
        if (!supplierName.isEmpty()) {
            List<String> supplierIds = jdbcTemplate.queryForList("SELECT id FROM suppliers WHERE name = ?",
                    String.class, supplierName);
            if (!supplierIds.isEmpty()) {
                supplierId = supplierIds.get(0);
            } else {
                supplierId = Ids.next("sup");
                jdbcTemplate.update("INSERT INTO suppliers (id, name, type, contact, phone, active) "
                        + "VALUES (?, ?, 'INTEGRATOR', NULL, NULL, 1)", supplierId, supplierName);
            }
        }
        List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                "SELECT id, reserved FROM inventory WHERE product_id = ? AND warehouse_name = ? AND source_type = ?",
                productId, warehouse, sourceType);
        String now = Times.nowIso();
        if (!existing.isEmpty()) {
            Map<String, Object> rowData = existing.get(0);
            int reserved = ((Number) rowData.get("reserved")).intValue();
            if (quantity < reserved) {
                throw new HttpException(400, "INVALID_STOCK", "库存不能低于已预占数量");
            }
            jdbcTemplate.update("UPDATE inventory SET quantity = ?, supplier_id = ?, updated_at = ? WHERE id = ?",
                    quantity, supplierId, now, rowData.get("id"));
        } else {
            jdbcTemplate.update("""
                    INSERT INTO inventory (id, product_id, warehouse_name, source_type, supplier_id, quantity,
                      reserved, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                    """, Ids.next("inv"), productId, warehouse, sourceType, supplierId, quantity, now);
        }
    }

    /** 模拟 JS 的 Number(value || fallback)：空值取 fallback，非法取 NaN。 */
    private double jsNumber(String value, double fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        try {
            return Double.parseDouble(value.trim());
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }

    private boolean isInteger(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value) && value == Math.rint(value);
    }

    private boolean isFinite(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value);
    }
}
