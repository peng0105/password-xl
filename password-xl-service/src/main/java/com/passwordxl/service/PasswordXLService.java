package com.passwordxl.service;

import cn.hutool.core.io.FileUtil;
import cn.hutool.http.HttpStatus;
import com.alibaba.fastjson2.JSONObject;
import com.passwordxl.bean.*;
import com.passwordxl.common.RestResult;
import com.passwordxl.util.JwtUtil;
import com.passwordxl.util.UserContent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordXLService {

    /**
     * 登录
     *
     * @param loginParam 登录信息
     * @return token
     */
    public RestResult<String> login(LoginParam loginParam) {
        String username = loginParam.getUsername();
        log.info("user login request: {}", username);
        User user = DataService.users.get(username);
        if (user == null) {
            log.info("username not exist: {}", loginParam.getUsername());
            return RestResult.genErrorResult(HttpStatus.HTTP_UNAUTHORIZED, "用户名或密码错误");
        }

        if (!Objects.equals(user.getPassword(), loginParam.getPassword())) {
            log.info("username or password incorrect: {}", loginParam.getUsername());
            return RestResult.genErrorResult(HttpStatus.HTTP_UNAUTHORIZED, "用户名或密码错误");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            log.info("user was disabled: {}", loginParam.getUsername());
            return RestResult.genErrorResult(HttpStatus.HTTP_UNAUTHORIZED, "该用户已被禁用");
        }

        String token = JwtUtil.generateToken(username);
        log.info("user login succeed: {}", loginParam.getUsername());
        return RestResult.genSuccessResult(token);
    }

    /**
     * 上传内容
     *
     * @param putContentParam 内容
     * @return 上传结果
     */
    public RestResult<JSONObject> putContent(PutContentParam putContentParam) {
        String username = UserContent.getUser().getUsername();
        String contentName = putContentParam.getKey();
        String content = putContentParam.getContent();
        log.info("put username: {} key: {} size: {}", username, contentName, content.length());
        File file = new File(DataService.dataPath + "/" + username + "/" + contentName);
        FileUtil.writeUtf8String(content, file);
        log.info("put succeed username: {} key: {}", username, contentName);
        JSONObject result = new JSONObject();
        result.put("etag", file.lastModified());
        return RestResult.genSuccessResult(result);
    }

    /**
     * 获取内容
     *
     * @param getContentParam 要获取的文件信息
     * @return 内容
     */
    public RestResult<JSONObject> getContent(GetContentParam getContentParam) {
        String username = UserContent.getUser().getUsername();
        String contentName = getContentParam.getKey();
        log.info("get username: {} key: {}", username, contentName);
        File file = new File(DataService.dataPath + "/" + username + "/" + contentName);
        if (!file.exists()) {
            log.info("get not found username: {} key: {}", username, contentName);
            return RestResult.genErrorResult(HttpStatus.HTTP_NOT_FOUND, "内容不存在");
        }
        String content = FileUtil.readUtf8String(file);
        log.info("get succeed username: {} key: {} size: {}", username, contentName, content.length());

        JSONObject result = new JSONObject();
        result.put("etag", file.lastModified());
        result.put("content", content);
        return RestResult.genSuccessResult(result);
    }

    /**
     * 删除内容
     *
     * @param deleteContentParam 要删除的文件信息
     * @return 结果
     */
    public RestResult<String> deleteContent(DeleteContentParam deleteContentParam) {
        String username = UserContent.getUser().getUsername();
        String contentName = deleteContentParam.getKey();
        log.info("delete username: {} key: {}", username, contentName);
        File file = new File(DataService.dataPath + "/" + username + "/" + contentName);
        if (!file.exists()) {
            log.info("delete file not exist username: {} key: {}", username, contentName);
            return RestResult.genSuccessResult();
        }
        boolean delete = file.delete();
        if (!delete) {
            return RestResult.genErrorResult(HttpStatus.HTTP_INTERNAL_ERROR, "删除失败");
        }
        File fileDir = new File(DataService.dataPath + "/" + username);
        File[] files = fileDir.listFiles();
        if (files != null && files.length == 0) {
            boolean deleteResult = fileDir.delete();
            if (!deleteResult) {
                log.warn("delete file succeed, but delete folder fail: {}", fileDir.getName());
            }
        }
        return RestResult.genSuccessResult();
    }

    /**
     * 获取文件标记
     *
     * @param getContentParam 获取参数
     * @return 结果
     */
    public RestResult<JSONObject> getEtag(GetContentParam getContentParam) {
        String username = UserContent.getUser().getUsername();
        String contentName = getContentParam.getKey();
        log.info("getEtag username: {} key: {}", username, contentName);
        File file = new File(DataService.dataPath + "/" + username + "/" + contentName);
        if (!file.exists()) {
            return RestResult.genSuccessResult();
        }

        JSONObject result = new JSONObject();
        result.put("etag", file.lastModified());
        return RestResult.genSuccessResult(result);
    }
}
