-- CreateTable
CREATE TABLE "TGChat" (
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TGChat_pkey" PRIMARY KEY ("chatId")
);
