package com.passwordxl.common;

import lombok.Data;

/**
 * 统一响应
 *
 * @param <T>
 */
@Data
public class RestResult<T> {

    private Integer code;
    private String message;
    private T data;

    private RestResult() {
    }

    public static <T> RestResult<T> genSuccessResult() {
        return genSuccessResult(null);
    }

    public static <T> RestResult<T> genSuccessResult(T data) {
        RestResult<T> restResult = new RestResult<>();
        restResult.setCode(200);
        restResult.setData(data);
        return restResult;
    }

    public static <T> RestResult<T> genErrorResult(Integer code, String message) {
        RestResult<T> restResult = new RestResult<>();
        restResult.setCode(code);
        restResult.setMessage(message);
        return restResult;
    }
}
