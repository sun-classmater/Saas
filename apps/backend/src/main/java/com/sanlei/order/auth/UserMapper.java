package com.sanlei.order.auth;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserMapper {

    String COLUMNS = "id, username, password_hash AS passwordHash, display_name AS displayName, "
            + "phone, wechat_openid AS wechatOpenid, role, customer_id AS customerId, active";

    @Select("SELECT " + COLUMNS + " FROM users WHERE username = #{username} AND active = 1 LIMIT 1")
    UserRow findByUsername(@Param("username") String username);

    @Select("SELECT " + COLUMNS + " FROM users WHERE id = #{id} LIMIT 1")
    UserRow findById(@Param("id") String id);

    @Select("SELECT " + COLUMNS
            + " FROM users WHERE phone = #{phone} AND active = 1 AND role LIKE 'CUSTOMER\\_%' LIMIT 1")
    UserRow findCustomerByPhone(@Param("phone") String phone);

    @Select("SELECT " + COLUMNS
            + " FROM users WHERE wechat_openid = #{openid} AND active = 1 LIMIT 1")
    UserRow findByWechatOpenid(@Param("openid") String openid);

    @Select("SELECT u.id, u.username, u.password_hash AS passwordHash, u.display_name AS displayName, "
            + "u.phone, u.wechat_openid AS wechatOpenid, u.role, u.customer_id AS customerId, u.active "
            + "FROM sessions s JOIN users u ON u.id = s.user_id "
            + "WHERE s.token = #{token} AND s.expires_at > #{now} AND u.active = 1 LIMIT 1")
    UserRow findByToken(@Param("token") String token, @Param("now") String now);

    @Select("SELECT COUNT(*) FROM users WHERE wechat_openid = #{openid} AND id <> #{userId}")
    int countWechatConflict(@Param("openid") String openid, @Param("userId") String userId);

    @Update("UPDATE users SET wechat_openid = #{openid}, phone = #{phone} WHERE id = #{userId}")
    int bindWechat(@Param("openid") String openid, @Param("phone") String phone, @Param("userId") String userId);

    @Update("UPDATE users SET password_hash = #{hash} WHERE id = #{id}")
    int updatePassword(@Param("id") String id, @Param("hash") String hash);
}
