package com.passwordxl;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
public class PasswordXlApplication {

    public static void main(String[] args) {
        SpringApplication.run(PasswordXlApplication.class, args);
    }

}
