package com.sanlei.order.product;

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
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductService {

    private final ProductMapper productMapper;
    private final AuditService auditService;

    public ProductService(ProductMapper productMapper, AuditService auditService) {
        this.productMapper = productMapper;
        this.auditService = auditService;
    }

    public Map<String, Object> mapProduct(ProductRow row) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("sku", row.getSku());
        view.put("name", row.getName());
        view.put("category", row.getCategory());
        view.put("vehicleModel", row.getVehicleModel());
        view.put("minPackage", row.getMinPackage());
        view.put("basePrice", Validation.money(row.getBasePrice()));
        view.put("warrantyMonths", row.getWarrantyMonths());
        view.put("warrantyKm", row.getWarrantyKm());
        view.put("active", Validation.asBoolean(row.getActive()));
        view.put("description", row.getDescription());
        return view;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProductRow row : productMapper.listAll()) {
            double real = row.getRealAvailable() == null ? 0d : row.getRealAvailable();
            double virtual = row.getVirtualAvailable() == null ? 0d : row.getVirtualAvailable();
            Map<String, Object> view = mapProduct(row);
            view.put("realAvailable", real);
            view.put("virtualAvailable", virtual);
            view.put("available", real + virtual);
            result.add(view);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> save(AuthUser user, Map<String, Object> payload, String productId) {
        ProductRow existing = productId == null ? null : productMapper.findById(productId);
        if (productId != null && existing == null) {
            throw new HttpException(404, "PRODUCT_NOT_FOUND", "产品不存在");
        }
        ProductRow row = new ProductRow();
        row.setId(existing == null ? null : existing.getId());
        row.setSku(Validation.requireText(pick(payload, existing, "sku"), "物料号", 80));
        row.setName(Validation.requireText(pick(payload, existing, "name"), "产品名称", 200));
        row.setCategory(Validation.requireText(pick(payload, existing, "category"), "产品分类", 50));
        row.setVehicleModel(Validation.requireText(pick(payload, existing, "vehicleModel"), "车型", 100));
        row.setMinPackage(Validation.parsePositiveInteger(
                pickOrDefault(payload, existing, "minPackage", 1), "最小包装"));
        row.setBasePrice(BigDecimal.valueOf(Validation.parsePositiveNumber(
                pick(payload, existing, "basePrice"), "基础价格")));
        row.setWarrantyMonths(Validation.nonNegativeInteger(
                pickOrDefault(payload, existing, "warrantyMonths", 12), "质保月数"));
        row.setWarrantyKm(Validation.nonNegativeInteger(
                pickOrDefault(payload, existing, "warrantyKm", 60000), "质保里程"));
        Object active = payload.get("active");
        row.setActive(Boolean.FALSE.equals(active) || Integer.valueOf(0).equals(active) ? 0 : 1);
        row.setDescription(Validation.cleanText(pick(payload, existing, "description"), 2000));

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("sku", row.getSku());
        details.put("name", row.getName());
        details.put("basePrice", Validation.money(row.getBasePrice()));

        try {
            if (existing != null) {
                productMapper.update(row);
                auditService.record(user, "UPDATE_PRODUCT", "PRODUCT", row.getId(), details);
            } else {
                row.setId(Ids.next("prod"));
                row.setCreatedAt(Times.nowIso());
                productMapper.insert(row);
                auditService.record(user, "CREATE_PRODUCT", "PRODUCT", row.getId(), details);
            }
        } catch (DuplicateKeyException error) {
            throw new HttpException(409, "PRODUCT_SKU_EXISTS", "物料号已存在");
        }
        ProductRow saved = productMapper.findById(row.getId());
        Map<String, Object> view = mapProduct(saved);
        view.put("realAvailable", 0d);
        view.put("virtualAvailable", 0d);
        view.put("available", 0d);
        return view;
    }

    private Object pick(Map<String, Object> payload, ProductRow existing, String key) {
        if (payload.containsKey(key) && payload.get(key) != null) {
            return payload.get(key);
        }
        if (existing == null) {
            return null;
        }
        return switch (key) {
            case "sku" -> existing.getSku();
            case "name" -> existing.getName();
            case "category" -> existing.getCategory();
            case "vehicleModel" -> existing.getVehicleModel();
            case "basePrice" -> existing.getBasePrice();
            case "description" -> existing.getDescription();
            default -> null;
        };
    }

    private Object pickOrDefault(Map<String, Object> payload, ProductRow existing, String key, Object fallback) {
        if (payload.containsKey(key) && payload.get(key) != null) {
            return payload.get(key);
        }
        if (existing != null) {
            return switch (key) {
                case "minPackage" -> existing.getMinPackage();
                case "warrantyMonths" -> existing.getWarrantyMonths();
                case "warrantyKm" -> existing.getWarrantyKm();
                default -> fallback;
            };
        }
        return fallback;
    }
}
