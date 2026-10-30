package com.sanlei.order.customer;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerService {

    private static final Set<String> CHANNEL_TYPES = Set.of("WHOLESALER", "4S_GROUP", "CHAIN");
    private static final Set<String> SETTLEMENT_METHODS = Set.of("CREDIT", "PREPAY");

    private final CustomerMapper customerMapper;
    private final AuditService auditService;

    public CustomerService(CustomerMapper customerMapper, AuditService auditService) {
        this.customerMapper = customerMapper;
        this.auditService = auditService;
    }

    public double outstanding(String customerId) {
        Double value = customerMapper.outstanding(customerId);
        return Validation.money(value == null ? 0d : value);
    }

    public Map<String, Object> mapCustomer(CustomerRow row, double outstanding) {
        if (row == null) {
            return null;
        }
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("code", row.getCode());
        view.put("name", row.getName());
        view.put("province", row.getProvince());
        view.put("city", row.getCity());
        view.put("channelType", row.getChannelType());
        view.put("grade", row.getGrade());
        view.put("priceTier", row.getPriceTier());
        view.put("settlementMethod", row.getSettlementMethod());
        view.put("paymentTermsDays", row.getPaymentTermsDays());
        view.put("creditLimit", Validation.money(row.getCreditLimit()));
        view.put("creditOutstanding", outstanding);
        view.put("prepayRatio", row.getPrepayRatio() == null ? 1d : row.getPrepayRatio().doubleValue());
        view.put("batchLimit", row.getBatchLimit());
        view.put("allowOverpayment", Validation.asBoolean(row.getAllowOverpayment()));
        view.put("phone", row.getPhone());
        view.put("address", row.getAddress());
        view.put("active", Validation.asBoolean(row.getActive()));
        view.put("notes", row.getNotes());
        view.put("createdAt", row.getCreatedAt());
        return view;
    }

    public Map<String, Object> profile(String customerId) {
        if (customerId == null) {
            return null;
        }
        CustomerRow row = customerMapper.findById(customerId);
        return row == null ? null : mapCustomer(row, outstanding(customerId));
    }

    public List<Map<String, Object>> list(String keyword, String activeParam) {
        String likeKeyword = keyword == null || keyword.isBlank() ? null : "%" + keyword.trim() + "%";
        Integer active = null;
        if (activeParam != null && !activeParam.isBlank()) {
            active = "true".equals(activeParam) || "1".equals(activeParam) ? 1 : 0;
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (CustomerRow row : customerMapper.list(likeKeyword, active)) {
            result.add(mapCustomer(row, outstanding(row.getId())));
        }
        return result;
    }

    @Transactional
    public Map<String, Object> save(AuthUser user, Map<String, Object> payload, String customerId) {
        CustomerRow existing = customerId == null ? null : customerMapper.findById(customerId);
        if (customerId != null && existing == null) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
        }
        String channelType = Validation.cleanText(
                payload.get("channelType") != null ? payload.get("channelType") : existing == null ? "WHOLESALER" : existing.getChannelType(),
                32).toUpperCase();
        String settlementMethod = Validation.cleanText(
                payload.get("settlementMethod") != null ? payload.get("settlementMethod") : existing == null ? "CREDIT" : existing.getSettlementMethod(),
                32).toUpperCase();
        if (!CHANNEL_TYPES.contains(channelType)) {
            throw new HttpException(400, "VALIDATION_ERROR", "渠道类型无效");
        }
        if (!SETTLEMENT_METHODS.contains(settlementMethod)) {
            throw new HttpException(400, "VALIDATION_ERROR", "结算方式无效");
        }

        CustomerRow row = new CustomerRow();
        row.setId(existing == null ? null : existing.getId());
        row.setCode(Validation.requireText(pick(payload, existing, "code"), "客户编码"));
        row.setName(Validation.requireText(pick(payload, existing, "name"), "客户名称"));
        row.setProvince(Validation.cleanText(pick(payload, existing, "province"), 50));
        row.setCity(Validation.cleanText(pick(payload, existing, "city"), 50));
        row.setChannelType(channelType);
        row.setGrade(Validation.requireText(pick(payload, existing, "grade"), "客户等级", 20));
        row.setPriceTier(Validation.requireText(pick(payload, existing, "priceTier"), "价格等级", 20));
        row.setSettlementMethod(settlementMethod);
        row.setPaymentTermsDays(Validation.nonNegativeInteger(
                pickOrDefault(payload, existing, "paymentTermsDays", 0), "账期天数"));
        row.setCreditLimit(BigDecimal.valueOf(Validation.nonNegativeNumber(
                pickOrDefault(payload, existing, "creditLimit", 0), "信用额度")));
        row.setPrepayRatio(BigDecimal.valueOf(Validation.ratio(
                pickOrDefault(payload, existing, "prepayRatio", 1))));
        Object batchLimitValue = pickOrDefault(payload, existing, "batchLimit", 3);
        int batchLimit = (int) Math.round(Validation.parsePositiveNumber(batchLimitValue, "最多发货批次"));
        if (batchLimit > 20) {
            throw new HttpException(400, "VALIDATION_ERROR", "最多发货批次不能超过20");
        }
        row.setBatchLimit(batchLimit);
        Object allowOverpayment = payload.get("allowOverpayment");
        row.setAllowOverpayment(Boolean.TRUE.equals(allowOverpayment) || Integer.valueOf(1).equals(allowOverpayment) ? 1 : 0);
        row.setPhone(Validation.cleanText(pick(payload, existing, "phone"), 30));
        row.setAddress(Validation.cleanText(pick(payload, existing, "address"), 500));
        Object active = payload.get("active");
        row.setActive(Boolean.FALSE.equals(active) || Integer.valueOf(0).equals(active) ? 0 : 1);
        row.setNotes(Validation.cleanText(pick(payload, existing, "notes"), 1000));

        Map<String, Object> auditDetails = new LinkedHashMap<>();
        auditDetails.put("code", row.getCode());
        auditDetails.put("name", row.getName());
        auditDetails.put("channelType", row.getChannelType());
        auditDetails.put("priceTier", row.getPriceTier());
        auditDetails.put("settlementMethod", row.getSettlementMethod());

        try {
            if (existing != null) {
                customerMapper.update(row);
                auditService.record(user, "UPDATE_CUSTOMER", "CUSTOMER", row.getId(), auditDetails);
                return profile(row.getId());
            }
            row.setId(Ids.next("cust"));
            row.setCreatedAt(Times.nowIso());
            customerMapper.insert(row);
            auditService.record(user, "CREATE_CUSTOMER", "CUSTOMER", row.getId(), auditDetails);
            return profile(row.getId());
        } catch (DuplicateKeyException error) {
            throw new HttpException(409, "CUSTOMER_CODE_EXISTS", "客户编码已存在");
        }
    }

    public Map<String, Object> authorizations(String customerId) {
        CustomerRow customer = customerMapper.findById(customerId);
        if (customer == null) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("customerId", customerId);
        data.put("province", customer.getProvince());
        data.put("city", customer.getCity());
        data.put("allVehicles", customerMapper.allActiveVehicles());
        data.put("authorizedVehicles", customerMapper.authorizedVehicles(customerId));
        return data;
    }

    @Transactional
    public Map<String, Object> setAuthorizations(AuthUser user, String customerId, Object vehiclesPayload) {
        CustomerRow customer = customerMapper.findById(customerId);
        if (customer == null) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
        }
        if (!(vehiclesPayload instanceof List<?> vehicles) || vehicles.isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "至少授权一个车型");
        }
        List<String> validVehicles = customerMapper.allActiveVehicles();
        List<String> requested = new ArrayList<>();
        for (Object value : vehicles) {
            String vehicle = String.valueOf(value);
            if (!validVehicles.contains(vehicle)) {
                throw new HttpException(400, "INVALID_VEHICLE_MODEL", "车型" + vehicle + "不存在");
            }
            requested.add(vehicle);
        }
        customerMapper.deactivateAuthorizations(customerId);
        String createdAt = Times.nowIso();
        for (String vehicle : new LinkedHashSet<>(requested)) {
            customerMapper.upsertAuthorization(
                    Ids.next("auth"), customerId, vehicle, customer.getProvince(), customer.getCity(), createdAt);
        }
        auditService.record(user, "SET_VEHICLE_AUTH", "CUSTOMER", customerId, Map.of("vehicles", requested));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("customerId", customerId);
        data.put("province", customer.getProvince());
        data.put("city", customer.getCity());
        data.put("allVehicles", validVehicles);
        data.put("authorizedVehicles", customerMapper.authorizedVehicles(customerId));
        return data;
    }

    private Object pick(Map<String, Object> payload, CustomerRow existing, String key) {
        if (payload.containsKey(key) && payload.get(key) != null) {
            return payload.get(key);
        }
        if (existing == null) {
            return null;
        }
        return switch (key) {
            case "code" -> existing.getCode();
            case "name" -> existing.getName();
            case "province" -> existing.getProvince();
            case "city" -> existing.getCity();
            case "grade" -> existing.getGrade();
            case "priceTier" -> existing.getPriceTier();
            case "phone" -> existing.getPhone();
            case "address" -> existing.getAddress();
            case "notes" -> existing.getNotes();
            default -> null;
        };
    }

    private Object pickOrDefault(Map<String, Object> payload, CustomerRow existing, String key, Object fallback) {
        if (payload.containsKey(key) && payload.get(key) != null) {
            return payload.get(key);
        }
        if (existing != null) {
            return switch (key) {
                case "paymentTermsDays" -> existing.getPaymentTermsDays();
                case "creditLimit" -> existing.getCreditLimit();
                case "prepayRatio" -> existing.getPrepayRatio();
                case "batchLimit" -> existing.getBatchLimit();
                default -> fallback;
            };
        }
        return fallback;
    }
}
