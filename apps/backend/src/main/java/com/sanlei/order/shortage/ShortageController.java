package com.sanlei.order.shortage;

import com.sanlei.order.auth.AuthInterceptor;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class ShortageController {

    private final ShortageService shortageService;

    public ShortageController(ShortageService shortageService) {
        this.shortageService = shortageService;
    }

    @GetMapping("/shortages")
    public Map<String, Object> list(HttpServletRequest request) {
        return ApiResponse.data(shortageService.list(AuthInterceptor.currentUser(request)));
    }

    @GetMapping("/shortages/{id}/preview")
    public Map<String, Object> preview(@PathVariable String id, HttpServletRequest request) {
        return ApiResponse.data(shortageService.preview(AuthInterceptor.currentUser(request), id));
    }

    @PostMapping("/shortages/{id}/apply")
    public Map<String, Object> apply(@PathVariable String id,
                                     @RequestBody(required = false) Map<String, Object> body,
                                     HttpServletRequest request) {
        AuthUser user = AuthInterceptor.currentUser(request);
        Object targets = body == null ? null : body.get("targets");
        return ApiResponse.data(shortageService.apply(user, id, targets));
    }
}
