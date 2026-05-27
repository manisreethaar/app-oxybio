-- Keep one QC test row per sample/test name.
-- Older QC samples could receive duplicate standard-test rows when tests were regenerated.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY sample_id, test_name
      ORDER BY
        CASE WHEN result_value IS NOT NULL AND result_value <> '' THEN 1 ELSE 0 END DESC,
        CASE WHEN tested_at IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN pass_fail IS NOT NULL AND pass_fail <> 'Pending' THEN 1 ELSE 0 END DESC,
        created_at DESC,
        id DESC
    ) AS keep_rank
  FROM batch_flask_qc_tests
)
DELETE FROM batch_flask_qc_tests qct
USING ranked
WHERE qct.id = ranked.id
  AND ranked.keep_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS batch_flask_qc_tests_sample_test_unique
  ON batch_flask_qc_tests(sample_id, test_name);
