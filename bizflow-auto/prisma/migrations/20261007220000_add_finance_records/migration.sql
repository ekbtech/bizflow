CREATE TABLE `payment_receipts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payment_id` INTEGER NOT NULL,
  `receipt_number` VARCHAR(32) NOT NULL,
  `issued_by_user_id` INTEGER NULL,
  `issued_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `payment_receipts_payment_id_key`(`payment_id`),
  UNIQUE INDEX `payment_receipts_receipt_number_key`(`receipt_number`),
  INDEX `payment_receipts_issued_by_user_id_issued_at_idx`(`issued_by_user_id`, `issued_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `payment_receipts` (`payment_id`, `receipt_number`, `issued_at`)
SELECT `id`, CONCAT('RCT-', LPAD(`id`, 8, '0')), `payment_date`
FROM `payments`
WHERE `status` = 'PAID';

CREATE TABLE `expenses` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `category` VARCHAR(100) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `payee` VARCHAR(255) NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `payment_method` ENUM('CASH', 'M_PESA', 'CARD', 'BANK') NOT NULL,
  `reference` VARCHAR(255) NULL,
  `expense_date` TIMESTAMP(0) NOT NULL,
  `notes` TEXT NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `expenses_expense_date_category_idx`(`expense_date`, `category`),
  INDEX `expenses_created_by_user_id_created_at_idx`(`created_by_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payment_receipts`
  ADD CONSTRAINT `payment_receipts_payment_id_fkey`
    FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `payment_receipts_issued_by_user_id_fkey`
    FOREIGN KEY (`issued_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `expenses`
  ADD CONSTRAINT `expenses_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
