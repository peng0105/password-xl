package com.passwordxl.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 将前端 history 路由交给 Vue Router 处理。
 */
@Controller
public class SpaController {

    @GetMapping({
            "/login",
            "/login/oss",
            "/login/cos",
            "/login/private",
            "/login/local",
            "/note"
    })
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
