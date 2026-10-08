CREATE TABLE `leave_requests` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `response_note` TEXT NULL,
  `reviewed_by_user_id` INTEGER NULL,
  `reviewed_at` TIMESTAMP(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL,
  INDEX `leave_requests_user_id_status_start_date_idx`(`user_id`, `status`, `start_date`),
  INDEX `leave_requests_status_start_date_idx`(`status`, `start_date`),
  INDEX `leave_requests_reviewed_by_user_id_idx`(`reviewed_by_user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `leave_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `leave_requests_reviewed_by_user_id_fkey` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
