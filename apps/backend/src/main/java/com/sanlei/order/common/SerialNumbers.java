package com.sanlei.order.common;

import java.security.SecureRandom;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/** 与 Node 端 serialNumber(prefix) 一致：PFX-YYMMDDHHmmss-1234（Asia/Shanghai）。 */
public final class SerialNumbers {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyMMddHHmmss");

    private SerialNumbers() {
    }

    public static String next(String prefix) {
        String stamp = FORMAT.format(ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai")));
        return prefix + "-" + stamp + "-" + (1000 + RANDOM.nextInt(9000));
    }
}
