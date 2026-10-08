ALTER TABLE `payments`
  ADD COLUMN `mpesa_checkout_request_id` VARCHAR(100) NULL,
  ADD COLUMN `mpesa_phone` VARCHAR(20) NULL,
  ADD UNIQUE INDEX `payments_mpesa_checkout_request_id_key`(`mpesa_checkout_request_id`);
