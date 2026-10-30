package com.sanlei.order.io;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 与 Node 端 lib/csv.js 的 parseCsv 语义一致：去 BOM、双引号转义、\r 清理、跳过全空行、首行表头。 */
public final class CsvCodec {

    private CsvCodec() {
    }

    public static List<Map<String, String>> parse(String text) {
        String source = text == null ? "" : text;
        if (!source.isEmpty() && source.charAt(0) == '\uFEFF') {
            source = source.substring(1);
        }
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        for (int index = 0; index < source.length(); index++) {
            char ch = source.charAt(index);
            if (inQuotes) {
                if (ch == '"' && index + 1 < source.length() && source.charAt(index + 1) == '"') {
                    field.append('"');
                    index++;
                } else if (ch == '"') {
                    inQuotes = false;
                } else {
                    field.append(ch);
                }
            } else if (ch == '"') {
                inQuotes = true;
            } else if (ch == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (ch == '\n') {
                row.add(stripCr(field.toString()));
                field.setLength(0);
                if (row.stream().anyMatch(value -> !value.isEmpty())) {
                    rows.add(new ArrayList<>(row));
                }
                row.clear();
            } else {
                field.append(ch);
            }
        }
        row.add(stripCr(field.toString()));
        if (row.stream().anyMatch(value -> !value.isEmpty())) {
            rows.add(new ArrayList<>(row));
        }
        if (rows.isEmpty()) {
            return List.of();
        }
        List<String> headers = rows.remove(0).stream().map(String::trim).toList();
        List<Map<String, String>> result = new ArrayList<>();
        for (List<String> values : rows) {
            Map<String, String> mapped = new LinkedHashMap<>();
            for (int index = 0; index < headers.size(); index++) {
                mapped.put(headers.get(index), index < values.size() ? values.get(index) : "");
            }
            result.add(mapped);
        }
        return result;
    }

    private static String stripCr(String value) {
        return value.endsWith("\r") ? value.substring(0, value.length() - 1) : value;
    }
}
