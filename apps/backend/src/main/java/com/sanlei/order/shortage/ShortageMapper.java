package com.sanlei.order.shortage;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ShortageMapper {

    @Select("<script>SELECT p.id AS productId, p.sku, p.name, p.vehicle_model AS vehicleModel, "
            + "p.min_package AS minPackage, "
            + "COALESCE((SELECT SUM(i.quantity - i.reserved) FROM inventory i WHERE i.product_id = p.id), 0) AS available, "
            + "COALESCE((SELECT SUM(oi.quantity - oi.shipped_quantity) FROM order_items oi "
            + "JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN "
            + "<foreach collection='statuses' item='status' open='(' separator=',' close=')'>#{status}</foreach>"
            + "), 0) AS pendingDemand "
            + "FROM products p WHERE p.active = 1 "
            + "ORDER BY pendingDemand - available DESC, p.name</script>")
    List<ShortageProductRow> shortageProducts(@Param("statuses") List<String> statuses);

    @Select("SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE product_id = #{productId}")
    Integer physicalStock(@Param("productId") String productId);

    @Select("SELECT sku, name, vehicle_model AS vehicleModel, min_package AS minPackage FROM products "
            + "WHERE id = #{productId} AND active = 1")
    ShortageProductRow product(@Param("productId") String productId);

    @Select("<script>SELECT oi.id AS orderItemId, oi.quantity, oi.shipped_quantity AS shippedQuantity, "
            + "COALESCE((SELECT SUM(r.quantity - r.consumed_quantity) FROM reservations r "
            + "WHERE r.order_item_id = oi.id AND r.consumed_quantity &lt; r.quantity), 0) AS currentReserved, "
            + "o.id AS orderId, o.order_no AS orderNo, o.status, o.settlement_method AS settlementMethod, "
            + "o.paid_amount AS paidAmount, o.total_amount AS totalAmount, o.created_at AS createdAt, "
            + "c.id AS customerId, c.name AS customerName, c.grade, c.channel_type AS channelType, "
            + "c.credit_limit AS creditLimit "
            + "FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN customers c ON c.id = o.customer_id "
            + "WHERE oi.product_id = #{productId} AND o.status IN "
            + "<foreach collection='statuses' item='status' open='(' separator=',' close=')'>#{status}</foreach>"
            + " AND oi.shipped_quantity &lt; oi.quantity ORDER BY o.created_at</script>")
    List<ShortageCandidateRow> candidates(@Param("productId") String productId,
                                          @Param("statuses") List<String> statuses);

    @Select("SELECT customer_id AS customerId, COALESCE(SUM(total_amount), 0) AS amount FROM orders "
            + "WHERE status != 'CANCELLED' AND created_at >= #{cutoff} GROUP BY customer_id")
    List<RecentPurchaseRow> recentPurchases(@Param("cutoff") String cutoff);

    @Select("SELECT COALESCE(SUM(CASE WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED','CANCELLED') "
            + "THEN total_amount - paid_amount ELSE 0 END), 0) FROM orders WHERE customer_id = #{customerId}")
    Double creditOutstanding(@Param("customerId") String customerId);

    // ---------- apply ----------

    @Select("SELECT id, inventory_id AS inventoryId, quantity, consumed_quantity AS consumedQuantity "
            + "FROM reservations WHERE order_item_id = #{orderItemId} AND consumed_quantity < quantity")
    List<ShortageReservationRow> openReservations(@Param("orderItemId") String orderItemId);

    @Update("UPDATE inventory SET reserved = GREATEST(0, reserved - #{quantity}), updated_at = #{now} WHERE id = #{id}")
    int decreaseReserved(@Param("id") String id, @Param("quantity") int quantity, @Param("now") String now);

    @Update("UPDATE reservations SET consumed_quantity = quantity WHERE id = #{id}")
    int consumeReservation(@Param("id") String id);

    @Select("SELECT id, product_id AS productId, quantity, shipped_quantity AS shippedQuantity, "
            + "reserved_quantity AS reservedQuantity FROM order_items WHERE id = #{id}")
    ShortageOrderItemRow findItem(@Param("id") String id);

    @Update("UPDATE order_items SET reserved_quantity = #{reserved} WHERE id = #{id}")
    int updateItemReserved(@Param("id") String id, @Param("reserved") int reserved);

    @Select("SELECT id, quantity, reserved FROM inventory WHERE product_id = #{productId} AND quantity > reserved "
            + "ORDER BY CASE source_type WHEN 'REAL' THEN 0 ELSE 1 END, updated_at")
    List<ShortageStockRow> availableStocks(@Param("productId") String productId);

    @Update("UPDATE inventory SET reserved = reserved + #{take}, updated_at = #{now} WHERE id = #{id}")
    int increaseReserved(@Param("id") String id, @Param("take") int take, @Param("now") String now);

    @Insert("INSERT INTO reservations (id, order_item_id, inventory_id, quantity, consumed_quantity, created_at) "
            + "VALUES (#{id}, #{orderItemId}, #{inventoryId}, #{quantity}, 0, #{now})")
    int insertReservation(@Param("id") String id,
                          @Param("orderItemId") String orderItemId,
                          @Param("inventoryId") String inventoryId,
                          @Param("quantity") int quantity,
                          @Param("now") String now);
}
