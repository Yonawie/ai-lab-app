-- CreateTable
CREATE TABLE "DatasetExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "isCorrect" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatasetExample_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DatasetExample_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DatasetExample_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DatasetExample_studentId_createdAt_idx" ON "DatasetExample"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DatasetExample_lessonId_taskType_idx" ON "DatasetExample"("lessonId", "taskType");

-- CreateIndex
CREATE INDEX "DatasetExample_taskId_isCorrect_idx" ON "DatasetExample"("taskId", "isCorrect");

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "taskType" TEXT NOT NULL DEFAULT 'classification';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "promptText" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "optionsJson" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "correctAnswer" TEXT;
