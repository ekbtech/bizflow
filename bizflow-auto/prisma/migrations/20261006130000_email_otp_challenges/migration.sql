CREATE TABLE `email_otp_challenges` (
  `id` VARCHAR(32) NOT NULL,
  `user_id` INTEGER NOT NULL,
  `purpose` ENUM('LOGIN', 'PASSWORD_RESET') NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `expires_at` TIMESTAMP(0) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `consumed_at` TIMESTAMP(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `email_otp_challenges_user_purpose_key` (`user_id`, `purpose`),
  INDEX `email_otp_challenges_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `email_otp_challenges_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
