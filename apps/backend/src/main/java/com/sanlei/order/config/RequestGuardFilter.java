package com.sanlei.order.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 与 Node 后端对齐的两个行为：
 * 1) OPTIONS 预检统一返回 204 + CORS 头；
 * 2) 含编码斜杠或 .. 的路径直接 404（目录穿越防护）。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestGuardFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();
        String lower = uri.toLowerCase();
        if (lower.contains("%2f") || lower.contains("..")) {
            response.setStatus(404);
            response.setContentType("application/json; charset=utf-8");
            response.getWriter().write("{\"error\":{\"code\":\"NOT_FOUND\",\"message\":\"接口不存在\",\"details\":null}}");
            return;
        }
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            response.setHeader("Access-Control-Max-Age", "3600");
            response.setStatus(204);
            return;
        }
        chain.doFilter(request, response);
    }

    @SuppressWarnings("unused")
    private byte[] json(String code, String message) {
        return ("{\"error\":{\"code\":\"" + code + "\",\"message\":\"" + message + "\",\"details\":null}}")
                .getBytes(StandardCharsets.UTF_8);
    }
}
