package com.sanlei.order.shortage;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Roles;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 缺货公平分配：加权评分 + 按最小包装取整 + 余量按分数二次分配。 */
@Service
public class ShortageService {

    private static final List<String> SHORTAGE_STATUSES = List.of(
            "PENDING_BANGBANG", "PENDING_PAYMENT", "PARTIALLY_PAID", "PENDING_SANLEI",
            "PREPARING", "BACKORDER", "PARTIALLY_SHIPPED");

    private static final String[] READ_ROLES = {"SUPER_ADMIN", "SANLEI_SALES", "BANGBANG_OPS"};

    private final ShortageMapper shortageMapper;
    private final AuditService auditService;

    public ShortageService(ShortageMapper shortageMapper, AuditService auditService) {
        this.shortageMapper = shortageMapper;
        this.auditService = auditService;
    }

    private static double round4(double value) {
        return Math.round(value * 10000) / 10000.0;
    }

    public List<Map<String, Object>> list(AuthUser user) {
        Roles.require(user, READ_ROLES);
        List<Map<String, Object>> result = new ArrayList<>();
        for (ShortageProductRow row : shortageMapper.shortageProducts(SHORTAGE_STATUSES)) {
            double available = row.getAvailable() == null ? 0d : row.getAvailable();
            double demand = row.getPendingDemand() == null ? 0d : row.getPendingDemand();
            if (demand <= available) {
                continue;
            }
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("productId", row.getProductId());
            view.put("sku", row.getSku());
            view.put("name", row.getName());
            view.put("vehicleModel", row.getVehicleModel());
            view.put("minPackage", row.getMinPackage());
            view.put("available", available);
            view.put("pendingDemand", demand);
            view.put("shortage", Math.max(0d, demand - available));
            result.add(view);
        }
        return result;
    }

    private static final class Candidate {
        ShortageCandidateRow row;
        int remaining;
        double outstanding;
        double paidPriority;
        double gradeScore;
        double channelScore;
        double creditScore;
        double historyScore;
        double urgencyScore;
        double score;
        double weightedDemand;
        int suggested;
        double fraction;
    }

    private double gradeScore(String grade) {
        return switch (grade == null ? "" : grade) {
            case "A+" -> 1d;
            case "A" -> 0.9d;
            case "B+" -> 0.8d;
            case "B" -> 0.7d;
            case "C" -> 0.5d;
            default -> 0.5d;
        };
    }

    private double channelScore(String channelType) {
        return switch (channelType == null ? "" : channelType) {
            case "4S_GROUP" -> 1d;
            case "WHOLESALER" -> 0.8d;
            case "CHAIN" -> 0.6d;
            default -> 0.5d;
        };
    }

    public Map<String, Object> preview(AuthUser user, String productId) {
        Roles.require(user, READ_ROLES);
        ShortageProductRow product = shortageMapper.product(productId);
        if (product == null) {
            throw new HttpException(404, "PRODUCT_NOT_FOUND", "产品不存在");
        }
        int physicalStock = shortageMapper.physicalStock(productId) == null
                ? 0 : shortageMapper.physicalStock(productId);
        List<ShortageCandidateRow> rows = shortageMapper.candidates(productId, SHORTAGE_STATUSES);
        if (rows.isEmpty()) {
            throw new HttpException(404, "NO_PENDING_DEMAND", "该产品当前没有待履约订单");
        }

        String cutoff = Instant.now().minus(90, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS).toString();
        Map<String, Double> recent = new LinkedHashMap<>();
        for (RecentPurchaseRow row : shortageMapper.recentPurchases(cutoff)) {
            recent.put(row.getCustomerId(), row.getAmount() == null ? 0d : row.getAmount().doubleValue());
        }
        double maxRecent = 1d;
        for (ShortageCandidateRow row : rows) {
            maxRecent = Math.max(maxRecent, recent.getOrDefault(row.getCustomerId(), 0d));
        }

        long nowMillis = System.currentTimeMillis();
        List<Candidate> candidates = new ArrayList<>();
        for (ShortageCandidateRow row : rows) {
            Candidate candidate = new Candidate();
            candidate.row = row;
            candidate.remaining = row.getQuantity() - row.getShippedQuantity();
            candidate.outstanding = Validation.money(orZero(shortageMapper.creditOutstanding(row.getCustomerId())));
            double paidAmount = row.getPaidAmount() == null ? 0d : row.getPaidAmount().doubleValue();
            candidate.paidPriority = "PREPAY".equals(row.getSettlementMethod())
                    ? (paidAmount > 0 ? 1d : 0.35d)
                    : 0.7d;
            candidate.gradeScore = gradeScore(row.getGrade());
            candidate.channelScore = channelScore(row.getChannelType());
            double creditLimit = row.getCreditLimit() == null ? 0d : row.getCreditLimit().doubleValue();
            candidate.creditScore = creditLimit > 0
                    ? Math.max(0d, 1 - candidate.outstanding / creditLimit)
                    : candidate.paidPriority;
            candidate.historyScore = Math.max(0.15d, recent.getOrDefault(row.getCustomerId(), 0d) / maxRecent);
            double ageDays = Math.max(0d, (nowMillis - Instant.parse(row.getCreatedAt()).toEpochMilli()) / 86400000d);
            candidate.urgencyScore = Math.min(1d, 0.2d + ageDays / 30d);
            candidate.score = round4(
                    candidate.gradeScore * 0.3
                            + candidate.channelScore * 0.15
                            + candidate.creditScore * 0.15
                            + candidate.historyScore * 0.15
                            + candidate.urgencyScore * 0.15
                            + candidate.paidPriority * 0.1);
            candidate.weightedDemand = round4(candidate.remaining * candidate.score);
            candidates.add(candidate);
        }

        int allocatable = Math.max(0, physicalStock);
        int packageSize = product.getMinPackage() == null ? 1 : product.getMinPackage();
        double totalWeighted = candidates.stream().mapToDouble(item -> item.weightedDemand).sum();
        int targetTotal = 0;
        for (Candidate candidate : candidates) {
            double raw = totalWeighted > 0 ? allocatable * candidate.weightedDemand / totalWeighted : 0d;
            int floored = (int) Math.floor(raw / packageSize) * packageSize;
            candidate.suggested = Math.min(candidate.remaining, Math.max(0, floored));
            candidate.fraction = raw - Math.floor(raw / packageSize) * packageSize;
            targetTotal += candidate.suggested;
        }
        int remainingStock = Math.max(0, allocatable - targetTotal);
        List<Candidate> ranked = new ArrayList<>(candidates);
        ranked.sort(Comparator
                .comparingDouble((Candidate item) -> item.fraction).reversed()
                .thenComparing(Comparator.comparingDouble((Candidate item) -> item.score).reversed())
                .thenComparing(item -> item.row.getCreatedAt()));
        while (remainingStock >= packageSize) {
            boolean added = false;
            for (Candidate candidate : ranked) {
                if (remainingStock < packageSize) {
                    break;
                }
                if (candidate.suggested + packageSize <= candidate.remaining) {
                    candidate.suggested += packageSize;
                    remainingStock -= packageSize;
                    added = true;
                }
            }
            if (!added) {
                break;
            }
        }

        Map<String, Object> productView = new LinkedHashMap<>();
        productView.put("id", productId);
        productView.put("sku", product.getSku());
        productView.put("name", product.getName());
        productView.put("vehicleModel", product.getVehicleModel());
        productView.put("minPackage", product.getMinPackage());

        Map<String, Object> weights = new LinkedHashMap<>();
        weights.put("customerGrade", 30);
        weights.put("channelType", 15);
        weights.put("creditHealth", 15);
        weights.put("recentPurchase", 15);
        weights.put("orderUrgency", 15);
        weights.put("paymentPriority", 10);
        Map<String, Object> strategy = new LinkedHashMap<>();
        strategy.put("name", "预付款优先 + 多维度加权公平分配");
        strategy.put("weights", weights);

        int totalDemand = 0;
        int unallocated = 0;
        List<Map<String, Object>> candidateViews = new ArrayList<>();
        for (Candidate candidate : candidates) {
            totalDemand += candidate.remaining;
            unallocated += candidate.remaining - candidate.suggested;
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("orderItemId", candidate.row.getOrderItemId());
            view.put("orderId", candidate.row.getOrderId());
            view.put("orderNo", candidate.row.getOrderNo());
            view.put("customerName", candidate.row.getCustomerName());
            view.put("grade", candidate.row.getGrade());
            view.put("channelType", candidate.row.getChannelType());
            view.put("orderStatus", candidate.row.getStatus());
            view.put("remainingQuantity", candidate.remaining);
            view.put("currentReserved", candidate.row.getCurrentReserved());
            view.put("score", candidate.score);
            view.put("suggestedQuantity", candidate.suggested);
            view.put("unmetQuantity", candidate.remaining - candidate.suggested);
            candidateViews.add(view);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("product", productView);
        data.put("physicalStock", physicalStock);
        data.put("totalDemand", totalDemand);
        data.put("unallocatedDemand", unallocated);
        data.put("strategy", strategy);
        data.put("candidates", candidateViews);
        return data;
    }

    @Transactional
    public Map<String, Object> apply(AuthUser user, String productId, Object targetsPayload) {
        Roles.require(user, "SUPER_ADMIN", "SANLEI_SALES");
        Map<String, Object> preview = preview(user, productId);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> candidateViews = (List<Map<String, Object>>) preview.get("candidates");
        Map<String, Integer> targetMap = new LinkedHashMap<>();
        if (targetsPayload == null) {
            for (Map<String, Object> candidate : candidateViews) {
                targetMap.put(String.valueOf(candidate.get("orderItemId")),
                        ((Number) candidate.get("suggestedQuantity")).intValue());
            }
        } else {
            if (!(targetsPayload instanceof List<?> targets)) {
                throw new HttpException(400, "VALIDATION_ERROR", "分配结果格式无效");
            }
            for (Object raw : targets) {
                if (!(raw instanceof Map<?, ?> target)) {
                    throw new HttpException(400, "VALIDATION_ERROR", "分配结果格式无效");
                }
                int quantity = Validation.nonNegativeInteger(target.get("quantity"), "分配数量");
                targetMap.put(String.valueOf(target.get("orderItemId")), quantity);
            }
        }

        Map<String, Map<String, Object>> candidatesByItem = new LinkedHashMap<>();
        for (Map<String, Object> candidate : candidateViews) {
            candidatesByItem.put(String.valueOf(candidate.get("orderItemId")), candidate);
        }
        int totalTarget = 0;
        for (Map.Entry<String, Integer> entry : targetMap.entrySet()) {
            Map<String, Object> candidate = candidatesByItem.get(entry.getKey());
            if (candidate == null) {
                throw new HttpException(400, "ALLOCATION_ITEM_NOT_FOUND", "分配订单行不属于当前候选范围");
            }
            int remainingQuantity = ((Number) candidate.get("remainingQuantity")).intValue();
            if (entry.getValue() > remainingQuantity) {
                throw new HttpException(400, "ALLOCATION_EXCEEDS_DEMAND", "分配数量不能超过订单剩余数量");
            }
            totalTarget += entry.getValue();
        }
        int physicalStock = ((Number) preview.get("physicalStock")).intValue();
        if (totalTarget > physicalStock) {
            throw new HttpException(400, "ALLOCATION_EXCEEDS_STOCK", "分配总量超过可分配库存");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> product = (Map<String, Object>) preview.get("product");
        int packageSize = ((Number) product.get("minPackage")).intValue();
        String now = Times.nowIso();
        for (Map<String, Object> candidate : candidateViews) {
            String orderItemId = String.valueOf(candidate.get("orderItemId"));
            releaseUnconsumedReservations(orderItemId, now);
            ShortageOrderItemRow item = shortageMapper.findItem(orderItemId);
            shortageMapper.updateItemReserved(orderItemId, item.getShippedQuantity());
        }
        for (Map.Entry<String, Integer> entry : targetMap.entrySet()) {
            if (entry.getValue() == 0) {
                continue;
            }
            if (entry.getValue() % packageSize != 0) {
                throw new HttpException(400, "PACKAGE_QUANTITY", "人工调整数量必须保持最小包装倍数");
            }
            reserveForOrderItem(entry.getKey(), entry.getValue(), now);
        }
        auditService.record(user, "APPLY_SHORTAGE_ALLOCATION", "PRODUCT", productId,
                Map.of("totalTarget", totalTarget, "candidates", targetMap.size(), "strategy", preview.get("strategy")));
        return preview(user, productId);
    }

    private void releaseUnconsumedReservations(String orderItemId, String now) {
        for (ShortageReservationRow reservation : shortageMapper.openReservations(orderItemId)) {
            int quantity = reservation.getQuantity() - reservation.getConsumedQuantity();
            shortageMapper.decreaseReserved(reservation.getInventoryId(), quantity, now);
            shortageMapper.consumeReservation(reservation.getId());
        }
    }

    private void reserveForOrderItem(String orderItemId, int quantity, String now) {
        ShortageOrderItemRow item = shortageMapper.findItem(orderItemId);
        if (item == null) {
            throw new HttpException(404, "ORDER_ITEM_NOT_FOUND", "订单产品行不存在");
        }
        int remaining = quantity;
        for (ShortageStockRow stock : shortageMapper.availableStocks(item.getProductId())) {
            if (remaining <= 0) {
                break;
            }
            int take = Math.min(remaining, stock.getQuantity() - stock.getReserved());
            if (take <= 0) {
                continue;
            }
            shortageMapper.increaseReserved(stock.getId(), take, now);
            shortageMapper.insertReservation(Ids.next("reserve"), orderItemId, stock.getId(), take, now);
            remaining -= take;
        }
        if (remaining > 0) {
            throw new HttpException(409, "INSUFFICIENT_STOCK_DURING_ALLOCATION", "分配过程中库存发生变化，请重新预览");
        }
        shortageMapper.updateItemReserved(orderItemId, item.getShippedQuantity() + quantity);
    }

    private double orZero(Double value) {
        return value == null ? 0d : value;
    }
}
