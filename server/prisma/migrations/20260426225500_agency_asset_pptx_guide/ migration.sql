-- No schema change required:
-- AgencyAsset.kind is a string and already supports adding new kinds like "pptx_guide".
-- This no-op migration exists to keep deploys safe and documented.

SELECT 1;

