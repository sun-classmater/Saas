package com.sanlei.order.customer;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CustomerMapper {

    String COLUMNS = "id, code, name, province, city, channel_type AS channelType, grade, price_tier AS priceTier, "
            + "settlement_method AS settlementMethod, payment_terms_days AS paymentTermsDays, credit_limit AS creditLimit, "
            + "prepay_ratio AS prepayRatio, batch_limit AS batchLimit, allow_overpayment AS allowOverpayment, "
            + "phone, address, active, notes, created_at AS createdAt";

    @Select("SELECT " + COLUMNS + " FROM customers WHERE id = #{id} LIMIT 1")
    CustomerRow findById(@Param("id") String id);

    @Select("<script>SELECT " + COLUMNS + " FROM customers"
            + "<where>"
            + "<if test='keyword != null'> AND (name LIKE #{keyword} OR code LIKE #{keyword} OR phone LIKE #{keyword})</if>"
            + "<if test='active != null'> AND active = #{active}</if>"
            + "</where> ORDER BY active DESC, created_at DESC</script>")
    List<CustomerRow> list(@Param("keyword") String keyword, @Param("active") Integer active);

    @Select("SELECT COALESCE(SUM(CASE WHEN settlement_method = 'CREDIT' AND status NOT IN ('COMPLETED','CANCELLED') "
            + "THEN total_amount - paid_amount ELSE 0 END), 0) FROM orders WHERE customer_id = #{customerId}")
    Double outstanding(@Param("customerId") String customerId);

    @Insert("INSERT INTO customers (id, code, name, province, city, channel_type, grade, price_tier, settlement_method, "
            + "payment_terms_days, credit_limit, prepay_ratio, batch_limit, allow_overpayment, phone, address, active, notes, created_at) "
            + "VALUES (#{id}, #{code}, #{name}, #{province}, #{city}, #{channelType}, #{grade}, #{priceTier}, #{settlementMethod}, "
            + "#{paymentTermsDays}, #{creditLimit}, #{prepayRatio}, #{batchLimit}, #{allowOverpayment}, #{phone}, #{address}, "
            + "#{active}, #{notes}, #{createdAt})")
    int insert(CustomerRow row);

    @Update("UPDATE customers SET code = #{code}, name = #{name}, province = #{province}, city = #{city}, "
            + "channel_type = #{channelType}, grade = #{grade}, price_tier = #{priceTier}, "
            + "settlement_method = #{settlementMethod}, payment_terms_days = #{paymentTermsDays}, "
            + "credit_limit = #{creditLimit}, prepay_ratio = #{prepayRatio}, batch_limit = #{batchLimit}, "
            + "allow_overpayment = #{allowOverpayment}, phone = #{phone}, address = #{address}, active = #{active}, "
            + "notes = #{notes} WHERE id = #{id}")
    int update(CustomerRow row);

    @Select("SELECT DISTINCT vehicle_model FROM products WHERE active = 1 ORDER BY vehicle_model")
    List<String> allActiveVehicles();

    @Select("SELECT vehicle_model FROM customer_vehicle_authorizations "
            + "WHERE customer_id = #{customerId} AND active = 1 ORDER BY vehicle_model")
    List<String> authorizedVehicles(@Param("customerId") String customerId);

    @Update("UPDATE customer_vehicle_authorizations SET active = 0 WHERE customer_id = #{customerId}")
    int deactivateAuthorizations(@Param("customerId") String customerId);

    @Insert("INSERT INTO customer_vehicle_authorizations (id, customer_id, vehicle_model, province, city, active, created_at) "
            + "VALUES (#{id}, #{customerId}, #{vehicleModel}, #{province}, #{city}, 1, #{createdAt}) "
            + "ON DUPLICATE KEY UPDATE active = 1")
    int upsertAuthorization(@Param("id") String id,
                            @Param("customerId") String customerId,
                            @Param("vehicleModel") String vehicleModel,
                            @Param("province") String province,
                            @Param("city") String city,
                            @Param("createdAt") String createdAt);
}
