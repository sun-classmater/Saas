package com.sanlei.order.plan;

import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface PlanMapper {

    String COLUMNS = "p.id, p.plan_no AS planNo, p.customer_id AS customerId, c.name AS customerName, c.grade, "
            + "p.plan_month AS planMonth, p.status, p.customer_note AS customerNote, p.bangbang_note AS bangbangNote, "
            + "p.sanlei_note AS sanleiNote, p.submitted_at AS submittedAt, "
            + "p.bangbang_reviewed_at AS bangbangReviewedAt, p.sanlei_reviewed_at AS sanleiReviewedAt, "
            + "p.created_at AS createdAt, p.updated_at AS updatedAt";

    @Select("<script>SELECT " + COLUMNS + " FROM plans p JOIN customers c ON c.id = p.customer_id"
            + "<where>"
            + "<if test='customerId != null'> AND p.customer_id = #{customerId}</if>"
            + "<if test='status != null'> AND p.status = #{status}</if>"
            + "</where> ORDER BY p.plan_month DESC, p.created_at DESC LIMIT 300</script>")
    List<PlanRow> list(@Param("customerId") String customerId, @Param("status") String status);

    @Select("SELECT " + COLUMNS + " FROM plans p JOIN customers c ON c.id = p.customer_id WHERE p.id = #{id}")
    PlanRow findById(@Param("id") String id);

    @Select("SELECT pi.id, pi.week_no AS weekNo, pi.product_id AS productId, pr.sku, pr.name, "
            + "pr.vehicle_model AS vehicleModel, pi.quantity, pi.ordered_quantity AS orderedQuantity "
            + "FROM plan_items pi JOIN products pr ON pr.id = pi.product_id "
            + "WHERE pi.plan_id = #{planId} ORDER BY pi.week_no, pr.name")
    List<PlanItemDetailRow> items(@Param("planId") String planId);

    @Insert("INSERT INTO plans (id, plan_no, customer_id, plan_month, status, customer_note, bangbang_note, "
            + "sanlei_note, submitted_at, bangbang_reviewed_at, sanlei_reviewed_at, created_at, updated_at) "
            + "VALUES (#{id}, #{planNo}, #{customerId}, #{planMonth}, 'DRAFT', #{note}, NULL, NULL, NULL, NULL, NULL, "
            + "#{createdAt}, #{createdAt})")
    int insert(@Param("id") String id,
               @Param("planNo") String planNo,
               @Param("customerId") String customerId,
               @Param("planMonth") String planMonth,
               @Param("note") String note,
               @Param("createdAt") String createdAt);

    @Insert("INSERT INTO plan_items (id, plan_id, week_no, product_id, quantity, ordered_quantity) "
            + "VALUES (#{id}, #{planId}, #{weekNo}, #{productId}, #{quantity}, 0)")
    int insertItem(@Param("id") String id,
                   @Param("planId") String planId,
                   @Param("weekNo") int weekNo,
                   @Param("productId") String productId,
                   @Param("quantity") int quantity);

    @Delete("DELETE FROM plan_items WHERE plan_id = #{planId}")
    int deleteItems(@Param("planId") String planId);

    @Update("UPDATE plans SET plan_month = #{planMonth}, customer_note = #{note}, status = 'DRAFT', "
            + "submitted_at = NULL, bangbang_reviewed_at = NULL, sanlei_reviewed_at = NULL, "
            + "bangbang_note = NULL, sanlei_note = NULL, updated_at = #{now} WHERE id = #{id}")
    int resetForEdit(@Param("id") String id,
                     @Param("planMonth") String planMonth,
                     @Param("note") String note,
                     @Param("now") String now);

    @Update("UPDATE plans SET status = #{status}, submitted_at = #{now}, updated_at = #{now} WHERE id = #{id}")
    int updateSubmitted(@Param("id") String id, @Param("status") String status, @Param("now") String now);

    @Update("UPDATE plans SET status = 'DRAFT', submitted_at = NULL, bangbang_reviewed_at = NULL, "
            + "sanlei_reviewed_at = NULL, bangbang_note = NULL, sanlei_note = NULL, updated_at = #{now} WHERE id = #{id}")
    int updateWithdraw(@Param("id") String id, @Param("now") String now);

    @Update("UPDATE plans SET status = #{status}, bangbang_note = #{note}, bangbang_reviewed_at = #{now}, "
            + "updated_at = #{now} WHERE id = #{id}")
    int updateBangbangReview(@Param("id") String id,
                             @Param("status") String status,
                             @Param("note") String note,
                             @Param("now") String now);

    @Update("UPDATE plans SET status = #{status}, sanlei_note = #{note}, sanlei_reviewed_at = #{now}, "
            + "updated_at = #{now} WHERE id = #{id}")
    int updateSanleiReview(@Param("id") String id,
                           @Param("status") String status,
                           @Param("note") String note,
                           @Param("now") String now);

    @Select("SELECT id, name, min_package AS minPackage FROM products WHERE id = #{id} AND active = 1")
    PlanProductRow findActiveProduct(@Param("id") String id);
}
