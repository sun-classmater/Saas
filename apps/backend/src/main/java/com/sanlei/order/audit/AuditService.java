package com.sanlei.order.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import org.springframework.stereotype.Service;

/** 审计写入，与 Node 端 services/audit.js 等价。 */
@Service
public class AuditService {

    private final AuditMapper auditMapper;
    private final ObjectMapper objectMapper;

    public AuditService(AuditMapper auditMapper, ObjectMapper objectMapper) {
        this.auditMapper = auditMapper;
        this.objectMapper = objectMapper;
    }

    public void record(AuthUser user, String action, String entityType, String entityId, Object details) {
        String payload = null;
        if (details != null) {
            try {
                payload = objectMapper.writeValueAsString(details);
            } catch (JsonProcessingException error) {
                payload = String.valueOf(details);
            }
        }
        auditMapper.insert(
                Ids.next("audit"),
                user == null ? null : user.id(),
                action,
                entityType,
                entityId,
                payload,
                Times.nowIso()
        );
    }
}
