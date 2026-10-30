package com.sanlei.order.auth;

import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Times;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final int SESSION_TTL_HOURS = 24 * 14;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserMapper userMapper;
    private final SessionMapper sessionMapper;

    public AuthService(UserMapper userMapper, SessionMapper sessionMapper) {
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
    }

    public String createSession(String userId) {
        String token = randomToken();
        String createdAt = Times.nowIso();
        String expiresAt = Times.plusHoursIso(SESSION_TTL_HOURS);
        sessionMapper.deleteExpired(createdAt);
        sessionMapper.insert(token, userId, expiresAt, createdAt);
        return token;
    }

    public UserRow loginWithPassword(String username, String password) {
        UserRow user = userMapper.findByUsername(username == null ? "" : username.trim());
        if (user == null || user.getPasswordHash() == null || !PasswordHasher.verify(password, user.getPasswordHash())) {
            throw new HttpException(401, "INVALID_CREDENTIALS", "用户名或密码错误");
        }
        return user;
    }

    public AuthUser userFromToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        UserRow row = userMapper.findByToken(token, Times.nowIso());
        return row == null ? null : toAuthUser(row, token);
    }

    public void revokeSession(String token) {
        if (token != null && !token.isBlank()) {
            sessionMapper.deleteByToken(token);
        }
    }

    @Transactional
    public void changePassword(AuthUser user, String currentPassword, String newPassword) {
        UserRow row = userMapper.findById(user.id());
        if (row == null || !PasswordHasher.verify(currentPassword, row.getPasswordHash())) {
            throw new HttpException(400, "CURRENT_PASSWORD_INVALID", "当前密码不正确");
        }
        String password = newPassword == null ? "" : newPassword;
        if (password.length() < 8) {
            throw new HttpException(400, "WEAK_PASSWORD", "新密码至少8位");
        }
        userMapper.updatePassword(user.id(), PasswordHasher.hash(password));
        sessionMapper.deleteOthers(user.id(), user.token());
    }

    public static AuthUser toAuthUser(UserRow row, String token) {
        return new AuthUser(
                row.getId(),
                row.getUsername(),
                row.getDisplayName(),
                row.getPhone(),
                row.getWechatOpenid(),
                row.getRole(),
                row.getCustomerId(),
                token
        );
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
