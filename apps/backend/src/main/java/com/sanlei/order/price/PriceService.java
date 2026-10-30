package com.sanlei.order.price;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.product.ProductMapper;
import com.sanlei.order.product.ProductRow;
import com.sanlei.order.product.ProductService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PriceService {

    private final PriceMapper priceMapper;
    private final ProductMapper productMapper;
    private final ProductService productService;
    private final AuditService auditService;

    public PriceService(PriceMapper priceMapper, ProductMapper productMapper,
                        ProductService productService, AuditService auditService) {
        this.priceMapper = priceMapper;
        this.productMapper = productMapper;
        this.productService = productService;
        this.auditService = auditService;
    }

    /** 价格优先级：客户专属价 > 价格等级价 > 未配置。 */
    public Map<String, Object> effectivePrice(String customerId, String productId) {
        String tier = priceMapper.activePriceTier(customerId);
        if (tier == null) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在或已停用");
        }
        BigDecimal customerPrice = priceMapper.customerPrice(customerId, productId);
        if (customerPrice != null) {
            return Map.of("price", Validation.money(customerPrice), "source", "CUSTOMER_SPECIFIC");
        }
        BigDecimal tierPrice = priceMapper.tierPrice(tier, productId);
        if (tierPrice != null) {
            return Map.of("price", Validation.money(tierPrice), "source", "PRICE_TIER");
        }
        throw new HttpException(400, "PRICE_NOT_CONFIGURED", "该产品尚未配置当前客户可用价格");
    }

    public List<Map<String, Object>> preview(String customerId) {
        if (priceMapper.countCustomer(customerId) == 0) {
            throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProductRow product : productMapper.listActive()) {
            try {
                Map<String, Object> pricing = effectivePrice(customerId, product.getId());
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", product.getId());
                row.put("sku", product.getSku());
                row.put("name", product.getName());
                row.putAll(pricing);
                result.add(row);
            } catch (HttpException error) {
                if (!"PRICE_NOT_CONFIGURED".equals(error.getCode())) {
                    throw error;
                }
            }
        }
        return result;
    }

    public Map<String, Object> matrix() {
        List<Map<String, Object>> products = new ArrayList<>();
        for (ProductRow product : productMapper.listActive()) {
            products.add(productService.mapProduct(product));
        }
        TreeSet<String> tiers = new TreeSet<>();
        List<Map<String, Object>> tierPrices = new ArrayList<>();
        for (TierPriceRow row : priceMapper.tierRules()) {
            tiers.add(row.getTier());
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("tier", row.getTier());
            view.put("productId", row.getProductId());
            view.put("sku", row.getSku());
            view.put("productName", row.getProductName());
            view.put("price", Validation.money(row.getPrice()));
            tierPrices.add(view);
        }
        List<Map<String, Object>> customerPrices = new ArrayList<>();
        for (CustomerPriceRow row : priceMapper.customerPriceRows()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("customerId", row.getCustomerId());
            view.put("customerName", row.getCustomerName());
            view.put("productId", row.getProductId());
            view.put("sku", row.getSku());
            view.put("productName", row.getProductName());
            view.put("price", Validation.money(row.getPrice()));
            customerPrices.add(view);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tiers", new ArrayList<>(tiers));
        data.put("products", products);
        data.put("tierPrices", tierPrices);
        data.put("customerPrices", customerPrices);
        return data;
    }

    @Transactional
    public Map<String, Object> setPrice(AuthUser user, Map<String, Object> payload) {
        double price = Validation.parsePositiveNumber(payload.get("price"), "价格");
        String productId = payload.get("productId") == null ? "" : String.valueOf(payload.get("productId"));
        if (priceMapper.countProduct(productId) == 0) {
            throw new HttpException(404, "PRODUCT_NOT_FOUND", "产品不存在");
        }
        BigDecimal amount = BigDecimal.valueOf(price).setScale(2, RoundingMode.HALF_UP);
        String now = Times.nowIso();
        if ("CUSTOMER".equals(payload.get("scope"))) {
            String customerId = payload.get("customerId") == null ? "" : String.valueOf(payload.get("customerId"));
            if (priceMapper.countCustomer(customerId) == 0) {
                throw new HttpException(404, "CUSTOMER_NOT_FOUND", "客户不存在");
            }
            priceMapper.upsertCustomerPrice(Ids.next("cp"), customerId, productId, amount, now);
            auditService.record(user, "SET_CUSTOMER_PRICE", "CUSTOMER", customerId,
                    Map.of("productId", productId, "price", Validation.money(amount)));
        } else {
            String tier = Validation.requireText(payload.get("tier"), "价格等级", 30);
            priceMapper.upsertTierPrice(Ids.next("price"), tier, productId, amount, now);
            auditService.record(user, "SET_TIER_PRICE", "PRODUCT", productId,
                    Map.of("tier", tier, "price", Validation.money(amount)));
        }
        return matrix();
    }
}
