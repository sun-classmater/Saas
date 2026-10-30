package com.sanlei.order.aftersales;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Roles;
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

/** 售后工单：查询、创建、状态流转。 */
@Service
public class AfterSalesService {

    private static final List<String> TYPES = List.of("RETURN", "CLAIM", "WRONG_ITEM", "REPLACEMENT", "MARKET_FEEDBACK");
    private static final List<String> STATUSES = List.of("REVIEWING", "APPROVED", "REJECTED", "CLOSED");

    private final AfterSalesMapper afterSalesMapper;
    private final AuditService auditService;

    public AfterSalesService(AfterSalesMapper afterSalesMapper, AuditService auditService) {
        this.afterSalesMapper = afterSalesMapper;
        this.auditService = auditService;
    }

    private Map<String, Object> map(AfterSalesRow row) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("caseNo", row.getCaseNo());
        view.put("customerId", row.getCustomerId());
        view.put("customerName", row.getCustomerName());
        view.put("orderId", row.getOrderId());
        view.put("orderNo", row.getOrderNo());
        view.put("type", row.getType());
        view.put("status", row.getStatus());
        view.put("description", row.getDescription());
        view.put("claimAmount", Validation.money(row.getClaimAmount()));
        view.put("resolution", row.getResolution());
        view.put("createdAt", row.getCreatedAt());
        view.put("updatedAt", row.getUpdatedAt());
        return view;
    }

    public List<Map<String, Object>> list(AuthUser user) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (AfterSalesRow row : afterSalesMapper.list(user.isCustomer() ? user.customerId() : null)) {
            result.add(map(row));
        }
        return result;
    }

    public Map<String, Object> detail(AuthUser user, String caseId) {
        AfterSalesRow row = afterSalesMapper.findById(caseId);
        if (row == null || (user.isCustomer() && !user.customerId().equals(row.getCustomerId()))) {
            throw new HttpException(404, "AFTER_SALES_NOT_FOUND", "售后单不存在");
        }
        return map(row);
    }

    @Transactional
    public Map<String, Object> create(AuthUser user, Map<String, Object> payload) {
        String orderId = payload.get("orderId") == null ? "" : String.valueOf(payload.get("orderId"));
        String customerId = afterSalesMapper.findOrderCustomer(orderId);
        if (customerId == null) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        if (user.isCustomer() && !user.customerId().equals(customerId)) {
            throw new HttpException(404, "ORDER_NOT_FOUND", "订单不存在");
        }
        String type = Validation.cleanText(payload.get("type") == null ? "QUALITY" : payload.get("type"), 32)
                .toUpperCase();
        if (!TYPES.contains(type)) {
            throw new HttpException(400, "VALIDATION_ERROR", "售后类型无效");
        }
        String caseId = Ids.next("case");
        String caseNo = SerialNumbers.next("AS");
        String createdAt = Times.nowIso();
        double claimAmount = 0;
        if (payload.get("claimAmount") != null && !"".equals(payload.get("claimAmount"))) {
            claimAmount = Validation.money(Validation.parseDouble(payload.get("claimAmount"), "索赔金额"));
        }
        afterSalesMapper.insert(
                caseId,
                caseNo,
                customerId,
                orderId,
                type,
                Validation.requireText(payload.get("description"), "问题描述", 2000),
                BigDecimal.valueOf(claimAmount),
                createdAt);
        auditService.record(user, "CREATE_AFTER_SALES", "AFTER_SALES", caseId, Map.of("type", type, "orderId", orderId));
        return detail(user, caseId);
    }

    @Transactional
    public Map<String, Object> updateStatus(AuthUser user, String caseId, String status, String resolution) {
        Roles.require(user, "SANLEI_AFTERSALES", "SUPER_ADMIN");
        if (!STATUSES.contains(status)) {
            throw new HttpException(400, "VALIDATION_ERROR", "售后状态无效");
        }
        if (afterSalesMapper.findById(caseId) == null) {
            throw new HttpException(404, "AFTER_SALES_NOT_FOUND", "售后单不存在");
        }
        String cleanResolution = Validation.cleanText(resolution, 2000);
        afterSalesMapper.updateStatus(caseId, status, cleanResolution, Times.nowIso());
        auditService.record(user, "UPDATE_AFTER_SALES", "AFTER_SALES", caseId,
                Map.of("status", status, "resolution", cleanResolution));
        return detail(user, caseId);
    }
}
