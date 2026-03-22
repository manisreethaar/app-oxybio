-- SQL Remediation: Atomic Inventory Deduction
-- Run this in the Supabase Database SQL Editor

CREATE OR REPLACE FUNCTION deduct_inventory_stock(id_to_deduct UUID, quantity_to_deduct NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory_stock
  SET current_quantity = current_quantity - quantity_to_deduct
  WHERE id = id_to_deduct 
    AND current_quantity >= quantity_to_deduct;
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock or item not found';
  END IF;
END;
$$ LANGUAGE plpgsql;
