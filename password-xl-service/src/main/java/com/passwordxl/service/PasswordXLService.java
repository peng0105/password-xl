package com.passwordxl.service;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpStatus;
import com.alibaba.fastjson2.JSONObject;
import com.passwordxl.bean.*;
import com.passwordxl.common.RestResult;
import com.passwordxl.util.JwtUtil;
import com.passwordxl.util.UserContent;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordXLService {

    private static final Map<String, String> MIME_MAP = new HashMap<>();
    static {
        MIME_MAP.put("jpg",  "image/jpeg");
        MIME_MAP.put("jpeg", "image/jpeg");
        MIME_MAP.put("png",  "image/png");
        MIME_MAP.put("gif",  "image/gif");
        MIME_MAP.put("webp", "image/webp");
        MIME_MAP.put("svg",  "image/svg+xml");
        MIME_MAP.put("heif", "image/heif");
        MIME_MAP.put("heic", "image/heic");
        MIME_MAP.put("ico",  "image/x-icon");
    }

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
        File file = new File(DataService.workPath + "/password-xl-data/" + username + "/" + contentName);
        if (!file.getParentFile().exists()) {
            FileUtil.mkdir(file.getParentFile());
        }
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
        File file = new File(DataService.workPath + "/password-xl-data/" + username + "/" + contentName);
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
        File file = new File(DataService.workPath + "/password-xl-data/" + username + "/" + contentName);
        if (!file.exists()) {
            log.info("delete file not exist username: {} key: {}", username, contentName);
            return RestResult.genSuccessResult();
        }
        boolean delete = file.delete();
        if (!delete) {
            return RestResult.genErrorResult(HttpStatus.HTTP_INTERNAL_ERROR, "删除失败");
        }
        File fileDir = new File(DataService.workPath + "/password-xl-data/" + username);
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
        File file = new File(DataService.workPath + "/password-xl-data/" + username + "/" + contentName);
        if (!file.exists()) {
            return RestResult.genSuccessResult();
        }

        JSONObject result = new JSONObject();
        result.put("etag", file.lastModified());
        return RestResult.genSuccessResult(result);
    }

    public JSONObject uploadImage(String prefix, MultipartFile file) {
        if (!prefix.matches("^[A-Za-z0-9]+$")) {
            throw new RuntimeException("路径错误");
        }
        String fileName = file.getOriginalFilename();
        if (StrUtil.isBlank(fileName)) {
            throw new RuntimeException("文件名错误");
        }

        String extName = FileUtil.extName(fileName.trim());
        if (StrUtil.isBlank(extName) || !MIME_MAP.containsKey(extName.toLowerCase())) {
            throw new RuntimeException("文件格式错误");
        }

        String username = UserContent.getUser().getUsername();
        Path safeBase = Paths.get(DataService.workPath, "password-xl-data", username, "images", prefix);
        Path target = safeBase.resolve(IdUtil.fastSimpleUUID().substring(0, 16) + "." + extName).normalize();
        if (!target.startsWith(safeBase)) {
            throw new RuntimeException("非法路径");
        }

        File dest = target.toFile();
        if (!dest.getParentFile().exists()) {
            FileUtil.mkdir(dest.getParentFile());
        }
        try {
            file.transferTo(dest);
        } catch (IOException e) {
            log.error("upload image error", e);
            throw new RuntimeException("上传失败");
        }
        String name = "/" + UserContent.getUser().getUsername() + "/images/" + prefix + "/" + dest.getName();
        JSONObject result = new JSONObject();
        result.put("objectKey", name);
        return result;
    }

    public void image(String objectKey, HttpServletResponse response) {
        Path safeBase = Paths.get(DataService.workPath, "password-xl-data");
        Path target = safeBase.resolve(objectKey).normalize();
        if (!target.startsWith(safeBase)) {
            throw new RuntimeException("非法路径");
        }
        File file = target.toFile();
        if (!file.exists()) {
            throw new RuntimeException("文件不存在");
        }

        String extName = FileUtil.extName(file.getName());

        // 设置通用图片类型
        String contentType = MIME_MAP.get(extName.toLowerCase());
        if (StrUtil.isBlank(contentType)) {
            contentType = "image/" + extName;
        }
        response.setContentType(contentType);

        try (FileInputStream fis = new FileInputStream(file)) {
            IoUtil.copy(fis, response.getOutputStream());
            response.flushBuffer();
        } catch (IOException e) {
            log.error("download file error", e);
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        }
    }
}
