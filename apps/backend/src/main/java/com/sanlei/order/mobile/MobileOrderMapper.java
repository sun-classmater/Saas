package com.sanlei.order.mobile;

import java.math.BigDecimal;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MobileOrderMapper {

    @Select("SELECT id, code, name, province, city, channel_type AS channelType, grade, price_tier AS priceTier, "
            + "settlement_method AS settlementMethod, payment_terms_days AS paymentTermsDays, "
            + "credit_limit AS creditLimit, prepay_ratio AS prepayRatio, batch_limit AS batchLimit, "
            + "allow_overpayment AS allowOverpayment, phone, address, active, notes, created_at AS createdAt "
            + "FROM customers WHERE id = #{id} AND active = 1")
    MobileCustomerRow findActiveCustomer(@Param("id") String id);

    @Select("SELECT id, sku, name, category, vehicle_model AS vehicleModel, min_package AS minPackage, "
            + "base_price AS basePrice, warranty_months AS warrantyMonths, warranty_km AS warrantyKm, description "
            + "FROM products WHERE id = #{id} AND active = 1")
    MobileProductRow findActiveProduct(@Param("id") String id);

    @Select("SELECT id, customer_id AS customerId, status FROM plans WHERE id = #{id} AND customer_id = #{customerId}")
    PlanRow findPlan(@Param("id") String id, @Param("customerId") String customerId);

    @Select("SELECT id, plan_id AS planId, week_no AS weekNo, product_id AS productId, quantity, "
            + "ordered_quantity AS orderedQuantity FROM plan_items "
            + "WHERE plan_id = #{planId} AND week_no = #{weekNo} AND product_id = #{productId}")
    PlanItemRow findPlanItem(@Param("planId") String planId,
                             @Param("weekNo") Integer weekNo,
                             @Param("productId") String productId);

    @Select("SELECT price FROM customer_prices WHERE customer_id = #{customerId} AND product_id = #{productId}")
    BigDecimal customerPrice(@Param("customerId") String customerId, @Param("productId") String productId);

    @Select("SELECT price FROM price_rules WHERE price_tier = #{tier} AND product_id = #{productId}")
    BigDecimal tierPrice(@Param("tier") String tier, @Param("productId") String productId);

    @Insert("INSERT INTO order_groups (id, group_no, customer_id, settlement_week, settlement_method, currency, "
            + "tax_mode, created_at) VALUES (#{id}, #{groupNo}, #{customerId}, #{settlementWeek}, #{settlementMethod}, "
            + "'CNY', 'INCLUDED', #{createdAt})")
    int insertGroup(@Param("id") String id,
                    @Param("groupNo") String groupNo,
                    @Param("customerId") String customerId,
                    @Param("settlementWeek") String settlementWeek,
                    @Param("settlementMethod") String settlementMethod,
                    @Param("createdAt") String createdAt);

    @Insert("INSERT INTO orders (id, order_no, group_id, customer_id, vehicle_model, order_type, settlement_method, "
            + "status, total_amount, paid_amount, shipped_amount, prepay_ratio, allow_overpayment, batch_limit, "
            + "plan_id, plan_week, customer_note, ops_note, created_at, updated_at) "
            + "VALUES (#{id}, #{orderNo}, #{groupId}, #{customerId}, #{vehicleModel}, #{orderType}, #{settlementMethod}, "
            + "'PENDING_BANGBANG', #{totalAmount}, 0, 0, #{prepayRatio}, #{allowOverpayment}, #{batchLimit}, "
            + "#{planId}, #{planWeek}, #{customerNote}, NULL, #{createdAt}, #{createdAt})")
    int insertOrder(@Param("id") String id,
                    @Param("orderNo") String orderNo,
                    @Param("groupId") String groupId,
                    @Param("customerId") String customerId,
                    @Param("vehicleModel") String vehicleModel,
                    @Param("orderType") String orderType,
                    @Param("settlementMethod") String settlementMethod,
                    @Param("totalAmount") BigDecimal totalAmount,
                    @Param("prepayRatio") BigDecimal prepayRatio,
                    @Param("allowOverpayment") Integer allowOverpayment,
                    @Param("batchLimit") Integer batchLimit,
                    @Param("planId") String planId,
                    @Param("planWeek") Integer planWeek,
                    @Param("customerNote") String customerNote,
                    @Param("createdAt") String createdAt);

    @Insert("INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, amount, reserved_quantity, "
            + "shipped_quantity) VALUES (#{id}, #{orderId}, #{productId}, #{quantity}, #{unitPrice}, #{amount}, 0, 0)")
    int insertItem(@Param("id") String id,
                   @Param("orderId") String orderId,
                   @Param("productId") String productId,
                   @Param("quantity") int quantity,
                   @Param("unitPrice") BigDecimal unitPrice,
                   @Param("amount") BigDecimal amount);

    @Update("UPDATE plan_items SET ordered_quantity = ordered_quantity + #{quantity} "
            + "WHERE plan_id = #{planId} AND week_no = #{weekNo} AND product_id = #{productId}")
    int increasePlanOrdered(@Param("quantity") int quantity,
                            @Param("planId") String planId,
                            @Param("weekNo") Integer weekNo,
                            @Param("productId") String productId);

    // ---------- 收货 ----------

    @Select("SELECT id, order_id AS orderId, status FROM shipments WHERE id = #{id}")
    ShipmentStatusRow findShipment(@Param("id") String id);

    @Select("SELECT customer_id FROM orders WHERE id = #{id}")
    String findOrderCustomer(@Param("id") String id);

    @Update("UPDATE shipments SET status = 'RECEIVED', received_at = #{now} WHERE id = #{id}")
    int markShipmentReceived(@Param("id") String id, @Param("now") String now);

    @Select("SELECT COUNT(*) FROM shipments WHERE order_id = #{orderId} AND status != 'RECEIVED'")
    int countUnfinishedShipments(@Param("orderId") String orderId);

    @Select("SELECT COUNT(*) FROM order_items WHERE order_id = #{orderId} AND shipped_quantity < quantity")
    int countUnfinishedItems(@Param("orderId") String orderId);

    @Update("UPDATE orders SET status = 'COMPLETED', updated_at = #{now} WHERE id = #{id}")
    int markOrderCompleted(@Param("id") String id, @Param("now") String now);

    // ---------- 客户目录 ----------

    @Select("SELECT p.id, p.sku, p.name, p.category, p.vehicle_model AS vehicleModel, p.min_package AS minPackage, "
            + "p.base_price AS basePrice, p.warranty_months AS warrantyMonths, p.warranty_km AS warrantyKm, "
            + "p.description, "
            + "COALESCE(SUM(CASE WHEN i.source_type = 'REAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS realAvailable, "
            + "COALESCE(SUM(CASE WHEN i.source_type = 'VIRTUAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS virtualAvailable "
            + "FROM products p LEFT JOIN inventory i ON i.product_id = p.id "
            + "WHERE p.active = 1 AND EXISTS (SELECT 1 FROM customer_vehicle_authorizations a "
            + "WHERE a.customer_id = #{customerId} AND a.vehicle_model = p.vehicle_model AND a.active = 1) "
            + "GROUP BY p.id ORDER BY p.category, p.name")
    List<CatalogRow> catalog(@Param("customerId") String customerId);
}
