ALTER TABLE `spare_parts`
  ADD COLUMN `stock_counted` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `price_configured` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `catalog_category` VARCHAR(100) NOT NULL DEFAULT 'General',
  ADD COLUMN `vehicle_type` ENUM('CAR', 'BICYCLE', 'MOTORBIKE', 'UNIVERSAL') NOT NULL DEFAULT 'UNIVERSAL',
  ADD INDEX `spare_parts_vehicle_type_catalog_category_idx`(`vehicle_type`, `catalog_category`);

ALTER TABLE `services`
  ADD COLUMN `price_configured` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `catalog_category` VARCHAR(100) NOT NULL DEFAULT 'General',
  ADD COLUMN `vehicle_type` ENUM('CAR', 'BICYCLE', 'MOTORBIKE', 'UNIVERSAL') NOT NULL DEFAULT 'UNIVERSAL',
  ADD COLUMN `mechanic_specialty` VARCHAR(120) NOT NULL DEFAULT 'General mechanic',
  ADD INDEX `services_vehicle_type_catalog_category_idx`(`vehicle_type`, `catalog_category`);
