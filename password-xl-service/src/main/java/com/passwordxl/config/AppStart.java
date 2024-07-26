package com.passwordxl.config;

import com.moandjiezana.toml.Toml;
import com.passwordxl.bean.User;
import com.passwordxl.service.DataService;
import lombok.extern.slf4j.Slf4j;
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
    private final static String[] configPaths = {"password-xl.toml", "/data/password-xl.toml", "/password-xl.toml"};

    @Override
    public void run(ApplicationArguments args) throws Exception {

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
            throw new RuntimeException("config file does not exist. Please check the official configuration description");
        }


        File configFile = new File(configPath);
        if (!configFile.exists()) {
            throw new RuntimeException("config file does not exist. Please check the official configuration description");
        }

        log.info("start read config file: {}", configPath);
        Toml toml = new Toml().read(configFile);
        List<Map<String, Object>> maps = toml.getList("user");
        if (maps == null || maps.isEmpty()) {
            throw new RuntimeException("config file is empty, please check the official configuration description");
        }
        List<User> users = maps.stream().map(this::mapToUser).toList();

        log.info("config user count: {}", users.size());
        Map<String, User> userMap = users.stream().collect(Collectors.toMap(User::getUsername, user -> user));
        DataService.users.putAll(userMap);
        log.info("service started!!!");
    }

    private User mapToUser(Map<String, Object> map) {
        User user = new User();
        user.setUsername((String) map.get("username"));
        user.setPassword((String) map.get("password"));
        return user;
    }
}
