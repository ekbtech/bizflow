ALTER TABLE `job_cards`
  MODIFY `status` ENUM(
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'WAITING',
    'INSPECTION',
    'DIAGNOSIS',
    'AWAITING_APPROVAL',
    'QUALITY_CHECK',
    'DELIVERED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'PENDING';

UPDATE `job_cards`
SET `status` = 'WAITING'
WHERE `status` = 'PENDING';

ALTER TABLE `job_cards`
  MODIFY `status` ENUM(
    'WAITING',
    'INSPECTION',
    'DIAGNOSIS',
    'AWAITING_APPROVAL',
    'IN_PROGRESS',
    'QUALITY_CHECK',
    'COMPLETED',
    'DELIVERED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'WAITING',
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `started_at` TIMESTAMP(0) NULL,
  ADD COLUMN `work_completed_at` TIMESTAMP(0) NULL,
  ADD COLUMN `quality_checked_at` TIMESTAMP(0) NULL,
  ADD COLUMN `quality_checked_by_user_id` INTEGER NULL,
  ADD COLUMN `quality_notes` TEXT NULL,
  ADD COLUMN `delivered_at` TIMESTAMP(0) NULL,
  ADD COLUMN `cancelled_at` TIMESTAMP(0) NULL,
  ADD COLUMN `cancel_reason` TEXT NULL,
  ADD INDEX `job_cards_status_created_at_idx`(`status`, `created_at`),
  ADD CONSTRAINT `job_cards_quality_checked_by_user_id_fkey`
    FOREIGN KEY (`quality_checked_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
