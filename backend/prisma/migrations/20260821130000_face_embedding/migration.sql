-- On-device face matching: reference embedding (CSV of floats) stored per device,
-- plus the latest similarity score recorded at enrollment / patrol start.
ALTER TABLE "Device" ADD COLUMN "faceEmbedding" TEXT,
ADD COLUMN "lastMatchScore" DOUBLE PRECISION;
ALTER TABLE "Patrol" ADD COLUMN "faceMatchScore" DOUBLE PRECISION;
