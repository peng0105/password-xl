package com.passwordxl.service;

import com.passwordxl.bean.User;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class DataService {
    // 用户列表 username -> user
    public final static Map<String, User> users = new ConcurrentHashMap<>();
}
