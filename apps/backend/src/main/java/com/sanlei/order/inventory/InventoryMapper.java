package com.sanlei.order.inventory;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface InventoryMapper {

    String COLUMNS = "i.id, i.product_id AS productId, p.sku, p.name, p.vehicle_model AS vehicleModel, "
            + "p.min_package AS minPackage, i.warehouse_name AS warehouseName, i.source_type AS sourceType, "
            + "i.supplier_id AS supplierId, s.name AS supplierName, i.quantity, i.reserved, i.updated_at AS updatedAt";

    @Select("<script>SELECT " + COLUMNS + " FROM inventory i "
            + "JOIN products p ON p.id = i.product_id LEFT JOIN suppliers s ON s.id = i.supplier_id"
            + "<where>"
            + "<if test='productId != null'> AND i.product_id = #{productId}</if>"
            + "<if test='lowStock'> AND (i.quantity - i.reserved) &lt;= 20</if>"
            + "</where> ORDER BY p.category, p.name, i.source_type DESC</script>")
    List<InventoryItemRow> list(@Param("productId") String productId, @Param("lowStock") boolean lowStock);

    @Select("SELECT " + COLUMNS + " FROM inventory i "
            + "JOIN products p ON p.id = i.product_id LEFT JOIN suppliers s ON s.id = i.supplier_id "
            + "WHERE i.id = #{id}")
    InventoryItemRow findById(@Param("id") String id);

    @Select("<script>SELECT m.id, p.sku, p.name, i.warehouse_name AS warehouseName, m.type, m.quantity, "
            + "m.reference_type AS referenceType, m.reference_id AS referenceId, m.note, m.created_at AS createdAt "
            + "FROM inventory_movements m JOIN inventory i ON i.id = m.inventory_id "
            + "JOIN products p ON p.id = i.product_id"
            + "<where><if test='productId != null'> AND i.product_id = #{productId}</if></where>"
            + " ORDER BY m.created_at DESC LIMIT 500</script>")
    List<MovementRow> movements(@Param("productId") String productId);

    @Select("SELECT id, product_id AS productId, warehouse_name AS warehouseName, quantity, reserved "
            + "FROM inventory WHERE id = #{id}")
    InventorySnapshot snapshot(@Param("id") String id);

    @Update("UPDATE inventory SET quantity = quantity - #{quantity}, updated_at = #{now} WHERE id = #{id}")
    int decreaseQuantity(@Param("id") String id, @Param("quantity") int quantity, @Param("now") String now);

    @Update("UPDATE inventory SET quantity = quantity + #{quantity}, updated_at = #{now} WHERE id = #{id}")
    int increaseQuantity(@Param("id") String id, @Param("quantity") int quantity, @Param("now") String now);

    @Insert("INSERT INTO inventory_movements (id, inventory_id, type, quantity, reference_type, reference_id, note, "
            + "created_by, created_at) VALUES (#{id}, #{inventoryId}, #{type}, #{quantity}, #{referenceType}, "
            + "#{referenceId}, #{note}, #{createdBy}, #{createdAt})")
    int insertMovement(@Param("id") String id,
                       @Param("inventoryId") String inventoryId,
                       @Param("type") String type,
                       @Param("quantity") int quantity,
                       @Param("referenceType") String referenceType,
                       @Param("referenceId") String referenceId,
                       @Param("note") String note,
                       @Param("createdBy") String createdBy,
                       @Param("createdAt") String createdAt);
}
