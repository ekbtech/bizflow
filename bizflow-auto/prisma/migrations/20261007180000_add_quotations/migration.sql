CREATE TABLE `quotations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appointment_id` INTEGER NOT NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `approved_by_user_id` INTEGER NULL,
  `approval_token_hash` VARCHAR(64) NULL,
  `status` ENUM('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
  `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `expires_at` TIMESTAMP(0) NOT NULL,
  `sent_at` TIMESTAMP(0) NULL,
  `approved_at` TIMESTAMP(0) NULL,
  `rejected_at` TIMESTAMP(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL,

  INDEX `quotations_appointment_id_status_idx`(`appointment_id`, `status`),
  INDEX `quotations_status_expires_at_idx`(`status`, `expires_at`),
  INDEX `quotations_created_by_user_id_created_at_idx`(`created_by_user_id`, `created_at`),
  UNIQUE INDEX `quotations_approval_token_hash_key`(`approval_token_hash`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotations_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `quotations_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `quotations_approved_by_user_id_fkey`
    FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_id` INTEGER NOT NULL,
  `part_id` INTEGER NULL,
  `item_type` ENUM('LABOUR', 'PART', 'DIAGNOSTIC', 'EXTERNAL', 'MISCELLANEOUS') NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantity` DECIMAL(10, 2) NOT NULL,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `line_total` DECIMAL(12, 2) NOT NULL,

  INDEX `quotation_items_quotation_id_idx`(`quotation_id`),
  INDEX `quotation_items_part_id_idx`(`part_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotation_items_quotation_id_fkey`
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `quotation_items_part_id_fkey`
    FOREIGN KEY (`part_id`) REFERENCES `spare_parts` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `invoice_items`
  MODIFY `item_type` ENUM('SERVICE', 'PART', 'LABOUR', 'DIAGNOSTIC', 'EXTERNAL', 'MISCELLANEOUS') NOT NULL,
  MODIFY `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
  ADD COLUMN `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `line_total` DECIMAL(12, 2) NULL;

UPDATE `invoice_items`
SET `line_total` = ROUND(`quantity` * `unit_price`, 2);

ALTER TABLE `invoice_items`
  MODIFY `line_total` DECIMAL(12, 2) NOT NULL;

ALTER TABLE `job_cards`
  ADD COLUMN `quotation_id` INTEGER NULL,
  ADD UNIQUE INDEX `job_cards_quotation_id_key`(`quotation_id`),
  ADD CONSTRAINT `job_cards_quotation_id_fkey`
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
