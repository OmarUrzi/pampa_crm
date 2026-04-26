-- Add/ensure index support for new agency asset kind `pptx_guide`.
-- Note: `kind` is a String field; no schema change required, but keep migration
-- to align environments and as a marker for rollout.

CREATE INDEX IF NOT EXISTS "AgencyAsset_kind_idx" ON "AgencyAsset"("kind");

