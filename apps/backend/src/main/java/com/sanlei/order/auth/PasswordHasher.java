package com.sanlei.order.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.bouncycastle.crypto.generators.SCrypt;

/**
 * 与 Node 端 lib/core.js 的 hashPassword / verifyPassword 完全兼容。
 *
 * 注意：Node 端 scryptSync(password, salt, 64) 传入的 salt 是「随机字节的十六进制字符串」，
 * 而不是解码后的字节，因此这里必须用 hex 字符串的 ASCII 字节做盐。
 * 存储格式：saltHex:hashHex
 */
public final class PasswordHasher {

    private static final int N = 16384;
    private static final int R = 8;
    private static final int P = 1;
    private static final int KEY_LENGTH = 64;
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordHasher() {
    }

    public static String hash(String password) {
        byte[] saltBytes = new byte[16];
        RANDOM.nextBytes(saltBytes);
        String saltText = HexFormat.of().formatHex(saltBytes);
        byte[] derived = derive(password, saltText);
        return saltText + ":" + HexFormat.of().formatHex(derived);
    }

    public static boolean verify(String password, String stored) {
        if (stored == null) {
            return false;
        }
        int separator = stored.indexOf(':');
        if (separator <= 0 || separator == stored.length() - 1) {
            return false;
        }
        String saltText = stored.substring(0, separator);
        byte[] expected;
        try {
            expected = HexFormat.of().parseHex(stored.substring(separator + 1));
        } catch (IllegalArgumentException error) {
            return false;
        }
        byte[] actual = derive(String.valueOf(password), saltText);
        return expected.length == actual.length && MessageDigest.isEqual(expected, actual);
    }

    private static byte[] derive(String password, String saltText) {
        return SCrypt.generate(
                String.valueOf(password).getBytes(StandardCharsets.UTF_8),
                saltText.getBytes(StandardCharsets.US_ASCII),
                N, R, P, KEY_LENGTH);
    }
}
