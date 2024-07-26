package com.passwordxl.util;

import cn.hutool.jwt.JWT;
import cn.hutool.jwt.JWTPayload;
import cn.hutool.jwt.JWTUtil;
import lombok.extern.slf4j.Slf4j;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Slf4j
public class JwtUtil {

    private static final String SECRET_KEY = "password-xl";

    /**
     * 生成jwt
     */
    public static String generateToken(String username) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("username", username);
        payload.put(JWTPayload.ISSUED_AT, new Date());
        return JWTUtil.createToken(payload, SECRET_KEY.getBytes());
    }

    /**
     * 验证jwt
     */
    public static boolean validateToken(String token) {
        try {
            JWT jwt = JWTUtil.parseToken(token);
            return jwt.setKey(SECRET_KEY.getBytes()).verify();
        } catch (Exception e) {
            log.error("Token validation error: ", e);
            return false;
        }
    }

    /**
     * 获取参数
     */
    public static String getUsernameFromToken(String token) {
        JWT jwt = JWTUtil.parseToken(token);
        return jwt.getPayload("username").toString();
    }
}
