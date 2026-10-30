package com.sanlei.order.user;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserAdminMapper {

    @Select("SELECT u.id, u.username, u.display_name AS displayName, u.phone, u.role, u.active, "
            + "u.created_at AS createdAt, c.name AS customerName "
            + "FROM users u LEFT JOIN customers c ON c.id = u.customer_id ORDER BY u.created_at")
    List<UserListRow> listAll();

    @Select("SELECT u.id, u.username, u.display_name AS displayName, u.phone, u.role, u.active, "
            + "u.created_at AS createdAt, c.name AS customerName "
            + "FROM users u LEFT JOIN customers c ON c.id = u.customer_id WHERE u.id = #{id}")
    UserListRow findById(@Param("id") String id);

    @Select("SELECT COUNT(*) FROM customers WHERE id = #{id}")
    int countCustomer(@Param("id") String id);

    @Select("SELECT name FROM customers WHERE id = #{id}")
    String customerName(@Param("id") String id);

    @Select("SELECT role FROM users WHERE id = #{id}")
    String roleOf(@Param("id") String id);

    @Insert("INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid, role, "
            + "customer_id, active, created_at) "
            + "VALUES (#{id}, #{username}, NULL, #{displayName}, #{phone}, NULL, 'CUSTOMER_BUYER', #{customerId}, 1, "
            + "#{createdAt})")
    int insertCustomerUser(@Param("id") String id,
                           @Param("username") String username,
                           @Param("displayName") String displayName,
                           @Param("phone") String phone,
                           @Param("customerId") String customerId,
                           @Param("createdAt") String createdAt);

    @Insert("INSERT INTO users (id, username, password_hash, display_name, phone, wechat_openid, role, "
            + "customer_id, active, created_at) "
            + "VALUES (#{id}, #{username}, #{passwordHash}, #{displayName}, #{phone}, NULL, #{role}, NULL, 1, "
            + "#{createdAt})")
    int insertStaffUser(@Param("id") String id,
                        @Param("username") String username,
                        @Param("passwordHash") String passwordHash,
                        @Param("displayName") String displayName,
                        @Param("phone") String phone,
                        @Param("role") String role,
                        @Param("createdAt") String createdAt);

    @Update("UPDATE users SET active = #{active} WHERE id = #{id}")
    int updateActive(@Param("id") String id, @Param("active") int active);
}
