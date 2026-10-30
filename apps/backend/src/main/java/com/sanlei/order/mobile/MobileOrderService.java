package com.sanlei.order.mobile;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.SerialNumbers;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import com.sanlei.order.customer.CustomerService;
import com.sanlei.order.notification.NotificationService;
import com.sanlei.order.order.OrderService;
import com.sanlei.order.price.PriceService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 客户侧（小程序）能力：目录、下单、收货。 */
@Service
public class MobileOrderService {

    private static final List<String> ORDER_TYPES = List.of("NORMAL", "PREPAY", "NEW_PRODUCT", "PLAN", "TEMPORARY");
    private static final List<String> SETTLEMENT_METHODS = List.of("CREDIT", "PREPAY");

    private final MobileOrderMapper mobileOrderMapper;
    private final PriceService priceService;
    private final CustomerService customerService;
    private final OrderService orderService;
    private final AuditService auditService;
    private final NotificationService notificationService;

    public MobileOrderService(MobileOrderMapper mobileOrderMapper, PriceService priceService,
                              CustomerService customerService, OrderService orderService,
                              AuditService auditService, NotificationService notificationService) {
        this.mobileOrderMapper = mobileOrderMapper;
        this.priceService = priceService;
        this.customerService = customerService;
        this.orderService = orderService;
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    public Map<String, Object> catalog(String customerId) {
        List<Map<String, Object>> products = new ArrayList<>();
        for (CatalogRow row : mobileOrderMapper.catalog(customerId)) {
            Map<String, Object> pricing;
            try {
                pricing = priceService.effectivePrice(customerId, row.getId());
            } catch (HttpException error) {
                if ("PRICE_NOT_CONFIGURED".equals(error.getCode())) {
                    continue;
                }
                throw error;
            }
            double real = row.getRealAvailable() == null ? 0d : row.getRealAvailable();
            double virtual = row.getVirtualAvailable() == null ? 0d : row.getVirtualAvailable();
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("sku", row.getSku());
            view.put("name", row.getName());
            view.put("category", row.getCategory());
            view.put("vehicleModel", row.getVehicleModel());
            view.put("minPackage", row.getMinPackage());
            view.put("description", row.getDescription());
            view.put("warrantyMonths", row.getWarrantyMonths());
            view.put("warrantyKm", row.getWarrantyKm());
            view.put("price", pricing.get("price"));
            view.put("priceSource", pricing.get("source"));
            view.put("realAvailable", real);
            view.put("virtualAvailable", virtual);
            view.put("available", Math.max(0d, real) + Math.max(0d, virtual));
            products.add(view);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("products", products);
        data.put("customer", customerService.profile(customerId));
        return data;
    }

    @Transactional
    public Map<String, Object> create(AuthUser user, Map<String, Object> payload) {
        String customerId = user.isCustomer() ? user.customerId() : stringOf(payload.get("customerId"));
        MobileCustomerRow customer = mobileOrderMapper.findActiveCustomer(customerId);
        if (customer == null) {
            throw new HttpException(400, "CUSTOMER_NOT_FOUND", "客户不存在或已停用");
        }
        String orderType = (payload.get("orderType") == null ? "NORMAL" : stringOf(payload.get("orderType")))
                .trim().toUpperCase();
        if (!ORDER_TYPES.contains(orderType)) {
            throw new HttpException(400, "VALIDATION_ERROR", "订单类型无效");
        }
        String settlementMethod = payload.get("settlementMethod") == null
                ? customer.getSettlementMethod()
                : stringOf(payload.get("settlementMethod")).trim().toUpperCase();
        if ("PREPAY".equals(orderType) || "NEW_PRODUCT".equals(orderType)) {
            settlementMethod = "PREPAY";
        }
        if ("PREPAY".equals(customer.getSettlementMethod())) {
            settlementMethod = "PREPAY";
        }
        if (!SETTLEMENT_METHODS.contains(settlementMethod)) {
            throw new HttpException(400, "VALIDATION_ERROR", "结算方式无效");
        }
        Object rawItems = payload.get("items");
        if (!(rawItems instanceof List<?> requestedItems) || requestedItems.isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "订单至少需要包含一个产品");
        }
        if (requestedItems.size() > 200) {
            throw new HttpException(400, "VALIDATION_ERROR", "单次最多提交200个产品行");
        }

        Map<String, Integer> merged = new LinkedHashMap<>();
        for (Object rawItem : requestedItems) {
            if (!(rawItem instanceof Map<?, ?> item)) {
                throw new HttpException(400, "VALIDATION_ERROR", "订单行格式不正确");
            }
            String productId = stringOf(item.get("productId")).trim();
            if (productId.isEmpty()) {
                throw new HttpException(400, "VALIDATION_ERROR", "产品不能为空");
            }
            int quantity = Validation.parsePositiveInteger(item.get("quantity"), "数量");
            merged.merge(productId, quantity, Integer::sum);
        }

        Integer planWeek = payload.get("planWeek") == null ? null
                : Validation.parsePositiveInteger(payload.get("planWeek"), "计划周");
        PlanRow plan = null;
        if ("PLAN".equals(orderType)) {
            String planId = stringOf(payload.get("planId"));
            if (planId.isEmpty() || planWeek == null || planWeek > 6) {
                throw new HttpException(400, "VALIDATION_ERROR", "计划订单必须选择已审核计划和计划周");
            }
            plan = mobileOrderMapper.findPlan(planId, customerId);
            if (plan == null || !"APPROVED".equals(plan.getStatus())) {
                throw new HttpException(400, "PLAN_NOT_APPROVED", "只能从已审核通过的计划创建计划订单");
            }
        }

        List<NormalizedItem> normalized = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : merged.entrySet()) {
            String productId = entry.getKey();
            int quantity = entry.getValue();
            MobileProductRow product = mobileOrderMapper.findActiveProduct(productId);
            if (product == null) {
                throw new HttpException(400, "PRODUCT_NOT_FOUND", "产品不存在或已停用");
            }
            int minPackage = product.getMinPackage() == null ? 1 : product.getMinPackage();
            if (quantity % minPackage != 0) {
                throw new HttpException(400, "PACKAGE_QUANTITY",
                        product.getName() + "数量必须为" + minPackage + "的最小包装倍数");
            }
            Map<String, Object> priced = priceFor(customerId, customer.getPriceTier(), productId);
            if (plan != null) {
                PlanItemRow planItem = mobileOrderMapper.findPlanItem(plan.getId(), planWeek, productId);
                if (planItem == null) {
                    throw new HttpException(400, "PLAN_ITEM_NOT_FOUND", product.getName() + "不在该计划周内");
                }
                if (planItem.getOrderedQuantity() + quantity > planItem.getQuantity()) {
                    throw new HttpException(400, "PLAN_QUANTITY_EXCEEDED",
                            product.getName() + "超出该计划周剩余可下单数量");
                }
            }
            double unitPrice = ((Number) priced.get("price")).doubleValue();
            normalized.add(new NormalizedItem(product, quantity, unitPrice, Validation.money(unitPrice * quantity)));
        }

        String groupId = Ids.next("group");
        String groupNo = SerialNumbers.next("SO");
        String createdAt = Times.nowIso();
        mobileOrderMapper.insertGroup(groupId, groupNo, customerId, Times.settlementWeek(), settlementMethod, createdAt);

        Map<String, List<NormalizedItem>> byVehicle = new LinkedHashMap<>();
        for (NormalizedItem item : normalized) {
            byVehicle.computeIfAbsent(item.product().getVehicleModel(), key -> new ArrayList<>()).add(item);
        }

        List<String> createdOrders = new ArrayList<>();
        double groupTotal = 0;
        for (NormalizedItem item : normalized) {
            groupTotal += item.amount();
        }
        groupTotal = Validation.money(groupTotal);
        String customerNote = Validation.cleanText(payload.get("note"), 1000);

        for (Map.Entry<String, List<NormalizedItem>> entry : byVehicle.entrySet()) {
            String orderId = Ids.next("order");
            String orderNo = SerialNumbers.next("OD");
            double totalAmount = Validation.money(entry.getValue().stream().mapToDouble(NormalizedItem::amount).sum());
            mobileOrderMapper.insertOrder(
                    orderId,
                    orderNo,
                    groupId,
                    customerId,
                    entry.getKey(),
                    orderType,
                    settlementMethod,
                    BigDecimal.valueOf(totalAmount),
                    customer.getPrepayRatio() == null ? BigDecimal.ONE : customer.getPrepayRatio(),
                    customer.getAllowOverpayment(),
                    customer.getBatchLimit(),
                    plan == null ? null : plan.getId(),
                    planWeek,
                    customerNote,
                    createdAt);
            for (NormalizedItem item : entry.getValue()) {
                mobileOrderMapper.insertItem(Ids.next("item"), orderId, item.product().getId(), item.quantity(),
                        BigDecimal.valueOf(item.unitPrice()), BigDecimal.valueOf(item.amount()));
                if (plan != null) {
                    mobileOrderMapper.increasePlanOrdered(item.quantity(), plan.getId(), planWeek, item.product().getId());
                }
            }
            createdOrders.add(orderId);
        }

        auditService.record(user, "CREATE_ORDER", "ORDER_GROUP", groupId,
                Map.of("orderType", orderType, "settlementMethod", settlementMethod, "totalAmount", groupTotal));
        notificationService.notifyCustomer(customerId, "订单已提交", "订单" + groupNo + "已提交，等待邦邦确认。");
        notificationService.notifyRoles(List.of("SUPER_ADMIN", "BANGBANG_OPS"), "新订单待确认",
                groupNo + " 已提交 " + createdOrders.size() + " 张订单，请及时确认。");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("groupId", groupId);
        data.put("groupNo", groupNo);
        data.put("orderIds", createdOrders);
        data.put("totalAmount", groupTotal);
        return data;
    }

    @Transactional
    public Map<String, Object> receive(AuthUser user, String shipmentId) {
        ShipmentStatusRow shipment = mobileOrderMapper.findShipment(shipmentId);
        if (shipment == null) {
            throw new HttpException(404, "SHIPMENT_NOT_FOUND", "发货批次不存在");
        }
        String customerId = mobileOrderMapper.findOrderCustomer(shipment.getOrderId());
        if (user.isCustomer() && !user.customerId().equals(customerId)) {
            throw new HttpException(404, "SHIPMENT_NOT_FOUND", "发货批次不存在");
        }
        if (!"RECEIVED".equals(shipment.getStatus())) {
            String now = Times.nowIso();
            mobileOrderMapper.markShipmentReceived(shipmentId, now);
            int unfinishedShipments = mobileOrderMapper.countUnfinishedShipments(shipment.getOrderId());
            int unfinishedItems = mobileOrderMapper.countUnfinishedItems(shipment.getOrderId());
            if (unfinishedShipments == 0 && unfinishedItems == 0) {
                mobileOrderMapper.markOrderCompleted(shipment.getOrderId(), now);
            }
            auditService.record(user, "RECEIVE_SHIPMENT", "SHIPMENT", shipmentId, null);
        }
        return orderService.detail(user, shipment.getOrderId());
    }

    private Map<String, Object> priceFor(String customerId, String priceTier, String productId) {
        BigDecimal specific = mobileOrderMapper.customerPrice(customerId, productId);
        if (specific != null) {
            return Map.of("price", Validation.money(specific), "source", "CUSTOMER_SPECIFIC");
        }
        BigDecimal tier = mobileOrderMapper.tierPrice(priceTier, productId);
        if (tier != null) {
            return Map.of("price", Validation.money(tier), "source", "PRICE_TIER");
        }
        throw new HttpException(400, "PRICE_NOT_CONFIGURED", "该产品尚未配置当前客户可用价格");
    }

    private String stringOf(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private record NormalizedItem(MobileProductRow product, int quantity, double unitPrice, double amount) {
    }
}
