-- AlterTable
ALTER TABLE "Device" ADD COLUMN "faceVerifiedAt" TIMESTAMP(3),
ADD COLUMN "facePhotoKey" TEXT,
ADD COLUMN "verificationMode" TEXT,
ADD COLUMN "verifiedByUserId" TEXT;
