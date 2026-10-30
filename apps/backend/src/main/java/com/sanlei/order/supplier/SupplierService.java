package com.sanlei.order.supplier;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Validation;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupplierService {

    private final SupplierMapper supplierMapper;
    private final AuditService auditService;

    public SupplierService(SupplierMapper supplierMapper, AuditService auditService) {
        this.supplierMapper = supplierMapper;
        this.auditService = auditService;
    }

    public Map<String, Object> map(SupplierRow row) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("name", row.getName());
        view.put("type", row.getType());
        view.put("contact", row.getContact());
        view.put("phone", row.getPhone());
        view.put("active", Validation.asBoolean(row.getActive()));
        return view;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (SupplierRow row : supplierMapper.listAll()) {
            result.add(map(row));
        }
        return result;
    }

    @Transactional
    public Map<String, Object> save(AuthUser user, Map<String, Object> payload, String supplierId) {
        SupplierRow existing = supplierId == null ? null : supplierMapper.findById(supplierId);
        if (supplierId != null && existing == null) {
            throw new HttpException(404, "SUPPLIER_NOT_FOUND", "供应商不存在");
        }
        SupplierRow row = new SupplierRow();
        row.setId(existing == null ? null : existing.getId());
        row.setName(Validation.requireText(pick(payload, existing, "name"), "供应商名称"));
        row.setType(Validation.cleanText(
                payload.get("type") != null ? payload.get("type") : existing == null ? "INTEGRATOR" : existing.getType(),
                32).toUpperCase());
        row.setContact(Validation.cleanText(pick(payload, existing, "contact"), 100));
        row.setPhone(Validation.cleanText(pick(payload, existing, "phone"), 30));
        Object active = payload.get("active");
        row.setActive(Boolean.FALSE.equals(active) || Integer.valueOf(0).equals(active) ? 0 : 1);
        if (!List.of("FACTORY", "INTEGRATOR").contains(row.getType())) {
            throw new HttpException(400, "VALIDATION_ERROR", "供应商类型无效");
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("name", row.getName());
        details.put("type", row.getType());
        if (existing != null) {
            supplierMapper.update(row);
            auditService.record(user, "UPDATE_SUPPLIER", "SUPPLIER", row.getId(), details);
        } else {
            row.setId(Ids.next("sup"));
            supplierMapper.insert(row);
            auditService.record(user, "CREATE_SUPPLIER", "SUPPLIER", row.getId(), details);
        }
        return map(supplierMapper.findById(row.getId()));
    }

    private Object pick(Map<String, Object> payload, SupplierRow existing, String key) {
        if (payload.containsKey(key) && payload.get(key) != null) {
            return payload.get(key);
        }
        if (existing == null) {
            return null;
        }
        return switch (key) {
            case "name" -> existing.getName();
            case "contact" -> existing.getContact();
            case "phone" -> existing.getPhone();
            default -> null;
        };
    }
}
