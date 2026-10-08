CREATE TABLE `suppliers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `contact_person` VARCHAR(255) NULL,
  `phone` VARCHAR(50) NULL,
  `email` VARCHAR(255) NULL,
  `address` TEXT NULL,
  `notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL,
  INDEX `suppliers_name_idx`(`name`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `purchase_orders` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `supplier_id` INTEGER NOT NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `status` ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `expected_at` TIMESTAMP(0) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL,
  INDEX `purchase_orders_supplier_id_status_idx`(`supplier_id`, `status`),
  INDEX `purchase_orders_created_by_user_id_created_at_idx`(`created_by_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `purchase_order_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `purchase_order_id` INTEGER NOT NULL,
  `part_id` INTEGER NOT NULL,
  `quantity` INTEGER NOT NULL,
  `received_quantity` INTEGER NOT NULL DEFAULT 0,
  `unit_cost` DECIMAL(10, 2) NOT NULL,
  UNIQUE INDEX `purchase_order_items_purchase_order_id_part_id_key`(`purchase_order_id`, `part_id`),
  INDEX `purchase_order_items_part_id_idx`(`part_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inventory_transactions`
  MODIFY `transaction_type` ENUM('IN', 'OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER') NOT NULL,
  ADD COLUMN `supplier_id` INTEGER NULL,
  ADD COLUMN `purchase_order_id` INTEGER NULL,
  ADD COLUMN `purchase_order_item_id` INTEGER NULL,
  ADD COLUMN `from_location` VARCHAR(120) NULL,
  ADD COLUMN `to_location` VARCHAR(120) NULL,
  ADD COLUMN `created_by_user_id` INTEGER NULL,
  ADD INDEX `inventory_transactions_supplier_id_idx`(`supplier_id`),
  ADD INDEX `inventory_transactions_purchase_order_id_idx`(`purchase_order_id`),
  ADD INDEX `inventory_transactions_created_by_user_id_created_at_idx`(`created_by_user_id`, `created_at`);

ALTER TABLE `purchase_orders`
  ADD CONSTRAINT `purchase_orders_supplier_id_fkey`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `purchase_orders_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `purchase_order_items`
  ADD CONSTRAINT `purchase_order_items_purchase_order_id_fkey`
    FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `purchase_order_items_part_id_fkey`
    FOREIGN KEY (`part_id`) REFERENCES `spare_parts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `inventory_transactions`
  ADD CONSTRAINT `inventory_transactions_supplier_id_fkey`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `inventory_transactions_purchase_order_id_fkey`
    FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `inventory_transactions_purchase_order_item_id_fkey`
    FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `inventory_transactions_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
