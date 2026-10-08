ALTER TABLE `users`
  MODIFY `role` ENUM(
    'ADMIN',
    'SUPER_ADMIN',
    'GARAGE_MANAGER',
    'SERVICE_ADVISOR',
    'MECHANIC',
    'STOREKEEPER',
    'ACCOUNTANT',
    'CUSTOMER'
  ) NOT NULL,
  ADD COLUMN `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `locked_until` TIMESTAMP(0) NULL,
  ADD COLUMN `last_login_at` TIMESTAMP(0) NULL;

CREATE TABLE `audit_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actor_user_id` INTEGER NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` VARCHAR(100) NULL,
  `ip_address` VARCHAR(45) NULL,
  `details` JSON NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `audit_logs_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
  INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
  INDEX `audit_logs_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `audit_logs_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
