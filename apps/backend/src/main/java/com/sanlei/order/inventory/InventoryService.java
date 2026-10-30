package com.sanlei.order.inventory;

import com.sanlei.order.audit.AuditService;
import com.sanlei.order.auth.AuthUser;
import com.sanlei.order.common.HttpException;
import com.sanlei.order.common.Ids;
import com.sanlei.order.common.SerialNumbers;
import com.sanlei.order.common.Times;
import com.sanlei.order.common.Validation;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 库存：查询、移库、手工调整与流水。 */
@Service
public class InventoryService {

    private final InventoryMapper inventoryMapper;
    private final AuditService auditService;

    public InventoryService(InventoryMapper inventoryMapper, AuditService auditService) {
        this.inventoryMapper = inventoryMapper;
        this.auditService = auditService;
    }

    private Map<String, Object> map(InventoryItemRow row) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("productId", row.getProductId());
        view.put("sku", row.getSku());
        view.put("name", row.getName());
        view.put("vehicleModel", row.getVehicleModel());
        view.put("minPackage", row.getMinPackage());
        view.put("warehouseName", row.getWarehouseName());
        view.put("sourceType", row.getSourceType());
        view.put("supplierName", row.getSupplierName());
        view.put("quantity", row.getQuantity());
        view.put("reserved", row.getReserved());
        view.put("available", row.getQuantity() - row.getReserved());
        view.put("updatedAt", row.getUpdatedAt());
        return view;
    }

    public List<Map<String, Object>> list(String productId, String lowStock) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (InventoryItemRow row : inventoryMapper.list(blankToNull(productId), "true".equals(lowStock))) {
            result.add(map(row));
        }
        return result;
    }

    public List<Map<String, Object>> movements(String productId) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (MovementRow row : inventoryMapper.movements(blankToNull(productId))) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", row.getId());
            view.put("sku", row.getSku());
            view.put("name", row.getName());
            view.put("warehouseName", row.getWarehouseName());
            view.put("type", row.getType());
            view.put("quantity", row.getQuantity());
            view.put("referenceType", row.getReferenceType());
            view.put("referenceId", row.getReferenceId());
            view.put("note", row.getNote());
            view.put("createdAt", row.getCreatedAt());
            result.add(view);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> transfer(AuthUser user, Map<String, Object> payload) {
        int quantity = Validation.parsePositiveInteger(payload.get("quantity"), "移库数量");
        String sourceId = payload.get("sourceId") == null ? "" : String.valueOf(payload.get("sourceId"));
        String destinationId = payload.get("destinationId") == null ? "" : String.valueOf(payload.get("destinationId"));
        InventorySnapshot source = inventoryMapper.snapshot(sourceId);
        InventorySnapshot destination = inventoryMapper.snapshot(destinationId);
        if (source == null || destination == null) {
            throw new HttpException(404, "INVENTORY_NOT_FOUND", "源库存或目标库存不存在");
        }
        if (source.getId().equals(destination.getId())) {
            throw new HttpException(400, "INVALID_TRANSFER", "源仓库与目标仓库不能相同");
        }
        if (!source.getProductId().equals(destination.getProductId())) {
            throw new HttpException(400, "INVALID_TRANSFER", "只能移动同一产品");
        }
        if (source.getQuantity() - source.getReserved() < quantity) {
            throw new HttpException(409, "INSUFFICIENT_TRANSFER_STOCK", "源库存可用量不足");
        }
        String transferNo = SerialNumbers.next("MOVE");
        String now = Times.nowIso();
        inventoryMapper.decreaseQuantity(source.getId(), quantity, now);
        inventoryMapper.increaseQuantity(destination.getId(), quantity, now);
        inventoryMapper.insertMovement(Ids.next("move"), source.getId(), "TRANSFER_OUT", -quantity, "TRANSFER",
                transferNo, "移库至" + destination.getWarehouseName(), user.id(), now);
        inventoryMapper.insertMovement(Ids.next("move"), destination.getId(), "TRANSFER_IN", quantity, "TRANSFER",
                transferNo, "由" + source.getWarehouseName() + "移入", user.id(), now);
        auditService.record(user, "TRANSFER_INVENTORY", "INVENTORY", transferNo,
                Map.of("sourceId", source.getId(), "destinationId", destination.getId(), "quantity", quantity));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("transferNo", transferNo);
        data.put("sourceId", source.getId());
        data.put("destinationId", destination.getId());
        data.put("quantity", quantity);
        return data;
    }

    @Transactional
    public Map<String, Object> adjust(AuthUser user, String inventoryId, Object quantityPayload, String note) {
        double raw = Validation.parseDouble(quantityPayload, "库存调整数量");
        if (raw != Math.floor(raw) || raw == 0) {
            throw new HttpException(400, "VALIDATION_ERROR", "库存调整数量必须为非零整数");
        }
        int delta = (int) raw;
        InventorySnapshot row = inventoryMapper.snapshot(inventoryId);
        if (row == null) {
            throw new HttpException(404, "INVENTORY_NOT_FOUND", "库存记录不存在");
        }
        if (row.getQuantity() + delta < 0 || row.getQuantity() + delta < row.getReserved()) {
            throw new HttpException(409, "INVALID_INVENTORY_ADJUSTMENT", "调整后库存不能低于已预占数量");
        }
        String now = Times.nowIso();
        if (delta > 0) {
            inventoryMapper.increaseQuantity(inventoryId, delta, now);
        } else {
            inventoryMapper.decreaseQuantity(inventoryId, -delta, now);
        }
        inventoryMapper.insertMovement(Ids.next("move"), inventoryId, "ADJUST", delta, "MANUAL", null,
                Validation.cleanText(note == null || note.isBlank() ? "库存调整" : note, 500), user.id(), now);
        auditService.record(user, "ADJUST_INVENTORY", "INVENTORY", inventoryId,
                Map.of("delta", delta, "note", note == null ? "" : note));
        return map(inventoryMapper.findById(inventoryId));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
