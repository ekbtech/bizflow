ALTER TABLE `users`
  ADD COLUMN `password_reset_token_hash` VARCHAR(64) NULL,
  ADD COLUMN `password_reset_expires_at` TIMESTAMP(0) NULL,
  ADD UNIQUE INDEX `users_password_reset_token_hash_key`(`password_reset_token_hash`);

ALTER TABLE `customers`
  ADD COLUMN `whatsapp_opt_in` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `service_reminder_notifications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `vehicle_id` INTEGER NOT NULL,
  `service_completed_at` TIMESTAMP(0) NOT NULL,
  `due_at` TIMESTAMP(0) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
  `attempts` INTEGER NOT NULL DEFAULT 1,
  `last_error` VARCHAR(500) NULL,
  `sent_at` TIMESTAMP(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `service_reminders_vehicle_completed_key`(`vehicle_id`, `service_completed_at`),
  INDEX `service_reminders_status_due_idx`(`status`, `due_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `service_reminder_notifications_vehicle_id_fkey`
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
