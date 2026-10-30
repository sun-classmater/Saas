package com.sanlei.order.auth;

import com.sanlei.order.common.HttpException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** 登录失败限流：同一 IP + 用户名 15 分钟内失败 8 次即 429（与 Node 端规则一致）。 */
@Component
public class LoginRateLimiter {

    private static final long WINDOW_MS = 15 * 60 * 1000L;
    private static final int MAX_FAILURES = 8;

    private record Record(int count, long resetAt) {
    }

    private final Map<String, Record> attempts = new ConcurrentHashMap<>();

    public String key(String ip, String username) {
        return ip + "|" + (username == null ? "" : username.trim().toLowerCase());
    }

    public void enforce(String key) {
        long now = System.currentTimeMillis();
        Record record = attempts.get(key);
        if (record == null || record.resetAt() < now) {
            attempts.put(key, new Record(0, now + WINDOW_MS));
            return;
        }
        if (record.count() >= MAX_FAILURES) {
            throw new HttpException(429, "LOGIN_RATE_LIMITED", "登录失败次数过多，请15分钟后再试");
        }
    }

    public void recordFailure(String key) {
        long now = System.currentTimeMillis();
        attempts.compute(key, (ignored, record) -> {
            Record current = record == null || record.resetAt() < now ? new Record(0, now + WINDOW_MS) : record;
            return new Record(current.count() + 1, current.resetAt());
        });
    }

    public void reset(String key) {
        attempts.remove(key);
    }
}
