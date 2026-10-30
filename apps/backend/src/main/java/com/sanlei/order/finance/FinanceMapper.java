package com.sanlei.order.finance;

import java.math.BigDecimal;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface FinanceMapper {

    @Select("SELECT i.id, i.invoice_no AS invoiceNo, i.order_id AS orderId, i.customer_id AS customerId, "
            + "o.order_no AS orderNo, c.name AS customerName, i.title, i.tax_number AS taxNumber, i.amount, "
            + "i.tax_rate AS taxRate, i.status, i.note, i.issued_at AS issuedAt, i.created_at AS createdAt "
            + "FROM invoices i JOIN orders o ON o.id = i.order_id JOIN customers c ON c.id = i.customer_id "
            + "ORDER BY i.created_at DESC LIMIT 500")
    List<InvoiceRow> invoices();

    @Select("SELECT f.id, f.order_id AS orderId, f.customer_id AS customerId, o.order_no AS orderNo, "
            + "c.name AS customerName, f.amount, f.payer, f.status, f.description, f.settled_at AS settledAt, "
            + "f.created_at AS createdAt "
            + "FROM freight_charges f JOIN orders o ON o.id = f.order_id JOIN customers c ON c.id = f.customer_id "
            + "ORDER BY f.created_at DESC LIMIT 500")
    List<FreightRow> freight();

    @Select("SELECT a.id, a.adjustment_no AS adjustmentNo, a.customer_id AS customerId, a.order_id AS orderId, "
            + "o.order_no AS orderNo, c.name AS customerName, a.type, a.amount, a.status, a.description, "
            + "a.settled_at AS settledAt, a.created_at AS createdAt "
            + "FROM financial_adjustments a JOIN customers c ON c.id = a.customer_id "
            + "LEFT JOIN orders o ON o.id = a.order_id ORDER BY a.created_at DESC LIMIT 500")
    List<AdjustmentRow> adjustments();

    @Select("SELECT id FROM orders WHERE id = #{id}")
    String findOrderId(@Param("id") String id);

    @Select("SELECT total_amount FROM orders WHERE id = #{id}")
    BigDecimal findOrderTotal(@Param("id") String id);

    @Select("SELECT customer_id FROM orders WHERE id = #{id}")
    String findOrderCustomer(@Param("id") String id);

    @Insert("INSERT INTO invoices (id, invoice_no, order_id, customer_id, title, tax_number, amount, tax_rate, "
            + "status, note, issued_at, created_at) "
            + "VALUES (#{id}, #{invoiceNo}, #{orderId}, #{customerId}, #{title}, #{taxNumber}, #{amount}, #{taxRate}, "
            + "'PENDING', #{note}, NULL, #{createdAt})")
    int insertInvoice(@Param("id") String id,
                      @Param("invoiceNo") String invoiceNo,
                      @Param("orderId") String orderId,
                      @Param("customerId") String customerId,
                      @Param("title") String title,
                      @Param("taxNumber") String taxNumber,
                      @Param("amount") BigDecimal amount,
                      @Param("taxRate") BigDecimal taxRate,
                      @Param("note") String note,
                      @Param("createdAt") String createdAt);

    @Update("UPDATE invoices SET status = #{status}, issued_at = #{issuedAt} WHERE id = #{id}")
    int updateInvoiceStatus(@Param("id") String id, @Param("status") String status, @Param("issuedAt") String issuedAt);

    @Select("SELECT COUNT(*) FROM invoices WHERE id = #{id}")
    int countInvoice(@Param("id") String id);

    @Insert("INSERT INTO freight_charges (id, order_id, customer_id, amount, payer, status, description, settled_at, "
            + "created_at) VALUES (#{id}, #{orderId}, #{customerId}, #{amount}, #{payer}, 'PENDING', #{description}, "
            + "NULL, #{createdAt})")
    int insertFreight(@Param("id") String id,
                      @Param("orderId") String orderId,
                      @Param("customerId") String customerId,
                      @Param("amount") BigDecimal amount,
                      @Param("payer") String payer,
                      @Param("description") String description,
                      @Param("createdAt") String createdAt);

    @Insert("INSERT INTO financial_adjustments (id, adjustment_no, customer_id, order_id, type, amount, status, "
            + "description, settled_at, created_at) "
            + "VALUES (#{id}, #{adjustmentNo}, #{customerId}, #{orderId}, #{type}, #{amount}, 'PENDING', "
            + "#{description}, NULL, #{createdAt})")
    int insertAdjustment(@Param("id") String id,
                         @Param("adjustmentNo") String adjustmentNo,
                         @Param("customerId") String customerId,
                         @Param("orderId") String orderId,
                         @Param("type") String type,
                         @Param("amount") BigDecimal amount,
                         @Param("description") String description,
                         @Param("createdAt") String createdAt);

    @Select("SELECT COUNT(*) FROM customers WHERE id = #{id}")
    int countCustomer(@Param("id") String id);

    @Update("UPDATE freight_charges SET status = 'SETTLED', settled_at = #{now} WHERE id = #{id}")
    int settleFreight(@Param("id") String id, @Param("now") String now);

    @Update("UPDATE financial_adjustments SET status = 'SETTLED', settled_at = #{now} WHERE id = #{id}")
    int settleAdjustment(@Param("id") String id, @Param("now") String now);

    @Select("SELECT COUNT(*) FROM freight_charges WHERE id = #{id}")
    int countFreight(@Param("id") String id);

    @Select("SELECT COUNT(*) FROM financial_adjustments WHERE id = #{id}")
    int countAdjustment(@Param("id") String id);
}
