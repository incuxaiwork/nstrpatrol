-- CreateTable
CREATE TABLE "MovementModeReading" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patrolId" TEXT NOT NULL,

    CONSTRAINT "MovementModeReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovementModeReading_patrolId_timestamp_idx" ON "MovementModeReading"("patrolId", "timestamp");

-- AddForeignKey
ALTER TABLE "MovementModeReading" ADD CONSTRAINT "MovementModeReading_patrolId_fkey" FOREIGN KEY ("patrolId") REFERENCES "Patrol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
