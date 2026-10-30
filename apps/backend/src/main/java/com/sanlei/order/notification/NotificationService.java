package com.sanlei.order.notification;

import com.sanlei.order.common.Ids;
import com.sanlei.order.common.Times;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 站内通知写入，等价 Node 端 lib/audit-sql.js 的 notifySql / notifyRolesSql。 */
@Service
public class NotificationService {

    private final JdbcTemplate jdbcTemplate;

    public NotificationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void notifyCustomer(String customerId, String title, String content) {
        if (customerId == null) {
            return;
        }
        List<String> userIds = jdbcTemplate.queryForList(
                "SELECT id FROM users WHERE customer_id = ? AND active = 1 AND role LIKE 'CUSTOMER\\_%'",
                String.class, customerId);
        insertAll(userIds, title, content);
    }

    public void notifyRoles(List<String> roles, String title, String content) {
        if (roles == null || roles.isEmpty()) {
            return;
        }
        String placeholders = String.join(", ", roles.stream().map(role -> "?").toList());
        List<String> userIds = jdbcTemplate.queryForList(
                "SELECT id FROM users WHERE active = 1 AND role IN (" + placeholders + ")",
                String.class, roles.toArray());
        insertAll(userIds, title, content);
    }

    private void insertAll(List<String> userIds, String title, String content) {
        String createdAt = Times.nowIso();
        for (String userId : userIds) {
            jdbcTemplate.update(
                    "INSERT INTO notifications (id, user_id, title, content, read_at, created_at) "
                            + "VALUES (?, ?, ?, ?, NULL, ?)",
                    Ids.next("notice"), userId, title, content, createdAt);
        }
    }
}
