-- CreateTable
CREATE TABLE "ModelProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "datasetSize" INTEGER NOT NULL DEFAULT 0,
    "accuracy" REAL NOT NULL DEFAULT 0,
    "lastTrainedAt" DATETIME,
    CONSTRAINT "ModelProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "modelProfileId" TEXT NOT NULL,
    "examplesUsed" INTEGER NOT NULL,
    "accuracyBefore" REAL NOT NULL,
    "accuracyAfter" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingRun_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingRun_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "ModelProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelProfile_studentId_key" ON "ModelProfile"("studentId");

-- CreateIndex
CREATE INDEX "TrainingRun_studentId_createdAt_idx" ON "TrainingRun"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingRun_modelProfileId_createdAt_idx" ON "TrainingRun"("modelProfileId", "createdAt");
