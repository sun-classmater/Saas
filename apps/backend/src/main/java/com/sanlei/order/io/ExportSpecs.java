package com.sanlei.order.io;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/** 导出定义：表头、SQL、行映射与 Sheet 名，与 Node 端 EXPORT_DEFINITIONS 一一对应。 */
final class ExportSpecs {

    private ExportSpecs() {
    }

    record Spec(String kind, String sheet, String filenamePrefix, List<String> headers, String sql,
                Function<List<Object>, List<Object>> mapper) {
    }

    static final List<String> ORDER_HEADERS = List.of(
            "订单号", "总单号", "客户", "等级", "车型", "订单类型", "结算方式", "状态", "订单金额", "已付金额", "已发金额", "创建时间");
    static final List<String> INVENTORY_HEADERS = List.of(
            "物料号", "品名", "仓库", "库存类型", "数量", "已预占", "可用", "供应商");
    static final List<String> PAYMENT_HEADERS = List.of(
            "支付单号", "订单号", "客户", "金额", "渠道", "状态", "交易号", "创建时间", "到账时间");
    static final List<String> PLAN_HEADERS = List.of(
            "计划单号", "计划月份", "客户", "等级", "周次", "物料号", "品名", "计划数量", "已下单数量");

    static final String ORDER_SQL = """
            SELECT o.order_no, g.group_no, c.name AS customer_name, c.grade, o.vehicle_model,
                   o.order_type, o.settlement_method, o.status, o.total_amount, o.paid_amount,
                   o.shipped_amount, o.created_at
            FROM orders o
            JOIN order_groups g ON g.id = o.group_id
            JOIN customers c ON c.id = o.customer_id
            ORDER BY o.created_at DESC
            """;

    static final String INVENTORY_SQL = """
            SELECT p.sku, p.name, i.warehouse_name, i.source_type, i.quantity, i.reserved,
                   i.quantity - i.reserved AS available, COALESCE(s.name, '') AS supplier_name
            FROM inventory i JOIN products p ON p.id = i.product_id
            LEFT JOIN suppliers s ON s.id = i.supplier_id
            ORDER BY p.sku, i.source_type
            """;

    static final String PAYMENT_SQL = """
            SELECT pay.payment_no, o.order_no, c.name, pay.amount, pay.channel,
                   pay.status, pay.transaction_id, pay.created_at, pay.paid_at
            FROM payments pay
            JOIN orders o ON o.id = pay.order_id
            JOIN customers c ON c.id = pay.customer_id
            ORDER BY pay.created_at DESC
            """;

    static final String PLAN_SQL = """
            SELECT p.plan_no, p.plan_month, c.name, c.grade, pi.week_no,
                   pr.sku, pr.name AS product_name, pi.quantity, pi.ordered_quantity
            FROM plans p
            JOIN customers c ON c.id = p.customer_id
            JOIN plan_items pi ON pi.plan_id = p.id
            JOIN products pr ON pr.id = pi.product_id
            ORDER BY p.plan_month DESC, p.plan_no, pi.week_no
            """;

    /** 与 JS 数字字符串化保持一致：整数值不带小数点，其余去掉多余 0。 */
    static String numberText(Object value) {
        if (value == null) {
            return "";
        }
        double number = value instanceof BigDecimal decimal ? decimal.doubleValue()
                : value instanceof Number num ? num.doubleValue() : Double.parseDouble(String.valueOf(value));
        if (number == Math.rint(number) && !Double.isInfinite(number)) {
            return String.valueOf((long) number);
        }
        return BigDecimal.valueOf(number).stripTrailingZeros().toPlainString();
    }

    static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    static Function<List<Object>, List<Object>> orderMapper() {
        return row -> {
            List<Object> out = new ArrayList<>();
            out.add(text(row.get(0)));
            out.add(text(row.get(1)));
            out.add(text(row.get(2)));
            out.add(text(row.get(3)));
            out.add(text(row.get(4)));
            out.add(text(row.get(5)));
            out.add(text(row.get(6)));
            out.add(text(row.get(7)));
            out.add(numberText(row.get(8)));
            out.add(numberText(row.get(9)));
            out.add(numberText(row.get(10)));
            out.add(text(row.get(11)));
            return out;
        };
    }

    static Function<List<Object>, List<Object>> inventoryMapper() {
        return row -> {
            List<Object> out = new ArrayList<>();
            for (int index = 0; index < 8; index++) {
                Object value = row.get(index);
                if (index >= 4 && index <= 6) {
                    out.add(numberText(value));
                } else {
                    out.add(text(value));
                }
            }
            return out;
        };
    }

    static Function<List<Object>, List<Object>> paymentMapper() {
        return row -> {
            List<Object> out = new ArrayList<>();
            out.add(text(row.get(0)));
            out.add(text(row.get(1)));
            out.add(text(row.get(2)));
            out.add(numberText(row.get(3)));
            out.add(text(row.get(4)));
            out.add(text(row.get(5)));
            out.add(text(row.get(6)));
            out.add(text(row.get(7)));
            out.add(text(row.get(8)));
            return out;
        };
    }

    static Function<List<Object>, List<Object>> planMapper() {
        return row -> {
            List<Object> out = new ArrayList<>();
            out.add(text(row.get(0)));
            out.add(text(row.get(1)));
            out.add(text(row.get(2)));
            out.add(text(row.get(3)));
            out.add(numberText(row.get(4)));
            out.add(text(row.get(5)));
            out.add(text(row.get(6)));
            out.add(numberText(row.get(7)));
            out.add(numberText(row.get(8)));
            return out;
        };
    }
}
