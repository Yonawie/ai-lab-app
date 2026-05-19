-- CreateTable
CREATE TABLE "ChatTrainingInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentMessage" TEXT NOT NULL,
    "aiAnswer" TEXT NOT NULL,
    "answerQuality" INTEGER NOT NULL,
    "studentImprovement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatTrainingInteraction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChatTrainingInteraction_studentId_createdAt_idx" ON "ChatTrainingInteraction"("studentId", "createdAt");
