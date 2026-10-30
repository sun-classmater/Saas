package com.sanlei.order.price;

import java.math.BigDecimal;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface PriceMapper {

    @Select("SELECT price_tier FROM customers WHERE id = #{customerId} AND active = 1 LIMIT 1")
    String activePriceTier(@Param("customerId") String customerId);

    @Select("SELECT COUNT(*) FROM customers WHERE id = #{customerId}")
    int countCustomer(@Param("customerId") String customerId);

    @Select("SELECT COUNT(*) FROM products WHERE id = #{productId}")
    int countProduct(@Param("productId") String productId);

    @Select("SELECT price FROM customer_prices WHERE customer_id = #{customerId} AND product_id = #{productId} LIMIT 1")
    BigDecimal customerPrice(@Param("customerId") String customerId, @Param("productId") String productId);

    @Select("SELECT price FROM price_rules WHERE price_tier = #{tier} AND product_id = #{productId} LIMIT 1")
    BigDecimal tierPrice(@Param("tier") String tier, @Param("productId") String productId);

    @Select("SELECT r.id, r.price_tier AS tier, r.product_id AS productId, r.price, p.sku, p.name AS productName "
            + "FROM price_rules r JOIN products p ON p.id = r.product_id "
            + "ORDER BY r.price_tier, p.name")
    List<TierPriceRow> tierRules();

    @Select("SELECT cp.id, cp.customer_id AS customerId, c.name AS customerName, cp.product_id AS productId, "
            + "cp.price, p.sku, p.name AS productName "
            + "FROM customer_prices cp JOIN customers c ON c.id = cp.customer_id "
            + "JOIN products p ON p.id = cp.product_id ORDER BY c.name, p.name")
    List<CustomerPriceRow> customerPriceRows();

    @Insert("INSERT INTO price_rules (id, price_tier, product_id, price, created_at, updated_at) "
            + "VALUES (#{id}, #{tier}, #{productId}, #{price}, #{now}, #{now}) "
            + "ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = VALUES(updated_at)")
    int upsertTierPrice(@Param("id") String id,
                        @Param("tier") String tier,
                        @Param("productId") String productId,
                        @Param("price") BigDecimal price,
                        @Param("now") String now);

    @Insert("INSERT INTO customer_prices (id, customer_id, product_id, price, created_at, updated_at) "
            + "VALUES (#{id}, #{customerId}, #{productId}, #{price}, #{now}, #{now}) "
            + "ON DUPLICATE KEY UPDATE price = VALUES(price), updated_at = VALUES(updated_at)")
    int upsertCustomerPrice(@Param("id") String id,
                            @Param("customerId") String customerId,
                            @Param("productId") String productId,
                            @Param("price") BigDecimal price,
                            @Param("now") String now);
}
