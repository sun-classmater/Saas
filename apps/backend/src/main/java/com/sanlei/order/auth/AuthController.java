package com.sanlei.order.auth;

import com.sanlei.order.common.ApiResponse;
import com.sanlei.order.common.HttpException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService authService;
    private final UserMapper userMapper;
    private final LoginRateLimiter loginRateLimiter;
    private final com.sanlei.order.customer.CustomerService customerService;

    public AuthController(AuthService authService, UserMapper userMapper, LoginRateLimiter loginRateLimiter,
                          com.sanlei.order.customer.CustomerService customerService) {
        this.authService = authService;
        this.userMapper = userMapper;
        this.loginRateLimiter = loginRateLimiter;
        this.customerService = customerService;
    }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> body,
                                     HttpServletRequest request) {
        String username = text(body, "username");
        String password = text(body, "password");
        String key = loginRateLimiter.key(request.getRemoteAddr(), username);
        loginRateLimiter.enforce(key);
        UserRow user;
        try {
            user = authService.loginWithPassword(username, password);
        } catch (HttpException error) {
            loginRateLimiter.recordFailure(key);
            throw error;
        }
        loginRateLimiter.reset(key);
        String token = authService.createSession(user.getId());

        Map<String, Object> userView = new LinkedHashMap<>();
        userView.put("id", user.getId());
        userView.put("username", user.getUsername());
        userView.put("displayName", user.getDisplayName());
        userView.put("role", user.getRole());
        userView.put("customerId", user.getCustomerId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", token);
        data.put("user", userView);
        return ApiResponse.data(data);
    }

    @PostMapping("/auth/dev-login")
    public Map<String, Object> devLogin(@RequestBody(required = false) Map<String, Object> body) {
        if (!"mock".equals(wechatMode())) {
            throw new HttpException(403, "DEV_LOGIN_DISABLED", "正式模式不允许手机号快捷登录");
        }
        String phone = text(body, "phone").trim();
        UserRow user = userMapper.findCustomerByPhone(phone);
        if (user == null) {
            throw new HttpException(401, "CUSTOMER_NOT_FOUND", "该手机号尚未由后台开通客户账号");
        }
        String token = authService.createSession(user.getId());

        Map<String, Object> userView = new LinkedHashMap<>();
        userView.put("id", user.getId());
        userView.put("displayName", user.getDisplayName());
        userView.put("phone", user.getPhone());
        userView.put("role", user.getRole());
        userView.put("customerId", user.getCustomerId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", token);
        data.put("user", userView);
        data.put("mode", "mock");
        return ApiResponse.data(data);
    }

    @PostMapping("/auth/wechat-login")
    public Map<String, Object> wechatLogin(@RequestBody(required = false) Map<String, Object> body) {
        if ("mock".equals(wechatMode())) {
            throw new HttpException(400, "WECHAT_MOCK_MODE", "测试环境请使用手机号快捷登录");
        }
        if (text(body, "code").isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "微信登录凭证不能为空");
        }
        if (text(body, "phoneCode").isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", "微信手机号授权凭证不能为空");
        }
        throw new HttpException(501, "WECHAT_LOGIN_NOT_READY", "微信登录尚未接入 Spring Boot 后端");
    }

    @PostMapping("/auth/logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        authService.revokeSession(user.token());
        return ApiResponse.data(ApiResponse.map("ok", true));
    }

    @PostMapping("/auth/change-password")
    public Map<String, Object> changePassword(HttpServletRequest request,
                                              @RequestBody(required = false) Map<String, Object> body) {
        AuthUser user = AuthInterceptor.currentUser(request);
        if (user.isCustomer()) {
            throw new HttpException(403, "FORBIDDEN", "客户账号使用微信授权登录");
        }
        authService.changePassword(user, text(body, "currentPassword"), text(body, "newPassword"));
        return ApiResponse.data(ApiResponse.map("ok", true));
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Map<String, Object> userView = new LinkedHashMap<>();
        userView.put("id", user.id());
        userView.put("username", user.username());
        userView.put("displayName", user.displayName());
        userView.put("phone", user.phone());
        userView.put("wechatOpenid", user.wechatOpenid());
        userView.put("role", user.role());
        userView.put("customerId", user.customerId());
        userView.put("isCustomer", user.isCustomer());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("user", userView);
        if (user.isCustomer()) {
            data.put("customer", customerService.profile(user.customerId()));
        }
        return ApiResponse.data(data);
    }

    private String text(Map<String, Object> body, String key) {
        if (body == null) {
            return "";
        }
        Object value = body.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private String wechatMode() {
        String property = System.getProperty("WECHAT_MODE");
        if (property != null) {
            return property;
        }
        String env = System.getenv("WECHAT_MODE");
        return env == null || env.isBlank() ? "mock" : env;
    }
}
