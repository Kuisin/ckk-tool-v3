-- SQL views for stock management
-- These views should be created in the database before adding Prisma view blocks
-- Run this file manually or include in a migration with --create-only flag
--
-- If app_stocks has total_value (legacy), drop views then drop column so views can be recreated without it.
DROP VIEW IF EXISTS "app_stock_summary_view";
DROP VIEW IF EXISTS "app_stock_purchase_summary_view";
ALTER TABLE "app_stocks" DROP COLUMN IF EXISTS "total_value";

-- StockSummaryView: Aggregates stock by (factory, material, diameter, length, polished, custom_type)
-- Calculates:
--   - currentQuantity: Current available stock quantity
--   - reservedQuantity: Quantity reserved for outgoing (orders)
--   - plannedQuantity: Quantity planned for incoming (purchases)
--   - estimateQuantity: Estimated available quantity after planned changes (current + planned - reserved)
-- NOTE: This view includes reservations even when stock doesn't exist yet
CREATE OR REPLACE VIEW "app_stock_summary_view" AS
  WITH stock_data AS (
    SELECT 
      s.factory_id,
      s.material_id,
      s.diameter,
      s.length,
      s.polished,
      COALESCE(s.custom_type, '-') as custom_type,
      SUM(s.available_quantity) as available_quantity
    FROM "app_stocks" s
    GROUP BY s.factory_id, s.material_id, s.diameter, s.length, s.polished, s.custom_type
  ),
  reservation_data AS (
    SELECT 
      sr.factory_id,
      sr.material_id,
      sr.diameter,
      sr.length,
      sr.polished,
      COALESCE(sr.custom_type, '-') as custom_type,
      -- Outgoing reservations (direction = false)
      COALESCE(
        SUM(sr.quantity)
          FILTER (
            WHERE sr.direction = false
          ),
        0
      )::int as reserved_quantity,
      -- Incoming reservations (direction = true, with stockPurchaseId)
      COALESCE(
        SUM(sr.quantity)
          FILTER (
            WHERE sr.direction = true
              AND sr.stock_purchase_id IS NOT NULL
          ),
        0
      )::int as planned_quantity
    FROM "app_stock_reservations" sr
    WHERE sr.status IN ('RESERVED', 'LOCKED')
    GROUP BY sr.factory_id, sr.material_id, sr.diameter, sr.length, sr.polished, sr.custom_type
  ),
  combined_data AS (
    SELECT 
      COALESCE(s.factory_id, r.factory_id, 1) as factory_id, -- Default to factory 1 if both null
      COALESCE(s.material_id, r.material_id) as material_id,
      COALESCE(s.diameter, r.diameter) as diameter,
      COALESCE(s.length, r.length) as length,
      COALESCE(s.polished, r.polished) as polished,
      COALESCE(s.custom_type, r.custom_type, '-') as custom_type,
      COALESCE(s.available_quantity, 0)::int as current_quantity,
      COALESCE(r.reserved_quantity, 0)::int as reserved_quantity,
      COALESCE(r.planned_quantity, 0)::int as planned_quantity
    FROM stock_data s
    FULL OUTER JOIN reservation_data r
      ON s.factory_id = r.factory_id
      AND s.material_id = r.material_id
      AND s.diameter = r.diameter
      AND s.length = r.length
      AND s.polished = r.polished
      AND s.custom_type = r.custom_type
  )
  SELECT 
    factory_id as "factory_id",
    material_id as "material_id",
    diameter,
    length,
    polished,
    custom_type as "custom_type",
    current_quantity as "current_quantity",
    reserved_quantity as "reserved_quantity",
    planned_quantity as "planned_quantity",
    GREATEST(
      0,
      current_quantity + planned_quantity - reserved_quantity
    )::int as "estimate_quantity"
  FROM combined_data;

-- StockPurchaseSummaryView: Purchase statistics and reporting
CREATE VIEW "app_stock_purchase_summary_view" AS
  SELECT 
    sp.supplier_id as "supplier_id",
    DATE(sp.purchase_date) as "purchase_date",
    COUNT(DISTINCT sp.id) as "total_purchases",
    AVG(sp.total_amount) as "average_price",
    SUM(spi.quantity) as "purchase_counts"
  FROM "app_stock_purchases" sp
  LEFT JOIN "app_stock_purchase_items" spi ON sp.id = spi.stock_purchase_id
  GROUP BY sp.supplier_id, DATE(sp.purchase_date);

-- MaterialLatestPriceView: Latest purchase price for each material combination (including custom_type)
CREATE VIEW "app_material_latest_price_view" AS
  SELECT DISTINCT ON (spi.material_id, spi.diameter, spi.length, spi.polished, spi.custom_type)
    spi.material_id as "material_id",
    spi.diameter,
    spi.length,
    spi.polished,
    spi.custom_type as "custom_type",
    spi.price_per_piece as "latest_price_per_piece",
    spi.price_per_unit as "latest_price_per_unit",
    sp.purchase_date as "latest_purchase_date",
    sp.id as "latest_purchase_id",
    sp.supplier_id as "latest_supplier_id",
    sp.currency
  FROM "app_stock_purchase_items" spi
  INNER JOIN "app_stock_purchases" sp ON spi.stock_purchase_id = sp.id
  ORDER BY spi.material_id, spi.diameter, spi.length, spi.polished, spi.custom_type, sp.purchase_date DESC, sp.id DESC;
