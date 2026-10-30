package com.sanlei.order.auth;

import com.sanlei.order.common.HttpException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** 解析 Bearer Token 并挂到 request 上；同时实现 /api/admin 与 /api/mobile 的角色隔离。 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String ATTRIBUTE = "authUser";

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
        AuthUser user = authService.userFromToken(token);
        if (user == null) {
            throw new HttpException(401, "UNAUTHORIZED", "请先登录或登录已失效");
        }
        request.setAttribute(ATTRIBUTE, user);

        String uri = request.getRequestURI();
        if (uri.startsWith("/api/admin") && user.isCustomer()) {
            throw new HttpException(404, "NOT_FOUND", "接口不存在");
        }
        if (uri.startsWith("/api/mobile") && !user.isCustomer()) {
            throw new HttpException(404, "NOT_FOUND", "接口不存在");
        }
        return true;
    }

    public static AuthUser currentUser(HttpServletRequest request) {
        Object user = request.getAttribute(ATTRIBUTE);
        if (user instanceof AuthUser authUser) {
            return authUser;
        }
        throw new HttpException(401, "UNAUTHORIZED", "请先登录或登录已失效");
    }
}
