package com.sanlei.order.finance;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.SerialNumbers;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 财务：发票、运费、调整款与结算。 */
@Service
public class FinanceService {

    private final FinanceMapper financeMapper;
    private final AuditService auditService;

    public FinanceService(FinanceMapper financeMapper, AuditService auditService) {
        this.financeMapper = financeMapper;
        this.auditService = auditService;
    }

    public Map<String, Object> list() {
        List<Map<String, Object>> invoices = new ArrayList<>();
        for (InvoiceRow row : financeMapper.invoices()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("recordNo", row.getInvoiceNo());
            view.put("orderNo", row.getOrderNo());
            view.put("customerName", row.getCustomerName());
            view.put("title", row.getTitle());
            view.put("taxNumber", row.getTaxNumber());
            view.put("amount", Validation.money(row.getAmount()));
            view.put("taxRate", row.getTaxRate() == null ? 0d : row.getTaxRate().doubleValue());
            view.put("status", row.getStatus());
            view.put("note", row.getNote());
            view.put("issuedAt", row.getIssuedAt());
            view.put("createdAt", row.getCreatedAt());
            invoices.add(view);
        }
        List<Map<String, Object>> freight = new ArrayList<>();
        for (FreightRow row : financeMapper.freight()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("recordNo", row.getId());
            view.put("orderNo", row.getOrderNo());
            view.put("customerName", row.getCustomerName());
            view.put("amount", Validation.money(row.getAmount()));
            view.put("payer", row.getPayer());
            view.put("status", row.getStatus());
            view.put("description", row.getDescription());
            view.put("settledAt", row.getSettledAt());
            view.put("createdAt", row.getCreatedAt());
            freight.add(view);
        }
        List<Map<String, Object>> adjustments = new ArrayList<>();
        for (AdjustmentRow row : financeMapper.adjustments()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("recordNo", row.getAdjustmentNo());
            view.put("orderNo", row.getOrderNo());
            view.put("customerName", row.getCustomerName());
            view.put("type", row.getType());
            view.put("amount", Validation.money(row.getAmount()));
            view.put("status", row.getStatus());
            view.put("description", row.getDescription());
            view.put("settledAt", row.getSettledAt());
            view.put("createdAt", row.getCreatedAt());
            adjustments.add(view);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("invoices", invoices);
        data.put("freight", freight);
        data.put("adjustments", adjustments);
        return data;
    }

    @Transactional
    public Map<String, Object> createInvoice(AuthUser user, Map<String, Object> payload) {
        String orderId = stringOf(payload.get("orderId"));
        if (financeMapper.findOrderId(orderId) == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        Object rawAmount = payload.get("amount");
        BigDecimal orderTotal = financeMapper.findOrderTotal(orderId);
        double amountSource;
        boolean falsyAmount = rawAmount == null || "".equals(rawAmount)
                || (isNumeric(rawAmount) && Double.parseDouble(String.valueOf(rawAmount)) == 0d);
        if (falsyAmount) {
            amountSource = orderTotal == null ? 0d : orderTotal.doubleValue();
        } else {
            amountSource = Validation.parseDouble(rawAmount, "开票金额");
        }
        double amount = Validation.money(Validation.parsePositiveNumber(amountSource, "开票金额"));
        String invoiceId = Ids.next("invoice");
        String invoiceNo = SerialNumbers.next("INV");
        double taxRate = payload.get("taxRate") == null ? 13d : Validation.parseDouble(payload.get("taxRate"), "税率");
        financeMapper.insertInvoice(
                invoiceId,
                invoiceNo,
                orderId,
                financeMapper.findOrderCustomer(orderId),
                Validation.requireText(payload.get("title"), "发票抬头", 300),
                Validation.cleanText(payload.get("taxNumber"), 100),
                BigDecimal.valueOf(amount),
                BigDecimal.valueOf(taxRate),
                Validation.cleanText(payload.get("note"), 1000),
                Times.nowIso());
        auditService.record(user, "CREATE_INVOICE", "INVOICE", invoiceId, Map.of("orderId", orderId, "amount", amount));
        return findInvoice(invoiceId);
    }

    @Transactional
    public Map<String, Object> updateInvoiceStatus(AuthUser user, String invoiceId, String status) {
        if (!List.of("PENDING", "ISSUED", "CANCELLED").contains(status)) {
            throw new HttpException(400, "VALIDATION_ERROR", "发票状态无效");
        }
        if (financeMapper.countInvoice(invoiceId) == 0) {
            throw new HttpException(404, "INVOICE_NOT_FOUND", "发票记录不存在");
        }
        financeMapper.updateInvoiceStatus(invoiceId, status, "ISSUED".equals(status) ? Times.nowIso() : null);
        auditService.record(user, "UPDATE_INVOICE", "INVOICE", invoiceId, Map.of("status", status));
        return findInvoice(invoiceId);
    }

    @Transactional
    public Map<String, Object> createFreight(AuthUser user, Map<String, Object> payload) {
        String orderId = stringOf(payload.get("orderId"));
        if (financeMapper.findOrderId(orderId) == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        double amount = Validation.money(Validation.parsePositiveNumber(payload.get("amount"), "运费金额"));
        String freightId = Ids.next("freight");
        financeMapper.insertFreight(
                freightId,
                orderId,
                financeMapper.findOrderCustomer(orderId),
                BigDecimal.valueOf(amount),
                "COMPANY".equals(payload.get("payer")) ? "COMPANY" : "CUSTOMER",
                Validation.cleanText(payload.get("description"), 1000),
                Times.nowIso());
        auditService.record(user, "CREATE_FREIGHT", "FREIGHT", freightId,
                Map.of("orderId", orderId, "amount", payload.get("amount")));
        return findFreight(freightId);
    }

    @Transactional
    public Map<String, Object> createAdjustment(AuthUser user, Map<String, Object> payload) {
        String customerId = stringOf(payload.get("customerId"));
        if (financeMapper.countCustomer(customerId) == 0) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
        }
        String orderId = payload.get("orderId") == null || "".equals(payload.get("orderId"))
                ? null : stringOf(payload.get("orderId"));
        if (orderId != null && financeMapper.findOrderId(orderId) == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        String type = Validation.cleanText(payload.get("type") == null ? "OTHER" : payload.get("type"), 32)
                .toUpperCase();
        if (!List.of("CLAIM", "RETURN_REFUND", "FREIGHT_ADJUSTMENT", "OTHER").contains(type)) {
            throw new HttpException(400, "VALIDATION_ERROR", "调整款类型无效");
        }
        double amount = Validation.parseDouble(payload.get("amount"), "调整金额");
        if (amount == 0) {
            throw new HttpException(400, "VALIDATION_ERROR", "调整金额不能为0");
        }
        String adjustmentId = Ids.next("adjustment");
        String adjustmentNo = SerialNumbers.next("ADJ");
        financeMapper.insertAdjustment(
                adjustmentId,
                adjustmentNo,
                customerId,
                orderId,
                type,
                BigDecimal.valueOf(Validation.money(amount)),
                Validation.cleanText(payload.get("description"), 1000),
                Times.nowIso());
        auditService.record(user, "CREATE_FINANCIAL_ADJUSTMENT", "ADJUSTMENT", adjustmentId,
                Map.of("amount", amount, "type", type));
        return findAdjustment(adjustmentId);
    }

    @Transactional
    public Map<String, Object> settle(AuthUser user, String kind, String recordId) {
        String now = Times.nowIso();
        if ("freight".equals(kind)) {
            if (financeMapper.countFreight(recordId) == 0) {
                throw new HttpException(404, "FINANCIAL_RECORD_NOT_FOUND", "财务记录不存在");
            }
            financeMapper.settleFreight(recordId, now);
        } else if ("adjustment".equals(kind)) {
            if (financeMapper.countAdjustment(recordId) == 0) {
                throw new HttpException(404, "FINANCIAL_RECORD_NOT_FOUND", "财务记录不存在");
            }
            financeMapper.settleAdjustment(recordId, now);
        } else {
            throw new HttpException(400, "VALIDATION_ERROR", "结算类型无效");
        }
        auditService.record(user, "SETTLE_FINANCIAL_RECORD", kind.toUpperCase(), recordId, null);
        return list();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findInvoice(String invoiceId) {
        List<Map<String, Object>> rows = (List<Map<String, Object>>) list().get("invoices");
        return rows.stream().filter(row -> invoiceId.equals(row.get("id"))).findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findFreight(String freightId) {
        List<Map<String, Object>> rows = (List<Map<String, Object>>) list().get("freight");
        return rows.stream().filter(row -> freightId.equals(row.get("id"))).findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findAdjustment(String adjustmentId) {
        List<Map<String, Object>> rows = (List<Map<String, Object>>) list().get("adjustments");
        return rows.stream().filter(row -> adjustmentId.equals(row.get("id"))).findFirst().orElse(null);
    }

    private String stringOf(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private boolean isNumeric(Object value) {
        try {
            Double.parseDouble(String.valueOf(value));
            return true;
        } catch (NumberFormatException error) {
            return false;
        }
    }
}
