CREATE TABLE `receptions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appointment_id` INTEGER NULL,
  `customer_id` INTEGER NOT NULL,
  `vehicle_id` INTEGER NOT NULL,
  `received_by_user_id` INTEGER NOT NULL,
  `mileage` INTEGER NOT NULL,
  `fuel_level_percent` INTEGER NOT NULL,
  `exterior_condition` TEXT NULL,
  `interior_condition` TEXT NULL,
  `tyres` TEXT NULL,
  `lights` TEXT NULL,
  `windows` TEXT NULL,
  `mirrors` TEXT NULL,
  `body_damage` TEXT NULL,
  `existing_scratches` TEXT NULL,
  `accessories` TEXT NULL,
  `complaint` TEXT NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `receptions_appointment_id_key`(`appointment_id`),
  INDEX `receptions_customer_id_created_at_idx`(`customer_id`, `created_at`),
  INDEX `receptions_vehicle_id_created_at_idx`(`vehicle_id`, `created_at`),
  INDEX `receptions_received_by_user_id_created_at_idx`(`received_by_user_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `receptions_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `receptions_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `receptions_vehicle_id_fkey`
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `receptions_received_by_user_id_fkey`
    FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `reception_images` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `reception_id` INTEGER NOT NULL,
  `object_key` VARCHAR(512) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size_bytes` INTEGER NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `reception_images_object_key_key`(`object_key`),
  INDEX `reception_images_reception_id_idx`(`reception_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `reception_images_reception_id_fkey`
    FOREIGN KEY (`reception_id`) REFERENCES `receptions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
