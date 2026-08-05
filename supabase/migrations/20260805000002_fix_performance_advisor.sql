-- Drop duplicate indexes
DROP INDEX IF EXISTS idx_cb_prep_strain;
DROP INDEX IF EXISTS idx_inv_usage_stock_id;
DROP INDEX IF EXISTS idx_lnb_cell_bank_prep;
DROP INDEX IF EXISTS idx_incub_cb_prep;

-- Drop redundant admin policy that causes multiple permissive policies warning, 
-- since the staff_* policies already have USING (true) which allows all access.
DROP POLICY IF EXISTS admin_all_seed_passages ON seed_passages;
