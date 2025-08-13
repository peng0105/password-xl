package com.passwordxl.controller;

import cn.hutool.http.HttpStatus;
import com.alibaba.fastjson2.JSONObject;
import com.passwordxl.bean.DeleteContentParam;
import com.passwordxl.bean.GetContentParam;
import com.passwordxl.bean.LoginParam;
import com.passwordxl.bean.PutContentParam;
import com.passwordxl.common.RestResult;
import com.passwordxl.service.PasswordXLService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@RestController
@RequiredArgsConstructor
public class PasswordXLController {

    private final PasswordXLService passwordXLService;

    /**
     * 登录
     *
     * @param loginParam 登录参数
     * @return token
     */
    @PostMapping("login")
    public RestResult<String> login(@RequestBody LoginParam loginParam) {
        return passwordXLService.login(loginParam);
    }

    /**
     * 上传
     *
     * @param putContentParam 上传参数
     * @return 结果
     */
    @PostMapping("put")
    public RestResult<JSONObject> put(@RequestBody PutContentParam putContentParam) {
        try {
            return passwordXLService.putContent(putContentParam);
        } catch (Exception e) {
            return RestResult.genErrorResult(HttpStatus.HTTP_INTERNAL_ERROR, e.getMessage());
        }
    }

    /**
     * 获取
     *
     * @param getContentParam 获取参数
     * @return 内容
     */
    @PostMapping("get")
    public RestResult<JSONObject> get(@RequestBody GetContentParam getContentParam) {
        try {
            return passwordXLService.getContent(getContentParam);
        } catch (Exception e) {
            return RestResult.genErrorResult(HttpStatus.HTTP_INTERNAL_ERROR, e.getMessage());
        }
    }

    /**
     * 删除
     *
     * @param deleteContentParam 删除参数
     * @return 结果
     */
    @PostMapping("delete")
    public RestResult<String> delete(@RequestBody DeleteContentParam deleteContentParam) {
        try {
            return passwordXLService.deleteContent(deleteContentParam);
        } catch (Exception e) {
            return RestResult.genErrorResult(HttpStatus.HTTP_INTERNAL_ERROR, e.getMessage());
        }
    }

    /**
     * 获取文件标记
     *
     * @param getContentParam 获取参数
     * @return 结果
     */
    @PostMapping("getEtag")
    public RestResult<JSONObject> getEtag(@RequestBody GetContentParam getContentParam) {
        try {
            return passwordXLService.getEtag(getContentParam);
        } catch (Exception e) {
            return RestResult.genErrorResult(HttpStatus.HTTP_INTERNAL_ERROR, e.getMessage());
        }
    }

    /**
     * 上传图片
     *
     */
    @PostMapping("uploadImage/{prefix}")
    public RestResult<JSONObject> uploadImage(@PathVariable("prefix") String prefix, MultipartFile file) {
        JSONObject result = passwordXLService.uploadImage(prefix, file);
        return RestResult.genSuccessResult(result);
    }

    /**
     * 下载图片
     *
     */
    @GetMapping("/image/**")
    public void image(HttpServletRequest request, HttpServletResponse response) {
        String requestURI = request.getRequestURI();
        String objectKey = requestURI.substring(requestURI.indexOf("/image/") + 7);
        passwordXLService.image(objectKey, response);
    }
}
