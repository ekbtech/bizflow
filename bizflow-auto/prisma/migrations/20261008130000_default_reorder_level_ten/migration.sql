ALTER TABLE `spare_parts`
  ALTER COLUMN `reorder_level` SET DEFAULT 10;

UPDATE `spare_parts`
SET `reorder_level` = 10
WHERE `reorder_level` = 0;
