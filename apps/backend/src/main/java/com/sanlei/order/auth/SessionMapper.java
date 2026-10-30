package com.sanlei.order.auth;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SessionMapper {

    @Insert("INSERT INTO sessions (token, user_id, expires_at, created_at) "
            + "VALUES (#{token}, #{userId}, #{expiresAt}, #{createdAt})")
    int insert(@Param("token") String token,
               @Param("userId") String userId,
               @Param("expiresAt") String expiresAt,
               @Param("createdAt") String createdAt);

    @Delete("DELETE FROM sessions WHERE token = #{token}")
    int deleteByToken(@Param("token") String token);

    @Delete("DELETE FROM sessions WHERE user_id = #{userId} AND token <> #{token}")
    int deleteOthers(@Param("userId") String userId, @Param("token") String token);

    @Delete("DELETE FROM sessions WHERE expires_at < #{now}")
    int deleteExpired(@Param("now") String now);
}
