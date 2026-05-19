import type { AiStudioProjectVersion } from "@/shared/ai-studio-tauri";
import { routes } from "@/shared/routes";
import type { StudentTrainingPipelineStatus } from "@/shared/training-pipeline-tauri";
import type { StudentAiPrimaryAction, StudentAiProofLoop } from "../my-ai/student-ai-domain";
import type { EvaluationSummaryReadModel } from "./evaluation-summary-read-model";
import { studentArenaScreenPath } from "../student-surface-paths";

function doneStep(
  id: StudentAiProofLoop["steps"][number]["id"],
  title: string,
  detail: string,
): StudentAiProofLoop["steps"][number] {
  return { id, title, detail, status: "done" };
}

function nextStep(
  id: StudentAiProofLoop["steps"][number]["id"],
  title: string,
  detail: string,
): StudentAiProofLoop["steps"][number] {
  return { id, title, detail, status: "next" };
}

function waitingStep(
  id: StudentAiProofLoop["steps"][number]["id"],
  title: string,
  detail: string,
): StudentAiProofLoop["steps"][number] {
  return { id, title, detail, status: "waiting" };
}

function action(title: string, body: string, label: string, href: string): StudentAiPrimaryAction {
  return {
    title,
    body,
    primaryLabel: label,
    primaryHref: href,
  };
}

export function buildStudentAiProofLoopReadModel(input: {
  pipeline: StudentTrainingPipelineStatus | null;
  evaluation: EvaluationSummaryReadModel;
  latestProject: AiStudioProjectVersion | null;
}): StudentAiProofLoop {
  const { pipeline, evaluation, latestProject } = input;
  const datasetReady = Boolean(pipeline?.exportAvailable);
  const modelReady = Boolean(pipeline?.adapterAvailable && pipeline?.ollamaModelRegistered);
  const active = Boolean(pipeline?.usingTrainedModel);
  const hasCompare = evaluation.compareCount > 0;
  const hasArena = evaluation.benchmarkCount > 0;
  const projectMatchesActive =
    Boolean(latestProject?.modelName?.trim()) &&
    Boolean(pipeline?.activeStudentModelAlias?.trim()) &&
    latestProject?.modelName?.trim() === pipeline?.activeStudentModelAlias?.trim();

  const missingProof: string[] = [];
  if (!datasetReady) missingProof.push("подготовить данные для обучения");
  if (!modelReady) missingProof.push("получить и подключить обученную модель");
  if (!active) missingProof.push("включить обученную модель");
  if (!hasCompare) missingProof.push("проверить изменение в Compare");
  if (!hasArena) missingProof.push("проверить устойчивость в Arena");
  if (!projectMatchesActive) missingProof.push("сохранить проектную версию на активной модели");

  const steps: StudentAiProofLoop["steps"] = [
    datasetReady
      ? doneStep("dataset", "Данные", `${pipeline?.exportTotalRows ?? 0} примеров готовы для обучения.`)
      : nextStep("dataset", "Данные", "Собери и подготовь примеры обучения."),
    modelReady
      ? doneStep(
          "model",
          "Версия модели",
          pipeline?.activeStudentModelAlias
            ? `Подключена модель ${pipeline.activeStudentModelAlias}.`
            : "Обученная модель подключена.",
        )
      : datasetReady
        ? nextStep("model", "Версия модели", "Запусти обучение и подключи полученную модель.")
        : waitingStep("model", "Версия модели", "Сначала нужны подготовленные данные."),
    active
      ? doneStep("activation", "Включение", "Обученная модель используется для новых ответов.")
      : modelReady
        ? nextStep("activation", "Включение", "Сделай обученную модель активной.")
        : waitingStep("activation", "Включение", "Сначала подключи обученную модель."),
    hasCompare && hasArena
      ? doneStep("evaluation", "Проверка", "Есть Compare и Arena: изменение проверено на одном запросе и на задачах.")
      : active && hasCompare
        ? nextStep("evaluation", "Проверка", "Compare уже есть. Теперь проверь устойчивость в Arena.")
        : active
          ? nextStep("evaluation", "Проверка", "Начни с Compare, затем переходи в Arena.")
          : waitingStep("evaluation", "Проверка", "Сначала включи обученную модель."),
    projectMatchesActive
      ? doneStep("project", "Применение", "AI Studio уже сохранила проект на активной модели.")
      : active
        ? nextStep("project", "Применение", "Собери или обнови проект в AI Studio на активной модели.")
        : waitingStep("project", "Применение", "Проект лучше собирать после включения своей модели."),
  ];

  let nextProofAction: StudentAiPrimaryAction;
  if (!datasetReady) {
    nextProofAction = action(
      "Подготовь данные",
      "Сначала собери примеры обучения в один набор данных.",
      "Тренируем",
      routes.studentTrainingManager,
    );
  } else if (!modelReady) {
    nextProofAction = action(
      "Обучи и подключи модель",
      "Данные готовы. Следующий шаг — получить обученную версию и подключить ее.",
      "Обучить модель",
      routes.studentTrainingManager,
    );
  } else if (!active) {
    nextProofAction = action(
      "Включи модель",
      "Модель подключена, но еще не используется для новых ответов.",
      "Включить модель",
      routes.studentTrainingManager,
    );
  } else if (!hasCompare) {
    nextProofAction = action(
      "Докажи изменение",
      "Проверь на одном запросе, изменилось ли поведение модели.",
      "Compare",
      routes.studentModelCompare,
    );
  } else if (!hasArena) {
    nextProofAction = action(
      "Проверь устойчивость",
      "Compare уже есть. Теперь проверь модель на наборе задач в Arena.",
      "Arena",
      studentArenaScreenPath,
    );
  } else if (!projectMatchesActive) {
    nextProofAction = action(
      "Примени модель в проекте",
      "Проверки есть. Теперь собери проектную версию на активной модели.",
      "AI Studio",
      routes.studentAiStudio,
    );
  } else {
    nextProofAction = action(
      "Начни следующий цикл улучшения",
      "Полный proof loop закрыт. Выбери новое слабое место и улучши модель дальше.",
      "AI Clinic",
      routes.studentAiClinic,
    );
  }

  return {
    headline:
      missingProof.length === 0
        ? "Полный цикл доказательства закрыт: данные, модель, проверки и проект связаны."
        : `До полного proof loop осталось: ${missingProof.join(", ")}.`,
    steps,
    missingProof,
    nextProofAction,
  };
}
