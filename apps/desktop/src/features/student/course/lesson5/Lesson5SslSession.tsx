import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchStudentArtifactSummary, type StudentArtifactSummary } from "@/shared/artifact-ledger-tauri";
import { fetchLessonCompanionReflection } from "@/shared/lesson-companion-tauri";
import { routes } from "@/shared/routes";
import type { Lesson, LessonSectionType } from "../training-course-model";
import type courseCss from "../../StudentCourse.module.css";
import { LessonCompanionVoiceBlock } from "../LessonCompanionVoiceBlock";
import {
  CONTEXT_QUALITY_LABEL,
  LAB_OUTPUT_STRONG,
  LAB_OUTPUT_WEAK,
  LAB_PROMPT_CONTEXT_BRIDGE,
  LAB_STRONG_HINTS,
  LAB_STRONG_TEMPLATE,
  LAB_WEAK_PROMPT,
  L5_DEMO_CASES,
  L5_FINAL_TASKS,
  THOUGHT_ROUNDS,
} from "./l5-data";
import l5 from "./Lesson5Ssl.module.css";

type Props = {
  lesson: Lesson;
  courseStyles: typeof courseCss;
  sectionCardClass: (t: LessonSectionType) => string;
  done: boolean;
  onMarkComplete: () => void;
  studentEmail?: string;
};

const INTRO_PHASES = [
  {
    key: "p1",
    body: "В самообучении модель не ждёт человека с готовыми метками: она вытаскивает учебную задачу из самого текста и учится предсказывать пропуск, следующее слово или продолжение абзаца.",
  },
  {
    key: "p2",
    body: "Сигнал для обучения строится из структуры данных: порядок токенов, контекст и повторяющиеся шаблоны. На инференсе языковая модель тоже видит только окно текста, и от него зависит следующее продолжение.",
  },
  {
    key: "p3",
    body: "Большие чат-модели сильны в том числе потому, что много раз проходили через задачу предсказания следующего фрагмента. Чем богаче контекст и понятнее инструкция, тем устойчивее ответ.",
  },
];

const INTRO_MAX = 4;
const REQUIRED_PROMPT_EXPERIMENTS = 3;
const REQUIRED_COMPARE_RUNS = 1;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function labGenerationQuality(prompt: string): "strong" | "weak" {
  const p = prompt.trim().toLowerCase();
  if (!p) return "weak";
  if (p.length > 110) return "strong";
  if (LAB_STRONG_HINTS.some((h) => p.includes(h))) return "strong";
  if (prompt.trim() === LAB_STRONG_TEMPLATE.trim()) return "strong";
  return "weak";
}

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function Lesson5SslSession({
  lesson,
  courseStyles: cs,
  sectionCardClass,
  done,
  onMarkComplete,
  studentEmail = "",
}: Props) {
  const [introStep, setIntroStep] = useState(0);
  const [demoShown, setDemoShown] = useState<Record<string, boolean>>({});

  const [roundIdx, setRoundIdx] = useState(0);
  const [phase, setPhase] = useState<"choose" | "compare">("choose");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bestPicks, setBestPicks] = useState(0);
  const [coherence, setCoherence] = useState(46);
  const [structure, setStructure] = useState(48);
  const [contextDrillDone, setContextDrillDone] = useState(false);

  const [labDraft, setLabDraft] = useState(LAB_WEAK_PROMPT);
  const [labOut, setLabOut] = useState<string | null>(null);
  const [labOllamaOut, setLabOllamaOut] = useState<string | null>(null);
  const [labOllamaLoading, setLabOllamaLoading] = useState(false);
  const [roundOllamaTail, setRoundOllamaTail] = useState<string | null>(null);
  const [roundOllamaLoading, setRoundOllamaLoading] = useState(false);
  const [demoAiText, setDemoAiText] = useState<string | null>(null);
  const [demoAiLoading, setDemoAiLoading] = useState(false);

  const [finalSolved, setFinalSolved] = useState(() => Array(L5_FINAL_TASKS.length).fill(false));
  const [finalFeedback, setFinalFeedback] = useState<(string | null)[]>(() =>
    Array(L5_FINAL_TASKS.length).fill(null),
  );
  const [finalTypeDraft, setFinalTypeDraft] = useState("");
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);

  const student = studentEmail.trim();

  const showDemo = useCallback((id: string) => {
    setDemoShown((current) => ({ ...current, [id]: true }));
  }, []);

  const round = THOUGHT_ROUNDS[roundIdx];
  const selectedChoice = useMemo(
    () => round?.choices.find((choice) => choice.id === selectedId) ?? null,
    [round, selectedId],
  );
  const lastL5Demo = useMemo(
    () => [...L5_DEMO_CASES].reverse().find((item) => demoShown[item.id]),
    [demoShown],
  );

  useEffect(() => {
    if (!student) {
      setArtifactSummary(null);
      return;
    }
    let cancelled = false;
    void fetchStudentArtifactSummary(student)
      .then((summary) => {
        if (!cancelled) {
          setArtifactSummary(summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArtifactSummary(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [student]);

  useEffect(() => {
    if (!student || !lastL5Demo) return;
    let cancelled = false;
    setDemoAiLoading(true);
    void (async () => {
      const text = await fetchLessonCompanionReflection({
        studentEmail: student,
        lessonKey: "l5",
        lessonTitle: lesson.title,
        scene: "ssl_demo_weak",
        stateSummary: `Сетап: ${lastL5Demo.setup.slice(0, 220)}. Слабый вывод: ${lastL5Demo.aiWrong.slice(0, 220)}`,
      });
      if (!cancelled) {
        setDemoAiText(text);
        setDemoAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastL5Demo, lesson.title, student]);

  useEffect(() => {
    if (!student || phase !== "compare" || !round || !selectedChoice) return;
    let cancelled = false;
    setRoundOllamaLoading(true);
    void (async () => {
      const body = [
        "Контекст, который видит модель:",
        round.modelSees,
        "",
        "Задание:",
        round.stem,
        "",
        "Выбор студента:",
        selectedChoice.text,
        "",
        "Сгенерируй одно короткое русскоязычное продолжение в том же стиле, не копируя эталон дословно.",
      ].join("\n");
      const text = await fetchLessonCompanionReflection({
        studentEmail: student,
        lessonKey: "l5",
        lessonTitle: lesson.title,
        scene: "ssl_round_tail",
        stateSummary: body,
        plainCompletion: true,
      });
      if (!cancelled) {
        setRoundOllamaTail(text);
        setRoundOllamaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lesson.title, phase, round, selectedChoice, student]);

  const onPickChoice = (id: string) => {
    if (contextDrillDone || phase !== "choose") return;
    setSelectedId(id);
  };

  const onCompare = () => {
    if (contextDrillDone || phase !== "choose" || !selectedChoice) return;
    setRoundOllamaTail(null);
    if (selectedChoice.isBest) {
      setBestPicks((value) => value + 1);
      setCoherence((value) => clamp(value + 4, 0, 100));
      setStructure((value) => clamp(value + 3, 0, 100));
    } else {
      setCoherence((value) => clamp(value - 1, 0, 100));
      setStructure((value) => clamp(value - 1, 0, 100));
    }
    setPhase("compare");
  };

  const onNextRound = () => {
    if (contextDrillDone || phase !== "compare" || roundOllamaLoading) return;
    if (roundIdx >= THOUGHT_ROUNDS.length - 1) {
      setContextDrillDone(true);
      return;
    }
    setRoundIdx((value) => value + 1);
    setPhase("choose");
    setSelectedId(null);
    setRoundOllamaTail(null);
  };

  const onLabGenerate = () => {
    const quality = labGenerationQuality(labDraft);
    setLabOut(quality === "strong" ? LAB_OUTPUT_STRONG : LAB_OUTPUT_WEAK);

    if (!student) {
      setLabOllamaOut(null);
      return;
    }

    setLabOllamaLoading(true);
    void (async () => {
      const body = [
        "Промпт студента:",
        labDraft.trim().slice(0, 1800),
        "",
        "Дай короткий русскоязычный ответ так, как ответила бы локальная учебная языковая модель с этим промптом (1-3 предложения).",
      ].join("\n");
      const text = await fetchLessonCompanionReflection({
        studentEmail: student,
        lessonKey: "l5",
        lessonTitle: lesson.title,
        scene: "ssl_prompt_lab",
        stateSummary: body,
        plainCompletion: true,
      });
      setLabOllamaOut(text);
      setLabOllamaLoading(false);
    })();
  };

  const onFinalPick = (index: number, optionId: string) => {
    if (finalSolved[index]) return;
    const task = L5_FINAL_TASKS[index];
    if (task.kind !== "pick" || !task.correctOptionId) return;
    if (optionId !== task.correctOptionId) {
      setFinalFeedback((current) => {
        const next = [...current];
        next[index] = task.explanationWrong;
        return next;
      });
      return;
    }
    setFinalFeedback((current) => {
      const next = [...current];
      next[index] = task.explanationOk;
      return next;
    });
    setFinalSolved((current) => {
      const next = [...current];
      next[index] = true;
      return next;
    });
  };

  const onFinalTypeSubmit = (index: number) => {
    if (finalSolved[index]) return;
    const task = L5_FINAL_TASKS[index];
    if (task.kind !== "type" || !task.acceptSubstrings?.length) return;
    const normalized = normalizeAnswer(finalTypeDraft);
    const ok = task.acceptSubstrings.some((item) => normalized.includes(item.toLowerCase()));
    if (!ok) {
      setFinalFeedback((current) => {
        const next = [...current];
        next[index] = task.explanationWrong;
        return next;
      });
      return;
    }
    setFinalFeedback((current) => {
      const next = [...current];
      next[index] = task.explanationOk;
      return next;
    });
    setFinalSolved((current) => {
      const next = [...current];
      next[index] = true;
      return next;
    });
  };

  const allFinalSolved = finalSolved.every(Boolean);
  const promptExperimentCount = artifactSummary?.countsByType?.prompt_experiment_saved ?? 0;
  const compareRunCount = artifactSummary?.countsByType?.compare_run_completed ?? 0;
  const artifactMissionReady =
    promptExperimentCount >= REQUIRED_PROMPT_EXPERIMENTS &&
    compareRunCount >= REQUIRED_COMPARE_RUNS;
  const legacyLessonReady = contextDrillDone && allFinalSolved;
  const canFinishLesson = artifactMissionReady || legacyLessonReady;
  const total = lesson.sections.length;

  const tierLabel = (tier: 1 | 2 | 3) =>
    tier === 1
      ? "Уровень 1 · простые хвосты"
      : tier === 2
        ? "Уровень 2 · диалог и план"
        : "Уровень 3 · плотный смысл";

  const pillForRound = (value: (typeof THOUGHT_ROUNDS)[number]) =>
    value.isContextDemo ? "Контекст · контраст" : tierLabel(value.tier);

  return (
    <>
      <div className={cs.sectionsStack}>
        {lesson.sections.map((section, index) => {
          const head = (
            <div className={cs.sectionHead}>
              <h2 id={`heading-${section.id}`} className={cs.sectionTitle}>
                {section.title}
              </h2>
              <span className={cs.sectionStep}>Шаг {index + 1}/{total}</span>
            </div>
          );

          if (section.type === "intro") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("intro")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l5.l5Block}>
                  {introStep === 0 ? (
                    <div className={l5.l5Cinematic}>
                      <p className={l5.l5Overline}>Миссия 5 · контекст и prompt</p>
                      <h3 className={l5.l5Title}>Реши: чинить запросом или обучением</h3>
                      <p className={l5.l5Narrative}>
                        Ты проверяешь, хватает ли модели контекста в запросе. Если хватает — улучшаем prompt.
                        Если ошибка повторяется — готовим новый пример обучения.
                      </p>
                      <p className={l5.l5Narrative}>
                        Маршрут: добавь контекст → запусти реальный ответ → сравни результат → реши,
                        чинить это prompt-ом или новым примером обучения.
                      </p>
                      <div className={l5.missionGrid}>
                        <div className={l5.missionCard}>
                          <strong>Что ты делаешь</strong>
                          <span>Исследуешь, как контекст и формулировка запроса меняют ответ модели.</span>
                        </div>
                        <div className={l5.missionCard}>
                          <strong>Реальный результат</strong>
                          <span>
                            Нужно сохранить {REQUIRED_PROMPT_EXPERIMENTS} эксперимента в Prompt Lab и {REQUIRED_COMPARE_RUNS} проверку в Compare.
                          </span>
                        </div>
                        <div className={l5.missionCard}>
                          <strong>Что подтверждает результат</strong>
                          <span>сохранённые эксперименты в Prompt Lab и проверка результата в Compare</span>
                        </div>
                        <div className={l5.missionCard}>
                          <strong>Главное решение</strong>
                          <span>Эту проблему чинит prompt, контекст или новый пример обучения?</span>
                        </div>
                      </div>
                      <div className={l5.l5BtnRow}>
                        <button type="button" className={l5.btnPrimary} onClick={() => setIntroStep(1)}>
                          Начать миссию
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {INTRO_PHASES.slice(0, Math.min(introStep, INTRO_PHASES.length)).map((item) => (
                        <div key={item.key} className={l5.l5Cinematic}>
                          <p className={l5.l5Narrative}>{item.body}</p>
                        </div>
                      ))}
                      {introStep >= INTRO_MAX ? (
                        <p className={l5.l5Narrative}>
                          Дальше — короткая демонстрация ошибок контекста, тренировка выбора и реальная проверка
                          через Prompt Lab / Compare.
                        </p>
                      ) : null}
                      <div className={l5.l5BtnRow}>
                        {introStep < INTRO_MAX ? (
                          <>
                            <button
                              type="button"
                              className={l5.btnPrimary}
                              onClick={() => setIntroStep((value) => Math.min(INTRO_MAX, value + 1))}
                            >
                              Далее
                            </button>
                            {introStep > 1 ? (
                              <button
                                type="button"
                                className={l5.btnGhost}
                                onClick={() => setIntroStep((value) => Math.max(1, value - 1))}
                              >
                                Назад
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          }

          if (section.type === "demo") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("demo")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l5.ruleCallout}>
                  Это не про то, что модель "глупая". Это про то, что при слабом контексте даже нормальная модель хуже
                  предсказывает следующий фрагмент текста. Эти кейсы подготавливают тебя к реальному эксперименту с промптом.
                </div>
                <div className={l5.l5Block}>
                  {L5_DEMO_CASES.map((item) => {
                    const open = demoShown[item.id];
                    return (
                      <div key={item.id} className={l5.demoCard}>
                        <p className={l5.demoKind}>{item.title}</p>
                        <p className={l5.l5Narrative}>{item.setup}</p>
                        {!open ? (
                          <button type="button" className={l5.btnGhost} onClick={() => showDemo(item.id)}>
                            Показать слабый вывод
                          </button>
                        ) : (
                          <p className={l5.l5Narrative} style={{ marginTop: "0.45rem" }}>
                            <strong>Слабый вывод:</strong> {item.aiWrong}
                            <br />
                            <br />
                            {item.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <LessonCompanionVoiceBlock
                  courseStyles={cs}
                  label="Твой AI комментирует:"
                  text={demoAiText}
                  loading={demoAiLoading}
                />
              </article>
            );
          }

          if (section.type === "gameplay") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("gameplay")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l5.sectionMission}>
                  <strong>Тренировка контекста</strong>
                  <span>
                    Этот блок помогает увидеть, как бедный и богатый контекст меняют продолжение. Главный результат
                    появится позже в Prompt Lab и Compare.
                  </span>
                </div>
                {!contextDrillDone && round ? (
                  <div className={`${l5.chatTrainer} ${l5.chatTrainerDark}`}>
                    <div className={l5.miniHud}>
                      <div className={l5.miniMeter}>
                        <div className={l5.miniMeterLabel}>Связность</div>
                        <div className={l5.miniTrack}>
                          <div className={`${l5.miniFill} ${l5.fillCoh}`} style={{ width: `${coherence}%` }} />
                        </div>
                        <span className={l5.l5Narrative} style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                          {coherence}%
                        </span>
                      </div>
                      <div className={l5.miniMeter}>
                        <div className={l5.miniMeterLabel}>Структура</div>
                        <div className={l5.miniTrack}>
                          <div className={`${l5.miniFill} ${l5.fillStr}`} style={{ width: `${structure}%` }} />
                        </div>
                        <span className={l5.l5Narrative} style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                          {structure}%
                        </span>
                      </div>
                    </div>

                    <div className={l5.chatPad}>
                      <span className={l5.tierPill}>{pillForRound(round)}</span>
                      <p className={l5.l5Narrative} style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                        Кейс {roundIdx + 1} / {THOUGHT_ROUNDS.length} · что модель видит и как продолжает
                      </p>

                      <div className={l5.contextPanel}>
                        <div className={l5.contextTitle}>Модель видит</div>
                        <p className={l5.contextBody}>{round.modelSees}</p>
                        <p className={l5.contextHint}>
                          {round.hintKind === "continue"
                            ? "Модель должна правдоподобно продолжить мысль."
                            : "Модель должна предсказать следующий фрагмент."}
                        </p>
                        <p
                          className={
                            round.contextStrength === "weak"
                              ? l5.contextRibbonWeak
                              : l5.contextRibbonStrong
                          }
                        >
                          {CONTEXT_QUALITY_LABEL[round.contextStrength]}
                        </p>
                      </div>

                      <p className={l5.stemBubble}>
                        <strong>Задание:</strong> {round.stem}
                      </p>

                      {phase === "choose" ? (
                        <>
                          <p className={l5.l5Narrative} style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                            Выбери наиболее правдоподобное продолжение, а затем сравни его с ответом подключенного AI.
                          </p>
                          {round.choices.map((choice) => (
                            <button
                              key={choice.id}
                              type="button"
                              className={`${l5.choiceBtn} ${selectedId === choice.id ? l5.choiceBtnActive : ""}`}
                              onClick={() => onPickChoice(choice.id)}
                            >
                              {choice.text}
                            </button>
                          ))}
                          <div className={l5.l5BtnRow}>
                            <button
                              type="button"
                              className={l5.btnPrimary}
                              onClick={onCompare}
                              disabled={!selectedId}
                            >
                              Оценить вывод модели
                            </button>
                          </div>
                        </>
                      ) : roundOllamaLoading ? (
                        <div className={l5.genPanel}>
                          <div className={l5.genLabel}>Подключаем реальный ИИ к этому контексту...</div>
                          <span className={l5.typing}>
                            <span className={l5.dot} />
                            <span className={l5.dot} />
                            <span className={l5.dot} />
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className={l5.compareGrid}>
                            <div className={`${l5.compareCard} ${l5.compareYou}`}>
                              <div className={l5.genLabel}>Твой выбор</div>
                              {selectedChoice?.text}
                            </div>
                            <div className={`${l5.compareCard} ${l5.compareAi}`}>
                              <div className={l5.genLabel}>Слабый контекст</div>
                              {round.stem} <em>{round.modelGuess}</em>
                            </div>
                            <div className={`${l5.compareCard} ${l5.compareGold}`} style={{ gridColumn: "1 / -1" }}>
                              <div className={l5.genLabel}>Сильный паттерн</div>
                              {round.stem} <strong>{round.idealLine}</strong>
                            </div>
                          </div>

                          <div
                            className={`${l5.feedback} ${
                              selectedChoice?.isBest ? l5.feedbackOk : l5.feedbackWarn
                            }`}
                          >
                            {round.compareWhy}{" "}
                            <span style={{ opacity: 0.92 }}>
                              Вывод зависит от того, что модель видит в окне контекста: при бедном контексте даже
                              обученная модель чаще промахивается.
                            </span>
                          </div>

                          <LessonCompanionVoiceBlock
                            courseStyles={cs}
                            label="Реальный ИИ продолжает так:"
                            text={roundOllamaTail}
                            loading={false}
                          />

                          <div className={l5.l5BtnRow}>
                            <button type="button" className={l5.btnPrimary} onClick={onNextRound}>
                              {roundIdx >= THOUGHT_ROUNDS.length - 1
                                ? "Завершить контекстный блок"
                                : "Следующий кейс"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={`${l5.feedback} ${l5.feedbackOk}`}>
                    <p className={l5.l5Narrative} style={{ margin: 0 }}>
                      Контекстный блок завершён. Удачных попаданий в лучший вариант: <strong>{bestPicks}</strong> из{" "}
                      {THOUGHT_ROUNDS.length}. Эти цифры полезны для тренировки, но главным подтверждением всё равно
                      считаются сохранённые результаты в Prompt Lab и Compare.
                    </p>
                  </div>
                )}
              </article>
            );
          }

          if (section.type === "lab") {
            const strong = labGenerationQuality(labDraft) === "strong";
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("lab")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l5.sectionMission}>
                  <strong>Главная миссия с реальным ИИ</strong>
                  <span>
                    Здесь ты готовишь формулировку и смотришь на реальный ответ модели. Итог миссии должен быть
                    сохранён в Prompt Lab и затем подтверждён в Compare.
                  </span>
                </div>

                <p className={l5.l5Narrative}>
                  Одна и та же модель может отвечать заметно лучше, если дать ей роль, контекст, формат и ограничения.
                  Проверь, меняется ли качество без переобучения.
                </p>

                <div className={l5.ruleCallout}>{LAB_PROMPT_CONTEXT_BRIDGE}</div>

                <div className={l5.missionGrid}>
                  <div className={l5.missionCard}>
                    <strong>Эксперименты в Prompt Lab</strong>
                    <span>
                      {promptExperimentCount}/{REQUIRED_PROMPT_EXPERIMENTS} сохранено
                    </span>
                  </div>
                  <div className={l5.missionCard}>
                    <strong>Проверка в Compare</strong>
                    <span>
                      {compareRunCount}/{REQUIRED_COMPARE_RUNS} сохранено
                    </span>
                  </div>
                  <div className={l5.missionCard}>
                    <strong>Решение после проверки</strong>
                    <span>Если prompt не помогает стабильно, преврати ошибку в пример обучения.</span>
                  </div>
                </div>

                <div className={l5.actionLinks}>
                  <Link to={routes.studentPromptLab} className={l5.linkButtonPrimary}>
                    Открыть Prompt Lab
                  </Link>
                  <Link to={routes.studentModelCompare} className={l5.linkButtonGhost}>
                    Открыть Compare
                  </Link>
                </div>

                <div className={l5.labSplit}>
                  <div className={l5.labCol}>
                    <strong>Черновик промпта</strong>
                    <textarea
                      className={l5.labTextarea}
                      value={labDraft}
                      onChange={(event) => {
                        setLabDraft(event.target.value);
                        setLabOut(null);
                        setLabOllamaOut(null);
                      }}
                      aria-label="Редактор промпта"
                    />
                    <div className={l5.l5BtnRow}>
                      <button type="button" className={l5.btnGhost} onClick={() => setLabDraft(LAB_WEAK_PROMPT)}>
                        Слабый шаблон
                      </button>
                      <button
                        type="button"
                        className={l5.btnGhost}
                        onClick={() => setLabDraft(LAB_STRONG_TEMPLATE)}
                      >
                        Вставить сильный шаблон
                      </button>
                    </div>
                    <button type="button" className={l5.btnPrimary} onClick={onLabGenerate}>
                      Запустить реальный ответ
                    </button>
                    <p className={l5.l5Narrative} style={{ fontSize: "0.78rem", color: "var(--course-muted)" }}>
                      Это черновик миссии. Полный результат появится после сохранения A/B-эксперимента в Prompt Lab.
                    </p>
                  </div>

                  <div className={l5.labCol}>
                    <strong>Ответ модели</strong>
                    {!labOut ? (
                      <p className={l5.l5Narrative} style={{ marginTop: "0.45rem", color: "var(--course-muted)" }}>
                        Запусти запрос, чтобы увидеть, как текущая формулировка влияет на реальный ответ.
                      </p>
                    ) : (
                      <>
                        <LessonCompanionVoiceBlock
                          courseStyles={cs}
                          label="Реальный ИИ с этим контекстом отвечает так:"
                          text={labOllamaOut}
                          loading={labOllamaLoading}
                        />
                        <p className={l5.l5Narrative} style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
                          Оценка текущего запроса:{" "}
                          <strong>{strong ? "структурированный" : "размытый"}</strong>
                        </p>
                        <div className={l5.labOutput}>{labOut}</div>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "summary") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("summary")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l5.summaryHero}>
                  <h3 className={l5.summaryTitle}>Что эта миссия должна доказать</h3>
                  <ul className={l5.summaryList}>
                    <li>
                      <strong>Контекст важен:</strong> чем богаче видимый модели фрагмент, тем устойчивее
                      продолжение и структура ответа.
                    </li>
                    <li>
                      <strong>Формулировка важна:</strong> роль, формат, длина и ограничения меняют реальный ответ, а
                      не только "красоту формулировки".
                    </li>
                    <li>
                      <strong>Результат миссии:</strong> миссия считается подтверждённой через эксперименты в Prompt Lab и
                      проверки в Compare, а не только через локальное прохождение страницы.
                    </li>
                    <li>
                      <strong>Решение:</strong> если контекст чинит ответ, используй prompt. Если нет — добавь пример обучения.
                    </li>
                  </ul>

                  <div className={l5.missionGrid}>
                    <div className={l5.missionCard}>
                      <strong>Результаты Prompt Lab</strong>
                      <span>{promptExperimentCount}/{REQUIRED_PROMPT_EXPERIMENTS}</span>
                    </div>
                    <div className={l5.missionCard}>
                      <strong>Проверка в Compare</strong>
                      <span>{compareRunCount}/{REQUIRED_COMPARE_RUNS}</span>
                    </div>
                    <div className={l5.missionCard}>
                      <strong>Тренировка контекста</strong>
                      <span>
                        {contextDrillDone
                          ? `готово (${bestPicks}/${THOUGHT_ROUNDS.length})`
                          : "ещё в работе"}
                      </span>
                    </div>
                  </div>

                  <div className={l5.actionLinks}>
                    <Link to={routes.studentPromptLab} className={l5.linkButtonPrimary}>
                      Сохранить эксперимент в Prompt Lab
                    </Link>
                    <Link to={routes.studentModelCompare} className={l5.linkButtonGhost}>
                      Проверить результат в Compare
                    </Link>
                  </div>
                </div>
              </article>
            );
          }

          if (section.type === "challenge") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("challenge")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l5.sectionMission}>
                  <strong>Короткая проверка понимания</strong>
                  <span>
                    Этот блок помогает закрепить идею миссии, но главным завершением считаются реальные
                    результаты Prompt Lab и Compare.
                  </span>
                </div>

                {L5_FINAL_TASKS.map((task, taskIndex) => {
                  const solved = finalSolved[taskIndex];
                  const feedback = finalFeedback[taskIndex];
                  return (
                    <div key={task.id} className={`${l5.finalCard} ${solved ? l5.finalCardDone : ""}`}>
                      <p className={l5.finalTitle}>{task.title}</p>
                      <p className={l5.l5Narrative}>{task.prompt}</p>
                      {!solved && task.kind === "pick" && task.options ? (
                        <div className={l5.finalPickRow}>
                          {task.options.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={l5.pickBtn}
                              onClick={() => onFinalPick(taskIndex, option.id)}
                            >
                              {option.text}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {!solved && task.kind === "type" ? (
                        <>
                          <textarea
                            className={l5.labTextarea}
                            value={finalTypeDraft}
                            onChange={(event) => setFinalTypeDraft(event.target.value)}
                            aria-label="Свой ответ"
                          />
                          <div className={l5.l5BtnRow}>
                            <button
                              type="button"
                              className={l5.btnPrimary}
                              onClick={() => onFinalTypeSubmit(taskIndex)}
                            >
                              Проверить ответ
                            </button>
                          </div>
                        </>
                      ) : null}

                      {feedback ? <p className={solved ? l5.hintOk : l5.hintErr}>{feedback}</p> : null}
                    </div>
                  );
                })}
              </article>
            );
          }

          return null;
        })}
      </div>

      <div className={cs.sectionCard}>
        <div className={cs.completeRow}>
          <button
            type="button"
            className={cs.btnComplete}
            onClick={onMarkComplete}
            disabled={done || !canFinishLesson}
          >
            {done ? "Миссия отмечена пройденной" : "Завершить миссию"}
          </button>
          <p className={l5.completeHintWarn}>
            {artifactMissionReady
              ? "Основная миссия выполнена: Prompt Lab и Compare дали нужный результат."
              : legacyLessonReady
                ? "Локальный маршрут завершён. Это запасной вариант; для полного цикла всё равно сохрани результаты в Prompt Lab и Compare."
                : "Основной путь: сохрани 3 эксперимента в Prompt Lab и 1 проверку в Compare. Старый локальный маршрут пока остаётся как запасной."}
          </p>
        </div>
        <p className={cs.completeHint}>Прогресс миссии хранится локально для совместимости.</p>
      </div>
    </>
  );
}
