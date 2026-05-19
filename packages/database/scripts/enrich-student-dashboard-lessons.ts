/**
 * Merges `content` + `contentSections` from templates into apps/desktop JSON.
 * Run: pnpm exec tsx scripts/enrich-student-dashboard-lessons.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLessonSnapshotContent } from "../src/student-lesson-content";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(
  __dirname,
  "../../../apps/desktop/public/data/student-dashboard.json",
);

const raw = readFileSync(JSON_PATH, "utf8");
const data = JSON.parse(raw) as {
  lessons: Array<{ title: string; description: string }>;
};

for (const lesson of data.lessons) {
  const built = buildLessonSnapshotContent(lesson.title, lesson.description);
  Object.assign(lesson, built);
}

writeFileSync(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Updated ${JSON_PATH}`);
