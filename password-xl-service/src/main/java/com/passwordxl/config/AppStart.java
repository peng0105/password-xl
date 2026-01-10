package com.passwordxl.config;

import cn.hutool.core.util.StrUtil;
import com.moandjiezana.toml.Toml;
import com.passwordxl.bean.User;
import com.passwordxl.service.DataService;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.FileWriter;
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

    private final static String[] configPaths = {"password-xl.toml", "/data/password-xl.toml", "/password-xl.toml", "/password-xl-service/password-xl.toml"};

    @Override
    public void run(ApplicationArguments args) {

        log.info("\n\n========================================\n\n");
        log.info("欢迎使用password-xl，项目开源地址：{}", openSource);

        // 从环境变量读取 DATA_DIR
        String dataDir = System.getenv("DATA_DIR");
        if (StrUtil.isBlank(dataDir)) {
            DataService.workPath = dataDir;
            if (DataService.workPath.endsWith("/")) {
                DataService.workPath = DataService.workPath.substring(0, DataService.workPath.length() - 1);
            }
        }

        String[] nonOptionArgs = args.getSourceArgs();
        for (String arg : nonOptionArgs) {
            String[] configParams = arg.split("=");
            if (configParams[0].equals("--work-path") && configParams.length > 1) {
                DataService.workPath = configParams[1];
                if (DataService.workPath.endsWith("/")) {
                    DataService.workPath = DataService.workPath.substring(0, DataService.workPath.length() - 1);
                }
            }
        }

        String configPath = DataService.workPath + "/password-xl.toml";
        File configFile = new File(configPath);
        if (!configFile.exists()) {
            for (String path : configPaths) {
                configFile = new File(path);
                if (configFile.exists()) {
                    log.info("开始读取用户配置文件: {}", path);
                    break;
                }
            }
        } else {
            log.info("读取用户配置文件: {}", configPath);
        }

        if (!configFile.exists()) {
            configFile = genDefConfig(configPath);
        }

        log.info("数据存储目录: {}", DataService.workPath);
        Toml toml = new Toml().read(configFile);
        List<Map<String, Object>> maps = toml.getList("user");
        if (maps == null || maps.isEmpty()) {
            throw new RuntimeException("未配置用户. 请参考官方部署说明文档：" + deployDoc);
        }
        List<User> users = maps.stream().map(this::mapToUser).toList();

        log.info("配置用户数: {}", users.size());
        Map<String, User> userMap = users.stream().collect(Collectors.toMap(User::getUsername, user -> user));
        DataService.users.putAll(userMap);
        log.info("服务启动成功!!!");
    }

    /**
     * 生成默认配置文件
     * @param configPath 配置文件路径
     * @return 配置文件对象
     */
    private static @NonNull File genDefConfig(String configPath) {
        File configFile;
        configFile = new File(configPath);
        log.info("未找到配置文件，生成默认配置: {}", configPath);

        // 生成随机密码：16位字母加数字组合
        String randomPassword = cn.hutool.core.util.RandomUtil.randomString("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 16);

        // 创建 TOML 内容
        StringBuilder tomlContent = new StringBuilder();
        tomlContent.append("[[user]]\n");
        tomlContent.append("username = \"password-xl\"\n");
        tomlContent.append("password = \"").append(randomPassword).append("\"\n");

        // 写入配置文件
        try {
            // 创建父目录
            File parentDir = configFile.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                if (!parentDir.mkdirs()) {
                    log.error("创建配置文件目录失败: {}", parentDir.getAbsolutePath());
                    throw new RuntimeException("创建配置文件目录失败: " + parentDir.getAbsolutePath());
                }
            }
            
            FileWriter writer = new FileWriter(configFile);
            writer.write(tomlContent.toString());
            writer.close();

            log.info("用户名: password-xl");
            log.info("密码: {}", randomPassword);
            log.info("\n\n请修改默认密码以确保安全。使用容器部署时，请将 /password-xl-service 目录挂载到宿主机，否则删除容器将导致密码数据丢失。\n");
            log.info("配置文件路径: {}", configPath);
        } catch (Exception e) {
            log.error("生成配置文件失败: {}", e.getMessage());
            throw new RuntimeException("生成配置文件失败: " + e.getMessage());
        }
        return configFile;
    }

    private User mapToUser(Map<String, Object> map) {
        User user = new User();
        user.setUsername((String) map.get("username"));
        user.setPassword((String) map.get("password"));
        return user;
    }
}
