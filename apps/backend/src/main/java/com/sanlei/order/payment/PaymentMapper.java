package com.sanlei.order.payment;

import com.sanlei.order.order.PaymentListRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface PaymentMapper {

    @Select("SELECT pay.id, pay.payment_no AS paymentNo, c.name AS customerName, pay.order_id AS orderId, "
            + "o.order_no AS orderNo, pay.amount, pay.channel, pay.status, pay.transaction_id AS transactionId, "
            + "pay.paid_at AS paidAt, pay.created_at AS createdAt "
            + "FROM payments pay JOIN orders o ON o.id = pay.order_id JOIN customers c ON c.id = pay.customer_id "
            + "ORDER BY pay.created_at DESC LIMIT 500")
    List<PaymentListRow> listAll();
}
