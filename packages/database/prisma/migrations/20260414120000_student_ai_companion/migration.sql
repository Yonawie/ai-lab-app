-- CreateTable
CREATE TABLE "StudentAICompanion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "personalityType" TEXT NOT NULL,
    "logic" INTEGER NOT NULL DEFAULT 5,
    "creativity" INTEGER NOT NULL DEFAULT 5,
    "empathy" INTEGER NOT NULL DEFAULT 5,
    "focus" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentAICompanion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentAICompanion_studentId_key" ON "StudentAICompanion"("studentId");
