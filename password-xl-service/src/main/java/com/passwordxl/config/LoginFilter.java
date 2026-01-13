package com.passwordxl.config;

import cn.hutool.http.HttpStatus;
import com.alibaba.fastjson2.JSONObject;
import com.passwordxl.bean.User;
import com.passwordxl.common.RestResult;
import com.passwordxl.service.DataService;
import com.passwordxl.util.JwtUtil;
import com.passwordxl.util.UserContent;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.io.PrintWriter;

@Component
public class LoginFilter extends OncePerRequestFilter {


    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {

        String method = request.getMethod();
        if("OPTIONS".equals(method)) {
            return true;
        }

        String uri = request.getRequestURI();

        return "/".equals(uri)
                || "/login".equals(uri)
                || "/service/health".equals(uri)
                || "/index.html".equals(uri)

                || uri.startsWith("/icons/")
                || uri.startsWith("/assets/")
                || uri.startsWith("/image/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain chain)
            throws ServletException, IOException {

        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
            if (JwtUtil.validateToken(token)) {
                String username = JwtUtil.getUsernameFromToken(token);
                User user = DataService.users.get(username);
                UserContent.setUser(user);
                chain.doFilter(request, response);
                UserContent.clearUser();
                return;
            }
        }

        // 未登录
        String content = JSONObject.toJSONString(RestResult.genErrorResult(HttpStatus.HTTP_UNAUTHORIZED, "未登录"));
        response.setStatus(HttpStatus.HTTP_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        PrintWriter writer = response.getWriter();
        writer.write(content);
        writer.flush();
    }
}