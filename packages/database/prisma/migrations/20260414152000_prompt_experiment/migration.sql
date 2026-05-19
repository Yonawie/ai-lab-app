-- CreateTable
CREATE TABLE "PromptExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "weakPrompt" TEXT NOT NULL,
    "weakOutput" TEXT NOT NULL,
    "improvedPrompt" TEXT NOT NULL,
    "improvedOutput" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptExperiment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PromptExperiment_studentId_createdAt_idx" ON "PromptExperiment"("studentId", "createdAt");
