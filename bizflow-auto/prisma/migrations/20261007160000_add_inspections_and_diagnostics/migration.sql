CREATE TABLE `vehicle_inspections` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `reception_id` INTEGER NOT NULL,
  `job_card_id` INTEGER NULL,
  `inspected_by_user_id` INTEGER NOT NULL,
  `mileage` INTEGER NOT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `vehicle_inspections_reception_id_key`(`reception_id`),
  UNIQUE INDEX `vehicle_inspections_job_card_id_key`(`job_card_id`),
  INDEX `vehicle_inspections_inspected_by_user_id_created_at_idx`(`inspected_by_user_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_inspections_reception_id_fkey`
    FOREIGN KEY (`reception_id`) REFERENCES `receptions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `vehicle_inspections_job_card_id_fkey`
    FOREIGN KEY (`job_card_id`) REFERENCES `job_cards` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vehicle_inspections_inspected_by_user_id_fkey`
    FOREIGN KEY (`inspected_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `inspection_id` INTEGER NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `status` ENUM('GOOD', 'ATTENTION_REQUIRED', 'CRITICAL', 'NOT_CHECKED') NOT NULL DEFAULT 'NOT_CHECKED',
  `notes` TEXT NULL,

  UNIQUE INDEX `inspection_items_inspection_id_category_name_key`(`inspection_id`, `category`, `name`),
  INDEX `inspection_items_category_status_idx`(`category`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inspection_items_inspection_id_fkey`
    FOREIGN KEY (`inspection_id`) REFERENCES `vehicle_inspections` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_images` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `inspection_id` INTEGER NOT NULL,
  `object_key` VARCHAR(512) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size_bytes` INTEGER NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `inspection_images_object_key_key`(`object_key`),
  INDEX `inspection_images_inspection_id_idx`(`inspection_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inspection_images_inspection_id_fkey`
    FOREIGN KEY (`inspection_id`) REFERENCES `vehicle_inspections` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `diagnostic_records` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appointment_id` INTEGER NOT NULL,
  `job_card_id` INTEGER NULL,
  `technician_name` VARCHAR(255) NOT NULL,
  `complaint` TEXT NOT NULL,
  `procedure` TEXT NOT NULL,
  `fault_codes` TEXT NULL,
  `symptoms` TEXT NULL,
  `diagnosis` TEXT NOT NULL,
  `recommended_repair` TEXT NOT NULL,
  `diagnostic_minutes` INTEGER NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `diagnostic_records_appointment_id_created_at_idx`(`appointment_id`, `created_at`),
  INDEX `diagnostic_records_job_card_id_idx`(`job_card_id`),
  INDEX `diagnostic_records_technician_name_created_at_idx`(`technician_name`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `diagnostic_records_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `diagnostic_records_job_card_id_fkey`
    FOREIGN KEY (`job_card_id`) REFERENCES `job_cards` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
