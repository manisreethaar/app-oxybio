ALTER TABLE seed_passages DROP CONSTRAINT IF EXISTS seed_passages_vial_id_fkey;
ALTER TABLE seed_passages ADD CONSTRAINT seed_passages_vial_id_fkey FOREIGN KEY (vial_id) REFERENCES cell_bank_vials(id) ON DELETE SET NULL;
