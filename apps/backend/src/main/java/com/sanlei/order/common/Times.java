package com.sanlei.order.common;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;

/** 与 Node 端 nowIso()/settlementWeek() 一致：毫秒精度 UTC；结算周为上海时区当周周一。 */
public final class Times {

    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    private Times() {
    }

    public static String nowIso() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }

    public static String plusHoursIso(long hours) {
        return Instant.now().plus(hours, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS).toString();
    }

    public static String settlementWeek() {
        LocalDate monday = LocalDate.now(SHANGHAI).with(TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
        return monday.toString();
    }
}
