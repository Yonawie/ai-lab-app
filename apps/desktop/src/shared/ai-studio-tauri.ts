import { invoke, isTauri } from "@tauri-apps/api/core";

export type AiStudioProjectType = "mini_game" | "interactive_story" | "assistant_tool";

export type AiStudioGenerationResult = {
  projectType: AiStudioProjectType;
  goal: string;
  constraints: string;
  generationRequest: string;
  htmlCode: string;
  cssCode: string;
  jsCode: string;
  modelName: string;
  usingTrainedModel: boolean;
};

export type AiStudioProjectVersion = {
  versionId: string;
  projectId: string;
  projectType: AiStudioProjectType;
  goal: string;
  constraints: string;
  generationRequest: string;
  htmlCode: string;
  cssCode: string;
  jsCode: string;
  modelName: string | null;
  createdAt: string;
};

export type AiStudioProjectExport = {
  exportDir: string;
  indexHtmlPath: string;
  styleCssPath: string;
  scriptJsPath: string;
  readmePath: string;
};

type Obj = Record<string, unknown>;

function asObject(raw: unknown, message: string): Obj {
  if (!raw || typeof raw !== "object") {
    throw new Error(message);
  }
  return raw as Obj;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseVersion(raw: unknown): AiStudioProjectVersion {
  const o = asObject(raw, "Пустая запись AI Studio.");
  return {
    versionId: asString(o.versionId ?? o.version_id),
    projectId: asString(o.projectId ?? o.project_id),
    projectType: asString(o.projectType ?? o.project_type) as AiStudioProjectType,
    goal: asString(o.goal),
    constraints: asString(o.constraints),
    generationRequest: asString(o.generationRequest ?? o.generation_request),
    htmlCode: asString(o.htmlCode ?? o.html_code),
    cssCode: asString(o.cssCode ?? o.css_code),
    jsCode: asString(o.jsCode ?? o.js_code),
    modelName: asString(o.modelName ?? o.model_name).trim() || null,
    createdAt: asString(o.createdAt ?? o.created_at),
  };
}

export async function generateAiStudioProject(input: {
  studentEmail: string;
  projectType: AiStudioProjectType;
  goal: string;
  constraints?: string;
  improvementRequest?: string;
  previousHtml?: string;
  previousCss?: string;
  previousJs?: string;
}): Promise<AiStudioGenerationResult> {
  if (!isTauri()) {
    throw new Error("AI Studio доступен только в desktop-сборке Tauri.");
  }
  const raw = await invoke<unknown>("generate_ai_studio_project_cmd", {
    studentEmail: input.studentEmail.trim(),
    projectType: input.projectType,
    goal: input.goal.trim(),
    constraints: input.constraints?.trim() || null,
    improvementRequest: input.improvementRequest?.trim() || null,
    previousHtml: input.previousHtml ?? null,
    previousCss: input.previousCss ?? null,
    previousJs: input.previousJs ?? null,
  });
  const o = asObject(raw, "Пустой ответ AI Studio.");
  return {
    projectType: asString(o.projectType ?? o.project_type) as AiStudioProjectType,
    goal: asString(o.goal),
    constraints: asString(o.constraints),
    generationRequest: asString(o.generationRequest ?? o.generation_request),
    htmlCode: asString(o.htmlCode ?? o.html_code),
    cssCode: asString(o.cssCode ?? o.css_code),
    jsCode: asString(o.jsCode ?? o.js_code),
    modelName: asString(o.modelName ?? o.model_name, "qwen3:8b"),
    usingTrainedModel: Boolean(o.usingTrainedModel ?? o.using_trained_model),
  };
}

export async function saveAiStudioProjectVersion(input: {
  studentEmail: string;
  projectId?: string | null;
  projectType: AiStudioProjectType;
  goal: string;
  constraints?: string;
  generationRequest: string;
  htmlCode: string;
  cssCode: string;
  jsCode: string;
  modelName?: string | null;
}): Promise<AiStudioProjectVersion> {
  if (!isTauri()) {
    throw new Error("Сохранение AI Studio доступно только в desktop-сборке Tauri.");
  }
  const raw = await invoke<unknown>("save_ai_studio_project_version_cmd", {
    studentEmail: input.studentEmail.trim(),
    projectId: input.projectId?.trim() || null,
    projectType: input.projectType,
    goal: input.goal.trim(),
    constraints: input.constraints?.trim() || null,
    generationRequest: input.generationRequest.trim(),
    htmlCode: input.htmlCode,
    cssCode: input.cssCode,
    jsCode: input.jsCode,
    modelName: input.modelName?.trim() || null,
  });
  return parseVersion(raw);
}

export async function fetchAiStudioProjectVersions(
  studentEmail: string,
  limit = 12,
): Promise<AiStudioProjectVersion[]> {
  if (!isTauri() || !studentEmail.trim()) {
    return [];
  }
  const raw = await invoke<unknown[]>("list_ai_studio_project_versions_cmd", {
    studentEmail: studentEmail.trim(),
    limit,
  });
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(parseVersion);
}

export async function exportAiStudioProject(input: {
  studentEmail: string;
  projectId?: string | null;
  projectType: AiStudioProjectType;
  goal: string;
  constraints?: string;
  generationRequest: string;
  htmlCode: string;
  cssCode: string;
  jsCode: string;
  modelName?: string | null;
}): Promise<AiStudioProjectExport> {
  if (!isTauri()) {
    throw new Error("Экспорт проекта доступен только в настольном приложении.");
  }
  const raw = await invoke<unknown>("export_ai_studio_project_cmd", {
    studentEmail: input.studentEmail.trim(),
    projectId: input.projectId?.trim() || null,
    projectType: input.projectType,
    goal: input.goal.trim(),
    constraints: input.constraints?.trim() || null,
    generationRequest: input.generationRequest.trim(),
    htmlCode: input.htmlCode,
    cssCode: input.cssCode,
    jsCode: input.jsCode,
    modelName: input.modelName?.trim() || null,
  });
  const o = asObject(raw, "Пустой ответ экспорта проекта.");
  return {
    exportDir: asString(o.exportDir ?? o.export_dir),
    indexHtmlPath: asString(o.indexHtmlPath ?? o.index_html_path),
    styleCssPath: asString(o.styleCssPath ?? o.style_css_path),
    scriptJsPath: asString(o.scriptJsPath ?? o.script_js_path),
    readmePath: asString(o.readmePath ?? o.readme_path),
  };
}
