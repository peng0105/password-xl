package com.passwordxl.config;

import cn.hutool.core.thread.ThreadUtil;
import com.moandjiezana.toml.Toml;
import com.passwordxl.bean.User;
import com.passwordxl.service.DataService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AppStart implements ApplicationRunner {

    @Value("${doc.deploy}")
    private String deployDoc;
    @Value("${doc.openSource}")
    private String openSource;

    private final static String[] configPaths = {"password-xl.toml", "/data/password-xl.toml", "/password-xl.toml"};

    @Override
    public void run(ApplicationArguments args) {

        log.info("欢迎使用password-xl，项目开源地址：{}", openSource);

        String configPath = null;

        List<String> nonOptionArgs = args.getNonOptionArgs();
        for (String arg : nonOptionArgs) {
            String[] configParams = arg.split("=");
            if (configParams[0].equals("config") && configParams.length > 1 && configParams[1].endsWith(".toml")) {
                configPath = configParams[1];
                break;
            }
        }

        if (configPath == null) {
            for (String path : configPaths) {
                File file = new File(path);
                if (file.exists()) {
                    configPath = file.getPath();
                    break;
                }
            }
        }

        if (configPath == null) {
            throw new RuntimeException("配置文件不存在. 请参考官方部署说明文档：" + deployDoc);
        }

        File configFile = new File(configPath);
        if (!configFile.exists()) {
            throw new RuntimeException("配置文件不存在. 请参考官方部署说明文档：" + deployDoc);
        }

        log.info("开始读取用户配置文件: {}", configPath);
        Toml toml = new Toml().read(configFile);
        List<Map<String, Object>> maps = toml.getList("user");
        if (maps == null || maps.isEmpty()) {
            throw new RuntimeException("未配置用户. 请参考官方部署说明文档：" + deployDoc);
        }
        List<User> users = maps.stream().map(this::mapToUser).toList();

        log.info("配置用户数: {}", users.size());
        Map<String, User> userMap = users.stream().collect(Collectors.toMap(User::getUsername, user -> user));
        DataService.users.putAll(userMap);
        log.info("服务启动成功!!! ");
    }

    private User mapToUser(Map<String, Object> map) {
        User user = new User();
        user.setUsername((String) map.get("username"));
        user.setPassword((String) map.get("password"));
        return user;
    }
}
