package com.sanlei.order.common;

import java.util.UUID;

/** 与 Node 端 id(prefix) 一致：prefix_uuid。 */
public final class Ids {

    private Ids() {
    }

    public static String next(String prefix) {
        return prefix + "_" + UUID.randomUUID();
    }
}
