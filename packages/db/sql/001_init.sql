-- 001_init.sql：MySQL 8 初始化结构（由 packages/db/src/schema.js 等价手写）。
-- 约定：字符集 utf8mb4；时间字段保持 ISO 字符串 VARCHAR(32)；金额 DECIMAL(14,2)。
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `province` VARCHAR(50) NULL,
  `city` VARCHAR(50) NULL,
  `channel_type` VARCHAR(32) NOT NULL,
  `grade` VARCHAR(20) NOT NULL,
  `price_tier` VARCHAR(32) NOT NULL,
  `settlement_method` VARCHAR(32) NOT NULL DEFAULT 'CREDIT',
  `payment_terms_days` INT NOT NULL DEFAULT 0,
  `credit_limit` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `prepay_ratio` DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  `batch_limit` INT NOT NULL DEFAULT 3,
  `allow_overpayment` INT NOT NULL DEFAULT 0,
  `phone` VARCHAR(32) NULL,
  `address` VARCHAR(500) NULL,
  `active` INT NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL,
  `username` VARCHAR(80) NOT NULL,
  `password_hash` TEXT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(32) NULL,
  `wechat_openid` VARCHAR(128) NULL,
  `role` VARCHAR(32) NOT NULL,
  `customer_id` VARCHAR(64) NULL,
  `active` INT NOT NULL DEFAULT 1,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `idx_users_wechat_openid` (`wechat_openid`),
  KEY `idx_users_customer` (`customer_id`),
  CONSTRAINT `fk_users_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `token` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `expires_at` VARCHAR(32) NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`token`),
  KEY `idx_sessions_user` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `customer_vehicle_authorizations` (
  `id` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `vehicle_model` VARCHAR(100) NOT NULL,
  `province` VARCHAR(50) NULL,
  `city` VARCHAR(50) NULL,
  `active` INT NOT NULL DEFAULT 1,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_vehicle` (`customer_id`, `vehicle_model`, `province`, `city`),
  KEY `idx_customer_vehicle_auth` (`customer_id`, `vehicle_model`),
  CONSTRAINT `fk_cva_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `contact` VARCHAR(100) NULL,
  `phone` VARCHAR(32) NULL,
  `active` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(64) NOT NULL,
  `sku` VARCHAR(80) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `vehicle_model` VARCHAR(100) NOT NULL,
  `min_package` INT NOT NULL DEFAULT 1,
  `base_price` DECIMAL(14,2) NOT NULL,
  `warranty_months` INT NOT NULL DEFAULT 12,
  `warranty_km` INT NOT NULL DEFAULT 60000,
  `active` INT NOT NULL DEFAULT 1,
  `description` TEXT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `price_rules` (
  `id` VARCHAR(64) NOT NULL,
  `price_tier` VARCHAR(32) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `price` DECIMAL(14,2) NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_price_tier_product` (`price_tier`, `product_id`),
  CONSTRAINT `fk_price_rules_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `customer_prices` (
  `id` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `price` DECIMAL(14,2) NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_product_price` (`customer_id`, `product_id`),
  CONSTRAINT `fk_customer_prices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_customer_prices_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `warehouse_name` VARCHAR(100) NOT NULL,
  `source_type` VARCHAR(16) NOT NULL,
  `supplier_id` VARCHAR(64) NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `reserved` INT NOT NULL DEFAULT 0,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_product` (`product_id`),
  CONSTRAINT `fk_inventory_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_inventory_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `id` VARCHAR(64) NOT NULL,
  `inventory_id` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `quantity` INT NOT NULL,
  `reference_type` VARCHAR(32) NULL,
  `reference_id` VARCHAR(64) NULL,
  `note` VARCHAR(500) NULL,
  `created_by` VARCHAR(64) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_movements_inventory` (`inventory_id`),
  CONSTRAINT `fk_movements_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `plans` (
  `id` VARCHAR(64) NOT NULL,
  `plan_no` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `plan_month` VARCHAR(7) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `customer_note` TEXT NULL,
  `bangbang_note` TEXT NULL,
  `sanlei_note` TEXT NULL,
  `submitted_at` VARCHAR(32) NULL,
  `bangbang_reviewed_at` VARCHAR(32) NULL,
  `sanlei_reviewed_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plans_no` (`plan_no`),
  KEY `idx_plans_customer` (`customer_id`, `plan_month`),
  CONSTRAINT `fk_plans_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `plan_items` (
  `id` VARCHAR(64) NOT NULL,
  `plan_id` VARCHAR(64) NOT NULL,
  `week_no` INT NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `quantity` INT NOT NULL,
  `ordered_quantity` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_plan_items_plan` (`plan_id`),
  CONSTRAINT `fk_plan_items_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_plan_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_groups` (
  `id` VARCHAR(64) NOT NULL,
  `group_no` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `settlement_week` VARCHAR(16) NOT NULL,
  `settlement_method` VARCHAR(32) NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'CNY',
  `tax_mode` VARCHAR(16) NOT NULL DEFAULT 'INCLUDED',
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_groups_no` (`group_no`),
  KEY `idx_order_groups_customer` (`customer_id`),
  CONSTRAINT `fk_order_groups_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(64) NOT NULL,
  `order_no` VARCHAR(64) NOT NULL,
  `group_id` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `vehicle_model` VARCHAR(100) NOT NULL,
  `order_type` VARCHAR(32) NOT NULL,
  `settlement_method` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `total_amount` DECIMAL(14,2) NOT NULL,
  `paid_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `shipped_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `prepay_ratio` DECIMAL(6,4) NOT NULL,
  `allow_overpayment` INT NOT NULL DEFAULT 0,
  `batch_limit` INT NOT NULL DEFAULT 3,
  `plan_id` VARCHAR(64) NULL,
  `plan_week` INT NULL,
  `customer_note` TEXT NULL,
  `ops_note` TEXT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_no` (`order_no`),
  KEY `idx_orders_customer` (`customer_id`, `created_at`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_group` (`group_id`),
  CONSTRAINT `fk_orders_group` FOREIGN KEY (`group_id`) REFERENCES `order_groups` (`id`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_orders_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(14,2) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `reserved_quantity` INT NOT NULL DEFAULT 0,
  `shipped_quantity` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `reservations` (
  `id` VARCHAR(64) NOT NULL,
  `order_item_id` VARCHAR(64) NOT NULL,
  `inventory_id` VARCHAR(64) NOT NULL,
  `quantity` INT NOT NULL,
  `consumed_quantity` INT NOT NULL DEFAULT 0,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reservations_item` (`order_item_id`),
  CONSTRAINT `fk_reservations_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reservations_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(64) NOT NULL,
  `payment_no` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `channel` VARCHAR(16) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `transaction_id` VARCHAR(128) NULL,
  `prepay_id` VARCHAR(128) NULL,
  `paid_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_no` (`payment_no`),
  KEY `idx_payments_order` (`order_id`),
  CONSTRAINT `fk_payments_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `shipments` (
  `id` VARCHAR(64) NOT NULL,
  `shipment_no` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NOT NULL,
  `batch_no` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `logistics_company` VARCHAR(100) NULL,
  `tracking_no` VARCHAR(100) NULL,
  `dispatch_location` VARCHAR(200) NULL,
  `delivery_mode` VARCHAR(16) NOT NULL DEFAULT 'DELIVERY',
  `amount` DECIMAL(14,2) NOT NULL,
  `shipped_at` VARCHAR(32) NULL,
  `received_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shipments_no` (`shipment_no`),
  KEY `idx_shipments_order` (`order_id`),
  CONSTRAINT `fk_shipments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `shipment_items` (
  `id` VARCHAR(64) NOT NULL,
  `shipment_id` VARCHAR(64) NOT NULL,
  `order_item_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `quantity` INT NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_shipment_items_shipment` (`shipment_id`),
  CONSTRAINT `fk_shipment_items_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_shipment_items_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`),
  CONSTRAINT `fk_shipment_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `after_sales_cases` (
  `id` VARCHAR(64) NOT NULL,
  `case_no` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NULL,
  `type` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `description` TEXT NOT NULL,
  `claim_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `resolution` TEXT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_after_sales_no` (`case_no`),
  KEY `idx_after_sales_customer` (`customer_id`),
  CONSTRAINT `fk_after_sales_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_after_sales_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(64) NOT NULL,
  `invoice_no` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `tax_number` VARCHAR(100) NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `tax_rate` DECIMAL(6,2) NOT NULL DEFAULT 13.00,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `note` TEXT NULL,
  `issued_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_no` (`invoice_no`),
  KEY `idx_invoices_order` (`order_id`),
  CONSTRAINT `fk_invoices_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `freight_charges` (
  `id` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `payer` VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `description` TEXT NULL,
  `settled_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_freight_order` (`order_id`),
  CONSTRAINT `fk_freight_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_freight_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `financial_adjustments` (
  `id` VARCHAR(64) NOT NULL,
  `adjustment_no` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(64) NULL,
  `type` VARCHAR(32) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `description` TEXT NULL,
  `settled_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_adjustments_no` (`adjustment_no`),
  KEY `idx_adjustments_customer` (`customer_id`),
  CONSTRAINT `fk_adjustments_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_adjustments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `read_at` VARCHAR(32) NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NULL,
  `action` VARCHAR(64) NOT NULL,
  `entity_type` VARCHAR(32) NOT NULL,
  `entity_id` VARCHAR(64) NULL,
  `details` TEXT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
