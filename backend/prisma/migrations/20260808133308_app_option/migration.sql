-- CreateTable
CREATE TABLE "AppOption" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppOption_pkey" PRIMARY KEY ("key")
);
