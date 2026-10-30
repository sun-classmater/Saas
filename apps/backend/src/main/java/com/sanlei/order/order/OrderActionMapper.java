package com.sanlei.order.order;

import java.math.BigDecimal;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface OrderActionMapper {

    String ORDER_COLUMNS = "o.id, o.order_no AS orderNo, o.customer_id AS customerId, o.status, "
            + "o.settlement_method AS settlementMethod, o.total_amount AS totalAmount, o.paid_amount AS paidAmount, "
            + "o.shipped_amount AS shippedAmount, o.prepay_ratio AS prepayRatio, "
            + "o.allow_overpayment AS allowOverpayment, o.batch_limit AS batchLimit, "
            + "o.plan_id AS planId, o.plan_week AS planWeek";

    @Select("SELECT " + ORDER_COLUMNS + ", c.credit_limit AS creditLimit "
            + "FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = #{id}")
    CreditOrderRow findWithCredit(@Param("id") String id);

    @Select("SELECT " + ORDER_COLUMNS + ", c.credit_limit AS creditLimit "
            + "FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = #{id}")
    CreditOrderRow findOrder(@Param("id") String id);

    @Select("SELECT COALESCE(SUM(CASE WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED','CANCELLED') "
            + "THEN total_amount - paid_amount ELSE 0 END), 0) FROM orders WHERE customer_id = #{customerId}")
    Double customerOutstanding(@Param("customerId") String customerId);

    @Select("SELECT id, product_id AS productId, quantity, reserved_quantity AS reservedQuantity "
            + "FROM order_items WHERE order_id = #{orderId}")
    List<OrderItemRow> items(@Param("orderId") String orderId);

    @Select("SELECT id, product_id AS productId, source_type AS sourceType, quantity, reserved, updated_at AS updatedAt "
            + "FROM inventory WHERE product_id = #{productId} AND quantity > reserved "
            + "ORDER BY CASE source_type WHEN 'REAL' THEN 0 ELSE 1 END, updated_at")
    List<InventoryRow> availableStocks(@Param("productId") String productId);

    @Update("UPDATE inventory SET reserved = reserved + #{take}, updated_at = #{now} WHERE id = #{id}")
    int increaseReserved(@Param("id") String id, @Param("take") int take, @Param("now") String now);

    @Insert("INSERT INTO reservations (id, order_item_id, inventory_id, quantity, consumed_quantity, created_at) "
            + "VALUES (#{id}, #{orderItemId}, #{inventoryId}, #{quantity}, 0, #{now})")
    int insertReservation(@Param("id") String id,
                          @Param("orderItemId") String orderItemId,
                          @Param("inventoryId") String inventoryId,
                          @Param("quantity") int quantity,
                          @Param("now") String now);

    @Update("UPDATE order_items SET reserved_quantity = #{reserved} WHERE id = #{id}")
    int updateItemReserved(@Param("id") String id, @Param("reserved") int reserved);

    @Update("UPDATE orders SET status = #{status}, ops_note = COALESCE(NULLIF(#{note}, ''), ops_note), "
            + "updated_at = #{now} WHERE id = #{id}")
    int updateStatusWithNote(@Param("id") String id,
                             @Param("status") String status,
                             @Param("note") String note,
                             @Param("now") String now);

    @Update("UPDATE orders SET status = #{status}, updated_at = #{now} WHERE id = #{id}")
    int updateStatus(@Param("id") String id, @Param("status") String status, @Param("now") String now);

    @Select("SELECT r.id, r.order_item_id AS orderItemId, r.inventory_id AS inventoryId, r.quantity, "
            + "r.consumed_quantity AS consumedQuantity FROM reservations r "
            + "JOIN order_items oi ON oi.id = r.order_item_id "
            + "WHERE oi.order_id = #{orderId} AND r.consumed_quantity < r.quantity")
    List<ReservationRow> openReservations(@Param("orderId") String orderId);

    @Update("UPDATE inventory SET reserved = GREATEST(0, reserved - #{quantity}), updated_at = #{now} WHERE id = #{id}")
    int decreaseReserved(@Param("id") String id, @Param("quantity") int quantity, @Param("now") String now);

    @Update("UPDATE reservations SET consumed_quantity = quantity WHERE id = #{id}")
    int consumeReservation(@Param("id") String id);

    @Insert("INSERT INTO inventory_movements (id, inventory_id, type, quantity, reference_type, reference_id, note, "
            + "created_by, created_at) VALUES (#{id}, #{inventoryId}, 'RELEASE', #{quantity}, 'ORDER', #{orderId}, "
            + "'取消订单释放预占', #{userId}, #{now})")
    int insertReleaseMovement(@Param("id") String id,
                              @Param("inventoryId") String inventoryId,
                              @Param("quantity") int quantity,
                              @Param("orderId") String orderId,
                              @Param("userId") String userId,
                              @Param("now") String now);

    @Update("UPDATE plan_items SET ordered_quantity = GREATEST(0, ordered_quantity - #{quantity}) "
            + "WHERE plan_id = #{planId} AND week_no = #{weekNo} AND product_id = #{productId}")
    int decrementPlanItem(@Param("quantity") int quantity,
                          @Param("planId") String planId,
                          @Param("weekNo") Integer weekNo,
                          @Param("productId") String productId);

    // ---------- 发货 ----------

    @Select("SELECT COUNT(*) FROM shipments WHERE order_id = #{orderId}")
    int countShipments(@Param("orderId") String orderId);

    @Select("SELECT oi.id, oi.order_id AS orderId, oi.product_id AS productId, p.name AS productName, oi.quantity, "
            + "oi.unit_price AS unitPrice, oi.shipped_quantity AS shippedQuantity, "
            + "oi.reserved_quantity AS reservedQuantity "
            + "FROM order_items oi JOIN products p ON p.id = oi.product_id "
            + "WHERE oi.id = #{itemId} AND oi.order_id = #{orderId}")
    ShipmentItemRow findShipmentItem(@Param("itemId") String itemId, @Param("orderId") String orderId);

    @Insert("INSERT INTO shipments (id, shipment_no, order_id, batch_no, status, logistics_company, tracking_no, "
            + "dispatch_location, delivery_mode, amount, shipped_at, received_at, created_at) "
            + "VALUES (#{id}, #{shipmentNo}, #{orderId}, #{batchNo}, 'SHIPPED', #{logisticsCompany}, #{trackingNo}, "
            + "#{dispatchLocation}, #{deliveryMode}, #{amount}, #{shippedAt}, NULL, #{shippedAt})")
    int insertShipment(@Param("id") String id,
                       @Param("shipmentNo") String shipmentNo,
                       @Param("orderId") String orderId,
                       @Param("batchNo") int batchNo,
                       @Param("logisticsCompany") String logisticsCompany,
                       @Param("trackingNo") String trackingNo,
                       @Param("dispatchLocation") String dispatchLocation,
                       @Param("deliveryMode") String deliveryMode,
                       @Param("amount") BigDecimal amount,
                       @Param("shippedAt") String shippedAt);

    @Insert("INSERT INTO shipment_items (id, shipment_id, order_item_id, product_id, quantity, amount) "
            + "VALUES (#{id}, #{shipmentId}, #{orderItemId}, #{productId}, #{quantity}, #{amount})")
    int insertShipmentItem(@Param("id") String id,
                           @Param("shipmentId") String shipmentId,
                           @Param("orderItemId") String orderItemId,
                           @Param("productId") String productId,
                           @Param("quantity") int quantity,
                           @Param("amount") BigDecimal amount);

    @Select("SELECT r.id, r.inventory_id AS inventoryId, r.quantity, r.consumed_quantity AS consumedQuantity "
            + "FROM reservations r WHERE r.order_item_id = #{itemId} AND r.consumed_quantity < r.quantity "
            + "ORDER BY r.created_at")
    List<ConsumeReservationRow> openReservationsForItem(@Param("itemId") String itemId);

    @Update("UPDATE reservations SET consumed_quantity = consumed_quantity + #{take} WHERE id = #{id}")
    int consumeReservationPart(@Param("id") String id, @Param("take") int take);

    @Update("UPDATE inventory SET quantity = quantity - #{take}, reserved = reserved - #{take}, updated_at = #{now} "
            + "WHERE id = #{id}")
    int consumeInventory(@Param("id") String id, @Param("take") int take, @Param("now") String now);

    @Insert("INSERT INTO inventory_movements (id, inventory_id, type, quantity, reference_type, reference_id, note, "
            + "created_by, created_at) VALUES (#{id}, #{inventoryId}, 'SHIPMENT', #{quantity}, 'SHIPMENT', #{shipmentId}, "
            + "'订单发货', #{userId}, #{now})")
    int insertShipmentMovement(@Param("id") String id,
                               @Param("inventoryId") String inventoryId,
                               @Param("quantity") int quantity,
                               @Param("shipmentId") String shipmentId,
                               @Param("userId") String userId,
                               @Param("now") String now);

    @Update("UPDATE order_items SET shipped_quantity = shipped_quantity + #{quantity} WHERE id = #{id}")
    int increaseShipped(@Param("id") String id, @Param("quantity") int quantity);

    @Select("SELECT COUNT(*) FROM order_items WHERE order_id = #{orderId} AND shipped_quantity < quantity")
    int countUnshippedItems(@Param("orderId") String orderId);

    @Update("UPDATE orders SET shipped_amount = shipped_amount + #{amount}, status = #{status}, updated_at = #{now} "
            + "WHERE id = #{id}")
    int applyShipment(@Param("id") String id,
                      @Param("amount") BigDecimal amount,
                      @Param("status") String status,
                      @Param("now") String now);

    // ---------- 收款 ----------

    @Insert("INSERT INTO payments (id, payment_no, customer_id, order_id, amount, channel, status, "
            + "transaction_id, prepay_id, paid_at, created_at) "
            + "VALUES (#{id}, #{paymentNo}, #{customerId}, #{orderId}, #{amount}, 'WECHAT', 'PENDING', NULL, #{prepayId}, "
            + "NULL, #{createdAt})")
    int insertPayment(@Param("id") String id,
                      @Param("paymentNo") String paymentNo,
                      @Param("customerId") String customerId,
                      @Param("orderId") String orderId,
                      @Param("amount") BigDecimal amount,
                      @Param("prepayId") String prepayId,
                      @Param("createdAt") String createdAt);

    @Select("SELECT id, order_id AS orderId, customer_id AS customerId, amount, status FROM payments WHERE id = #{id}")
    PaymentRecordRow findPayment(@Param("id") String id);

    @Update("UPDATE payments SET status = 'SUCCEEDED', transaction_id = #{transactionId}, paid_at = #{paidAt} "
            + "WHERE id = #{id}")
    int markPaymentSucceeded(@Param("id") String id,
                             @Param("transactionId") String transactionId,
                             @Param("paidAt") String paidAt);

    @Select("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE order_id = #{orderId} AND status = 'SUCCEEDED'")
    BigDecimal sumSucceededPayments(@Param("orderId") String orderId);

    @Update("UPDATE orders SET paid_amount = #{paidAmount}, status = CASE "
            + "WHEN status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') AND #{ready} = 1 THEN 'PENDING_SANLEI' "
            + "WHEN status IN ('PENDING_PAYMENT', 'PARTIALLY_PAID') THEN 'PARTIALLY_PAID' "
            + "ELSE status END, updated_at = #{now} WHERE id = #{id}")
    int applyPaymentToOrder(@Param("id") String id,
                            @Param("paidAmount") BigDecimal paidAmount,
                            @Param("ready") int ready,
                            @Param("now") String now);
}
