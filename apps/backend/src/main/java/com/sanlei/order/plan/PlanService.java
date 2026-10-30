package com.sanlei.order.plan;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Roles;
import com.sanlei.order.common.SerialNumbers;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.notification.NotificationService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 采购计划：客户建/改/提交，邦邦与三磊两级审核。 */
@Service
public class PlanService {

    private final PlanMapper planMapper;
    private final AuditService auditService;
    private final NotificationService notificationService;

    public PlanService(PlanMapper planMapper, AuditService auditService, NotificationService notificationService) {
        this.planMapper = planMapper;
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    private Map<String, Object> mapPlan(PlanRow plan, List<Map<String, Object>> items) {
        int totalQuantity = items.stream().mapToInt(item -> (Integer) item.get("quantity")).sum();
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", plan.getId());
        view.put("planNo", plan.getPlanNo());
        view.put("customerId", plan.getCustomerId());
        view.put("customerName", plan.getCustomerName());
        view.put("grade", plan.getGrade());
        view.put("planMonth", plan.getPlanMonth());
        view.put("status", plan.getStatus());
        view.put("customerNote", plan.getCustomerNote());
        view.put("bangbangNote", plan.getBangbangNote());
        view.put("sanleiNote", plan.getSanleiNote());
        view.put("submittedAt", plan.getSubmittedAt());
        view.put("bangbangReviewedAt", plan.getBangbangReviewedAt());
        view.put("sanleiReviewedAt", plan.getSanleiReviewedAt());
        view.put("createdAt", plan.getCreatedAt());
        view.put("itemCount", items.size());
        view.put("totalQuantity", totalQuantity);
        view.put("items", items);
        return view;
    }

    public List<Map<String, Object>> list(AuthUser user, String customerId, String status) {
        String scopedCustomer = user.isCustomer() ? user.customerId() : blankToNull(customerId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (PlanRow plan : planMapper.list(scopedCustomer, blankToNull(status))) {
            List<Map<String, Object>> items = new ArrayList<>();
            for (PlanItemDetailRow item : planMapper.items(plan.getId())) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", item.getId());
                row.put("weekNo", item.getWeekNo());
                row.put("productId", item.getProductId());
                row.put("sku", item.getSku());
                row.put("name", item.getName());
                row.put("vehicleModel", item.getVehicleModel());
                row.put("quantity", item.getQuantity());
                row.put("orderedQuantity", item.getOrderedQuantity());
                items.add(row);
            }
            result.add(mapPlan(plan, items));
        }
        return result;
    }

    private Map<String, Object> find(AuthUser user, String planId) {
        return list(user, null, null).stream().filter(plan -> planId.equals(plan.get("id"))).findFirst().orElse(null);
    }

    private void validateItems(List<?> items) {
        if (items == null || items.isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "采购计划至少需要一个产品");
        }
        for (Object raw : items) {
            if (!(raw instanceof Map<?, ?> item)) {
                throw new HttpException(400, "VALIDATION_ERROR", "计划明细格式不正确");
            }
            int weekNo = Validation.parsePositiveInteger(item.get("weekNo"), "计划周");
            if (weekNo > 6) {
                throw new HttpException(400, "VALIDATION_ERROR", "计划周必须在1到6之间");
            }
            int quantity = Validation.parsePositiveInteger(item.get("quantity"), "计划数量");
            String productId = item.get("productId") == null ? "" : String.valueOf(item.get("productId"));
            PlanProductRow product = planMapper.findActiveProduct(productId);
            if (product == null) {
                throw new HttpException(400, "PRODUCT_NOT_FOUND", "计划产品不存在");
            }
            int minPackage = product.getMinPackage() == null ? 1 : product.getMinPackage();
            if (quantity % minPackage != 0) {
                throw new HttpException(400, "PACKAGE_QUANTITY",
                        product.getName() + "数量必须为" + minPackage + "的倍数");
            }
        }
    }

    /** 与 Node 端 insertPlanItems 一致：同(周,产品)合并后插入。 */
    private void insertItems(String planId, List<?> items) {
        Map<String, Integer> merged = new LinkedHashMap<>();
        for (Object raw : items) {
            Map<?, ?> item = (Map<?, ?>) raw;
            String key = item.get("weekNo") + ":" + item.get("productId");
            merged.merge(key, (Integer) item.get("quantity"), Integer::sum);
        }
        for (Map.Entry<String, Integer> entry : merged.entrySet()) {
            String[] parts = entry.getKey().split(":");
            planMapper.insertItem(Ids.next("planitem"), planId, Integer.parseInt(parts[0]), parts[1], entry.getValue());
        }
    }

    @Transactional
    public Map<String, Object> create(AuthUser user, Map<String, Object> payload) {
        String customerId = user.isCustomer() ? user.customerId() : stringOf(payload.get("customerId"));
        String planMonth = Validation.cleanText(payload.get("planMonth"), 7);
        if (!planMonth.matches("\\d{4}-\\d{2}")) {
            throw new HttpException(400, "VALIDATION_ERROR", "计划月份格式应为YYYY-MM");
        }
        Object rawItems = payload.get("items");
        if (!(rawItems instanceof List<?> items)) {
            throw new HttpException(400, "VALIDATION_ERROR", "采购计划至少需要一个产品");
        }
        validateItems(items);

        String planId = Ids.next("plan");
        String planNo = SerialNumbers.next("PLAN");
        String createdAt = Times.nowIso();
        planMapper.insert(planId, planNo, customerId, planMonth, Validation.cleanText(payload.get("note"), 1000), createdAt);
        insertItems(planId, items);
        auditService.record(user, "CREATE_PLAN", "PLAN", planId, Map.of("planMonth", planMonth));
        return find(user, planId);
    }

    @Transactional
    public Map<String, Object> update(AuthUser user, String planId, Map<String, Object> payload) {
        PlanRow plan = planMapper.findById(planId);
        if (plan == null) {
            throw new HttpException(404, "PLAN_NOT_FOUND", "采购计划不存在");
        }
        if (user.isCustomer() && !user.customerId().equals(plan.getCustomerId())) {
            throw new HttpException(404, "PLAN_NOT_FOUND", "采购计划不存在");
        }
        if (!List.of("DRAFT", "REJECTED").contains(plan.getStatus())) {
            throw new HttpException(409, "PLAN_CANNOT_EDIT", "审核中的计划请先撤回再修改");
        }
        Object rawItems = payload.get("items");
        if (!(rawItems instanceof List<?> items)) {
            throw new HttpException(400, "VALIDATION_ERROR", "采购计划至少需要一个产品");
        }
        validateItems(items);
        String planMonth = payload.get("planMonth") == null
                ? Validation.cleanText(plan.getPlanMonth(), 7)
                : Validation.cleanText(payload.get("planMonth"), 7);
        String note = payload.containsKey("note")
                ? Validation.cleanText(payload.get("note"), 1000)
                : Validation.cleanText(plan.getCustomerNote(), 1000);
        planMapper.resetForEdit(planId, planMonth, note, Times.nowIso());
        planMapper.deleteItems(planId);
        insertItems(planId, items);
        auditService.record(user, "UPDATE_PLAN", "PLAN", planId, null);
        return find(user, planId);
    }

    @Transactional
    public Map<String, Object> action(AuthUser user, String planId, String action, String note) {
        PlanRow plan = planMapper.findById(planId);
        if (plan == null) {
            throw new HttpException(404, "PLAN_NOT_FOUND", "采购计划不存在");
        }
        if (user.isCustomer() && !user.customerId().equals(plan.getCustomerId())) {
            throw new HttpException(404, "PLAN_NOT_FOUND", "采购计划不存在");
        }
        String timestamp = Times.nowIso();
        String cleanNote = Validation.cleanText(note, 1000);
        String nextStatus;
        switch (action == null ? "" : action) {
            case "SUBMIT" -> {
                if (!List.of("DRAFT", "REJECTED").contains(plan.getStatus())) {
                    throw new HttpException(409, "INVALID_PLAN_STATUS", "当前计划不能提交");
                }
                nextStatus = "BANGBANG_REVIEW";
                planMapper.updateSubmitted(planId, nextStatus, timestamp);
            }
            case "WITHDRAW" -> {
                if (!List.of("BANGBANG_REVIEW", "SANLEI_REVIEW").contains(plan.getStatus())) {
                    throw new HttpException(409, "INVALID_PLAN_STATUS", "当前计划不能撤回");
                }
                nextStatus = "DRAFT";
                planMapper.updateWithdraw(planId, timestamp);
            }
            case "BANGBANG_APPROVE" -> {
                Roles.require(user, "BANGBANG_OPS", "SUPER_ADMIN");
                if (!"BANGBANG_REVIEW".equals(plan.getStatus())) {
                    throw new HttpException(409, "INVALID_PLAN_STATUS", "计划不在邦邦审核阶段");
                }
                nextStatus = "SANLEI_REVIEW";
                planMapper.updateBangbangReview(planId, nextStatus, cleanNote, timestamp);
            }
            case "BANGBANG_REJECT" -> {
                Roles.require(user, "BANGBANG_OPS", "SUPER_ADMIN");
                if (!"BANGBANG_REVIEW".equals(plan.getStatus())) {
                    throw new HttpException(409, "INVALID_PLAN_STATUS", "计划不在邦邦审核阶段");
                }
                nextStatus = "REJECTED";
                planMapper.updateBangbangReview(planId, nextStatus,
                        cleanNote.isEmpty() ? "邦邦退回" : cleanNote, timestamp);
            }
            case "SANLEI_APPROVE" -> {
                Roles.require(user, "SANLEI_SALES", "SUPER_ADMIN");
                if (!"SANLEI_REVIEW".equals(plan.getStatus())) {
                    throw new HttpException(409, "INVALID_PLAN_STATUS", "计划不在三磊审核阶段");
                }
                nextStatus = "APPROVED";
                planMapper.updateSanleiReview(planId, nextStatus, cleanNote, timestamp);
            }
            case "SANLEI_REJECT" -> {
                Roles.require(user, "SANLEI_SALES", "SUPER_ADMIN");
                if (!"SANLEI_REVIEW".equals(plan.getStatus())) {
                    throw new HttpException(409, "INVALID_PLAN_STATUS", "计划不在三磊审核阶段");
                }
                nextStatus = "REJECTED";
                planMapper.updateSanleiReview(planId, nextStatus,
                        cleanNote.isEmpty() ? "三磊退回" : cleanNote, timestamp);
            }
            default -> throw new HttpException(400, "INVALID_PLAN_ACTION", "计划操作无效");
        }
        auditService.record(user, "PLAN_" + action, "PLAN", planId,
                Map.of("nextStatus", nextStatus, "note", note == null ? "" : note));
        notificationService.notifyCustomer(plan.getCustomerId(), "采购计划状态更新",
                "计划" + plan.getPlanNo() + "：" + nextStatus);
        return find(user, planId);
    }

    private String stringOf(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
