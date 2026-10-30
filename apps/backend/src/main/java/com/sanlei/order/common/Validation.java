package com.sanlei.order.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** 与 Node 端 lib/core.js 的校验/格式化函数一一对应，错误码保持一致。 */
public final class Validation {

    private Validation() {
    }

    public static String cleanText(Object value, int maxLength) {
        String text = value == null ? "" : String.valueOf(value).trim();
        return text.length() > maxLength ? text.substring(0, maxLength) : text;
    }

    public static String requireText(Object value, String field) {
        return requireText(value, field, 200);
    }

    public static String requireText(Object value, String field, int maxLength) {
        String text = cleanText(value, maxLength);
        if (text.isEmpty()) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "不能为空");
        }
        return text;
    }

    public static double parsePositiveNumber(Object value, String field) {
        double number = parseDouble(value, field);
        if (!(number > 0)) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "必须大于0");
        }
        return number;
    }

    public static int parsePositiveInteger(Object value, String field) {
        Object raw = value;
        double number = parseDouble(raw, field);
        if (number != Math.floor(number) || number <= 0) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "必须为正整数");
        }
        return (int) number;
    }

    public static int nonNegativeInteger(Object value, String field) {
        double number = parseDouble(value, field);
        if (number != Math.floor(number) || number < 0) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "必须为非负整数");
        }
        return (int) number;
    }

    public static double nonNegativeNumber(Object value, String field) {
        double number = parseDouble(value, field);
        if (number < 0) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "必须为非负数");
        }
        return number;
    }

    public static double ratio(Object value) {
        double number = parseDouble(value, "预付款比例");
        if (!(number > 0) || number > 1) {
            throw new HttpException(400, "VALIDATION_ERROR", "预付款比例必须大于0且不超过1");
        }
        return Math.round(number * 10000d) / 10000d;
    }

    public static double money(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    public static double money(BigDecimal value) {
        return value == null ? 0d : value.setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    public static boolean asBoolean(Integer value) {
        return value != null && value != 0;
    }

    public static double parseDouble(Object value, String field) {
        if (value == null || "".equals(value)) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "格式不正确");
        }
        try {
            double number = Double.parseDouble(String.valueOf(value));
            if (Double.isNaN(number) || Double.isInfinite(number)) {
                throw new NumberFormatException("not finite");
            }
            return number;
        } catch (NumberFormatException error) {
            throw new HttpException(400, "VALIDATION_ERROR", field + "格式不正确");
        }
    }
}
