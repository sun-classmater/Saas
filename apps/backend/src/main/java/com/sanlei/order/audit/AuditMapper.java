package com.sanlei.order.audit;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuditMapper {

    @Insert("INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at) "
            + "VALUES (#{id}, #{userId}, #{action}, #{entityType}, #{entityId}, #{details}, #{createdAt})")
    int insert(@Param("id") String id,
               @Param("userId") String userId,
               @Param("action") String action,
               @Param("entityType") String entityType,
               @Param("entityId") String entityId,
               @Param("details") String details,
               @Param("createdAt") String createdAt);
}
