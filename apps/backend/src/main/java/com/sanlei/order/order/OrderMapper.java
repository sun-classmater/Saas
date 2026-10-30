package com.sanlei.order.order;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface OrderMapper {

    String SELECT_WITH_JOIN = "SELECT o.*, g.group_no AS groupNo, c.name AS customerName, c.grade AS customerGrade "
            + "FROM orders o JOIN order_groups g ON g.id = o.group_id JOIN customers c ON c.id = o.customer_id ";

    @Select("<script>" + SELECT_WITH_JOIN
            + "<where>"
            + "<if test='customerId != null'> AND o.customer_id = #{customerId}</if>"
            + "<if test='status != null'> AND o.status = #{status}</if>"
            + "<if test='type != null'> AND o.order_type = #{type}</if>"
            + "<if test='keyword != null'> AND (o.order_no LIKE #{keyword} OR c.name LIKE #{keyword} OR o.vehicle_model LIKE #{keyword})</if>"
            + "</where> ORDER BY o.created_at DESC LIMIT 500</script>")
    List<OrderRow> search(@Param("customerId") String customerId,
                          @Param("status") String status,
                          @Param("type") String type,
                          @Param("keyword") String keyword);

    @Select(SELECT_WITH_JOIN + "WHERE o.id = #{id}")
    OrderRow findById(@Param("id") String id);

    @Select("SELECT oi.*, p.sku, p.name, p.category, p.vehicle_model AS vehicleModel, p.min_package AS minPackage "
            + "FROM order_items oi JOIN products p ON p.id = oi.product_id "
            + "WHERE oi.order_id = #{orderId} ORDER BY p.category, p.name")
    List<OrderItemRow> items(@Param("orderId") String orderId);

    @Select("SELECT id, payment_no AS paymentNo, amount, channel, status, transaction_id AS transactionId, "
            + "paid_at AS paidAt, created_at AS createdAt FROM payments "
            + "WHERE order_id = #{orderId} ORDER BY created_at DESC")
    List<PaymentRow> payments(@Param("orderId") String orderId);

    @Select("SELECT s.id, s.shipment_no AS shipmentNo, s.batch_no AS batchNo, s.status, "
            + "s.logistics_company AS logisticsCompany, s.tracking_no AS trackingNo, "
            + "s.dispatch_location AS dispatchLocation, s.delivery_mode AS deliveryMode, s.amount, "
            + "s.shipped_at AS shippedAt, s.received_at AS receivedAt, "
            + "GROUP_CONCAT(CONCAT(p.name, ' ×', si.quantity) SEPARATOR '、') AS summary "
            + "FROM shipments s LEFT JOIN shipment_items si ON si.shipment_id = s.id "
            + "LEFT JOIN products p ON p.id = si.product_id "
            + "WHERE s.order_id = #{orderId} GROUP BY s.id ORDER BY s.batch_no")
    List<ShipmentRow> shipments(@Param("orderId") String orderId);

    @Select("SELECT id, group_no AS groupNo, customer_id AS customerId, settlement_week AS settlementWeek, "
            + "settlement_method AS settlementMethod, currency, tax_mode AS taxMode, created_at AS createdAt "
            + "FROM order_groups WHERE id = #{id}")
    OrderGroupRow group(@Param("id") String id);

    @Select("SELECT id, order_no AS orderNo, vehicle_model AS vehicleModel, total_amount AS totalAmount, status "
            + "FROM orders WHERE group_id = #{groupId} ORDER BY created_at")
    List<OrderRow> siblings(@Param("groupId") String groupId);
}
