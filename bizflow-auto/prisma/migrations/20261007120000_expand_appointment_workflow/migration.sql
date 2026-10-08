ALTER TABLE `appointments`
  MODIFY `status` ENUM(
    'PENDING',
    'REQUESTED',
    'CONFIRMED',
    'REJECTED',
    'RESCHEDULED',
    'CHECKED_IN',
    'IN_SERVICE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
  ) NOT NULL DEFAULT 'REQUESTED';

UPDATE `appointments` SET `status` = 'REQUESTED' WHERE `status` = 'PENDING';
UPDATE `appointments` SET `status` = 'CANCELLED' WHERE `status` = 'REJECTED';
UPDATE `appointments` SET `status` = 'REQUESTED' WHERE `status` = 'RESCHEDULED';

ALTER TABLE `appointments`
  MODIFY `status` ENUM(
    'REQUESTED',
    'CONFIRMED',
    'CHECKED_IN',
    'IN_SERVICE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
  ) NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN `advisor_user_id` INTEGER NULL,
  ADD COLUMN `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  ADD INDEX `appointments_advisor_user_id_idx` (`advisor_user_id`),
  ADD CONSTRAINT `appointments_advisor_user_id_fkey`
    FOREIGN KEY (`advisor_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
