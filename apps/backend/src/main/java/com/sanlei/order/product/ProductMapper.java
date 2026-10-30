package com.sanlei.order.product;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ProductMapper {

    String COLUMNS = "p.id, p.sku, p.name, p.category, p.vehicle_model AS vehicleModel, p.min_package AS minPackage, "
            + "p.base_price AS basePrice, p.warranty_months AS warrantyMonths, p.warranty_km AS warrantyKm, "
            + "p.active, p.description, p.created_at AS createdAt";

    @Select("SELECT " + COLUMNS + ", "
            + "COALESCE(SUM(CASE WHEN i.source_type = 'REAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS realAvailable, "
            + "COALESCE(SUM(CASE WHEN i.source_type = 'VIRTUAL' THEN i.quantity - i.reserved ELSE 0 END), 0) AS virtualAvailable "
            + "FROM products p LEFT JOIN inventory i ON i.product_id = p.id "
            + "GROUP BY p.id ORDER BY p.active DESC, p.category, p.name")
    List<ProductRow> listAll();

    @Select("SELECT " + COLUMNS + " FROM products p WHERE p.id = #{id} LIMIT 1")
    ProductRow findById(@Param("id") String id);

    @Select("SELECT " + COLUMNS + " FROM products p WHERE p.active = 1 ORDER BY p.category, p.name")
    List<ProductRow> listActive();

    @Insert("INSERT INTO products (id, sku, name, category, vehicle_model, min_package, base_price, warranty_months, "
            + "warranty_km, active, description, created_at) "
            + "VALUES (#{id}, #{sku}, #{name}, #{category}, #{vehicleModel}, #{minPackage}, #{basePrice}, #{warrantyMonths}, "
            + "#{warrantyKm}, #{active}, #{description}, #{createdAt})")
    int insert(ProductRow row);

    @Update("UPDATE products SET sku = #{sku}, name = #{name}, category = #{category}, vehicle_model = #{vehicleModel}, "
            + "min_package = #{minPackage}, base_price = #{basePrice}, warranty_months = #{warrantyMonths}, "
            + "warranty_km = #{warrantyKm}, active = #{active}, description = #{description} WHERE id = #{id}")
    int update(ProductRow row);
}
