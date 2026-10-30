package com.sanlei.order.config;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 读取项目根目录的 .env，并把 DATABASE_URL（mysql://user:pass@host:port/db）
 * 转成 Spring DataSource 需要的系统属性，避免两套配置漂移。
 */
public final class EnvLoader {

    private EnvLoader() {
    }

    public static void load() {
        Path envFile = locateEnvFile();
        if (envFile == null) {
            return;
        }
        Map<String, String> values = parse(envFile);
        values.forEach((key, value) -> {
            if (System.getProperty(key) == null && System.getenv(key) == null) {
                System.setProperty(key, value);
            }
        });
        String databaseUrl = values.get("DATABASE_URL");
        if (databaseUrl != null && databaseUrl.startsWith("mysql://")) {
            applyDatabaseUrl(databaseUrl);
        }
    }

    private static void applyDatabaseUrl(String databaseUrl) {
        String rest = databaseUrl.substring("mysql://".length());
        String authorityAndPath = rest;
        String query = "";
        int queryIndex = rest.indexOf('?');
        if (queryIndex >= 0) {
            authorityAndPath = rest.substring(0, queryIndex);
            query = rest.substring(queryIndex);
        }
        int at = authorityAndPath.lastIndexOf('@');
        if (at < 0) {
            return;
        }
        String credentials = authorityAndPath.substring(0, at);
        String hostAndDb = authorityAndPath.substring(at + 1);
        String username = "";
        String password = "";
        int colon = credentials.indexOf(':');
        if (colon >= 0) {
            username = credentials.substring(0, colon);
            password = credentials.substring(colon + 1);
        } else {
            username = credentials;
        }
        int slash = hostAndDb.indexOf('/');
        String hostPort = slash >= 0 ? hostAndDb.substring(0, slash) : hostAndDb;
        String database = slash >= 0 ? hostAndDb.substring(slash + 1) : "saas";

        String jdbcUrl = "jdbc:mysql://" + hostPort + "/" + database
                + (query.isEmpty() ? "?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false" : query);
        putIfAbsent("spring.datasource.url", jdbcUrl);
        putIfAbsent("spring.datasource.username", decode(username));
        putIfAbsent("spring.datasource.password", decode(password));
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (RuntimeException error) {
            return value;
        }
    }

    private static void putIfAbsent(String key, String value) {
        if (System.getProperty(key) == null && System.getenv(envName(key)) == null) {
            System.setProperty(key, value);
        }
    }

    private static String envName(String key) {
        return key.toUpperCase().replace('.', '_');
    }

    private static Path locateEnvFile() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        for (int depth = 0; depth < 4 && current != null; depth++) {
            Path candidate = current.resolve(".env");
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        return null;
    }

    private static Map<String, String> parse(Path file) {
        Map<String, String> values = new HashMap<>();
        try {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            for (String raw : lines) {
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int eq = line.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = line.substring(0, eq).trim();
                String value = line.substring(eq + 1).trim();
                if (value.length() >= 2 && (value.startsWith("\"") && value.endsWith("\"")
                        || value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length() - 1);
                }
                values.put(key, value);
            }
        } catch (IOException error) {
            System.err.println("[env] 读取 .env 失败: " + error.getMessage());
        }
        return values;
    }
}
