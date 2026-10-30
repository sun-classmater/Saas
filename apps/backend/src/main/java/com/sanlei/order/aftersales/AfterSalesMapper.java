package com.sanlei.order.aftersales;

import java.math.BigDecimal;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AfterSalesMapper {

    String COLUMNS = "a.id, a.case_no AS caseNo, a.customer_id AS customerId, c.name AS customerName, "
            + "a.order_id AS orderId, o.order_no AS orderNo, a.type, a.status, a.description, "
            + "a.claim_amount AS claimAmount, a.resolution, a.created_at AS createdAt, a.updated_at AS updatedAt";

    @Select("<script>SELECT " + COLUMNS + " FROM after_sales_cases a "
            + "JOIN customers c ON c.id = a.customer_id LEFT JOIN orders o ON o.id = a.order_id"
            + "<where><if test='customerId != null'> AND a.customer_id = #{customerId}</if></where>"
            + " ORDER BY a.created_at DESC LIMIT 300</script>")
    List<AfterSalesRow> list(@Param("customerId") String customerId);

    @Select("SELECT " + COLUMNS + " FROM after_sales_cases a "
            + "JOIN customers c ON c.id = a.customer_id LEFT JOIN orders o ON o.id = a.order_id "
            + "WHERE a.id = #{id}")
    AfterSalesRow findById(@Param("id") String id);

    @Select("SELECT customer_id FROM orders WHERE id = #{id}")
    String findOrderCustomer(@Param("id") String id);

    @Insert("INSERT INTO after_sales_cases (id, case_no, customer_id, order_id, type, status, description, "
            + "claim_amount, resolution, created_at, updated_at) "
            + "VALUES (#{id}, #{caseNo}, #{customerId}, #{orderId}, #{type}, 'OPEN', #{description}, #{claimAmount}, "
            + "NULL, #{createdAt}, #{createdAt})")
    int insert(@Param("id") String id,
               @Param("caseNo") String caseNo,
               @Param("customerId") String customerId,
               @Param("orderId") String orderId,
               @Param("type") String type,
               @Param("description") String description,
               @Param("claimAmount") BigDecimal claimAmount,
               @Param("createdAt") String createdAt);

    @Update("UPDATE after_sales_cases SET status = #{status}, resolution = #{resolution}, updated_at = #{now} "
            + "WHERE id = #{id}")
    int updateStatus(@Param("id") String id,
                     @Param("status") String status,
                     @Param("resolution") String resolution,
                     @Param("now") String now);
}
