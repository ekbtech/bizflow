ALTER TABLE `service_reminder_notifications`
  DROP INDEX `service_reminders_vehicle_completed_key`,
  ADD COLUMN `channel` ENUM('WHATSAPP', 'SMS') NOT NULL DEFAULT 'WHATSAPP',
  ADD UNIQUE INDEX `service_reminders_vehicle_completed_channel_key`(`vehicle_id`, `service_completed_at`, `channel`);
