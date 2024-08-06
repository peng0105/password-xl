package com.passwordxl.bean;

import lombok.Data;

/**
 * 用户
 */
@Data
public class User {
    // 用户名
    private String username;
    // 登录token
    private String password;
    // 用户状态 1.启用 0.禁用
    private Integer status;
}
