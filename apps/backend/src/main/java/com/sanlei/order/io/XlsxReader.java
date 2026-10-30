package com.sanlei.order.io;

import com.sanlei.order.common.HttpException;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;

/** 读取 Excel 为「表头 → 文本值」的行，语义与 Node 端 readWorkbookRows 一致。 */
@Component
public class XlsxReader {

    private static final DataFormatter FORMATTER = new DataFormatter();

    public List<Map<String, String>> read(byte[] content) {
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(content))) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) {
                return List.of();
            }
            List<String> headers = new ArrayList<>();
            int headerRowIndex = sheet.getFirstRowNum();
            Row headerRow = sheet.getRow(headerRowIndex);
            if (headerRow == null) {
                return List.of();
            }
            for (int index = 0; index < headerRow.getLastCellNum(); index++) {
                headers.add(cellText(headerRow.getCell(index)).trim());
            }
            List<Map<String, String>> rows = new ArrayList<>();
            for (int rowIndex = headerRowIndex + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    continue;
                }
                Map<String, String> mapped = new LinkedHashMap<>();
                boolean hasValue = false;
                for (int index = 0; index < headers.size(); index++) {
                    String text = cellText(row.getCell(index));
                    if (!text.isEmpty()) {
                        hasValue = true;
                    }
                    mapped.put(headers.get(index), text);
                }
                if (hasValue) {
                    rows.add(mapped);
                }
            }
            return rows;
        } catch (Exception error) {
            throw new HttpException(400, "INVALID_XLSX", "无法读取Excel文件：" + error.getMessage());
        }
    }

    private String cellText(Cell cell) {
        if (cell == null) {
            return "";
        }
        if (cell.getCellType() == CellType.NUMERIC) {
            double value = cell.getNumericCellValue();
            if (value == Math.rint(value)) {
                return String.valueOf((long) value);
            }
            return String.valueOf(value);
        }
        return FORMATTER.formatCellValue(cell);
    }
}
