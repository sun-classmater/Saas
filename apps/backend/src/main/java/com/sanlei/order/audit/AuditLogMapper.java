package com.sanlei.order.audit;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AuditLogMapper {

    @Select("SELECT a.id, COALESCE(u.display_name, '系统') AS userName, a.action, "
            + "a.entity_type AS entityType, a.entity_id AS entityId, a.details, a.created_at AS createdAt "
            + "FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id "
            + "ORDER BY a.created_at DESC LIMIT 500")
    List<AuditLogRow> recent();
}
