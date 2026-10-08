ALTER TABLE `users`
  ADD COLUMN `username` VARCHAR(50) NULL,
  ADD UNIQUE INDEX `users_username_key`(`username`);
