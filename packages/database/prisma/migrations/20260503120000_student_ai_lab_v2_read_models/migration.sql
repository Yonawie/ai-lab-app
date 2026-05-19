-- Student AI Lab V2 read/write tables.
-- These mirror the local Tauri tables so Prisma, migrations, and the desktop app
-- describe the same student-owned AI lifecycle.

CREATE TABLE IF NOT EXISTS "StudentOllamaModelRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "baseModel" TEXT NOT NULL,
    "adapterPath" TEXT NOT NULL,
    "ollamaModelAlias" TEXT NOT NULL,
    "modelfilePath" TEXT NOT NULL,
    "trainingSummaryPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentOllamaModelRef_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentTrainingExportRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "datasetJsonlPath" TEXT NOT NULL,
    "metadataJsonPath" TEXT NOT NULL,
    "datasetExampleRows" INTEGER NOT NULL,
    "promptExperimentRows" INTEGER NOT NULL,
    "chatTrainingRows" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentTrainingExportRef_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentModelUsagePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "useTrainedModel" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentModelUsagePreference_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentArtifactLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentArtifactLedger_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentCompareRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "baseModel" TEXT NOT NULL,
    "trainedModelName" TEXT,
    "trainedAvailable" BOOLEAN NOT NULL DEFAULT false,
    "baseOutput" TEXT NOT NULL,
    "trainedOutput" TEXT,
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL DEFAULT '',
    "categoryTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentCompareRun_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentBenchmarkRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "benchmarkMissionId" TEXT NOT NULL,
    "benchmarkTitle" TEXT NOT NULL,
    "benchmarkCategory" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "primaryModelName" TEXT NOT NULL,
    "secondaryModelName" TEXT,
    "primaryOutput" TEXT NOT NULL,
    "secondaryOutput" TEXT,
    "resultWinner" TEXT NOT NULL,
    "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL DEFAULT '',
    "opponentStudentEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentBenchmarkRun_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentPairwisePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "leftModelName" TEXT NOT NULL,
    "rightModelName" TEXT NOT NULL,
    "leftOutput" TEXT NOT NULL,
    "rightOutput" TEXT NOT NULL,
    "chosenWinner" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "sourceSurface" TEXT NOT NULL DEFAULT 'compare',
    "compareRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentPairwisePreference_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StudentAiStudioProjectVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "constraintsText" TEXT NOT NULL DEFAULT '',
    "generationRequest" TEXT NOT NULL DEFAULT '',
    "htmlCode" TEXT NOT NULL,
    "cssCode" TEXT NOT NULL DEFAULT '',
    "jsCode" TEXT NOT NULL DEFAULT '',
    "modelName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentAiStudioProjectVersion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentOllamaModelRef_studentId_key" ON "StudentOllamaModelRef"("studentId");
CREATE INDEX IF NOT EXISTS "StudentOllamaModelRef_studentId_idx" ON "StudentOllamaModelRef"("studentId");
CREATE INDEX IF NOT EXISTS "StudentOllamaModelRef_ollamaModelAlias_idx" ON "StudentOllamaModelRef"("ollamaModelAlias");

CREATE UNIQUE INDEX IF NOT EXISTS "StudentTrainingExportRef_studentId_key" ON "StudentTrainingExportRef"("studentId");
CREATE INDEX IF NOT EXISTS "StudentTrainingExportRef_studentId_idx" ON "StudentTrainingExportRef"("studentId");

CREATE UNIQUE INDEX IF NOT EXISTS "StudentModelUsagePreference_studentId_key" ON "StudentModelUsagePreference"("studentId");
CREATE INDEX IF NOT EXISTS "StudentModelUsagePreference_studentId_idx" ON "StudentModelUsagePreference"("studentId");

CREATE INDEX IF NOT EXISTS "StudentArtifactLedger_studentId_idx" ON "StudentArtifactLedger"("studentId");
CREATE INDEX IF NOT EXISTS "StudentArtifactLedger_artifactType_idx" ON "StudentArtifactLedger"("artifactType");
CREATE INDEX IF NOT EXISTS "StudentArtifactLedger_createdAt_idx" ON "StudentArtifactLedger"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "StudentCompareRun_studentId_idx" ON "StudentCompareRun"("studentId");
CREATE INDEX IF NOT EXISTS "StudentCompareRun_createdAt_idx" ON "StudentCompareRun"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "StudentBenchmarkRun_studentId_idx" ON "StudentBenchmarkRun"("studentId");
CREATE INDEX IF NOT EXISTS "StudentBenchmarkRun_createdAt_idx" ON "StudentBenchmarkRun"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "StudentPairwisePreference_studentId_idx" ON "StudentPairwisePreference"("studentId");
CREATE INDEX IF NOT EXISTS "StudentPairwisePreference_createdAt_idx" ON "StudentPairwisePreference"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "StudentAiStudioProjectVersion_studentId_idx" ON "StudentAiStudioProjectVersion"("studentId");
CREATE INDEX IF NOT EXISTS "StudentAiStudioProjectVersion_projectId_idx" ON "StudentAiStudioProjectVersion"("projectId");
CREATE INDEX IF NOT EXISTS "StudentAiStudioProjectVersion_createdAt_idx" ON "StudentAiStudioProjectVersion"("createdAt" DESC);
