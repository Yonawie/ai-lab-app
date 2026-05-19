import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchStudentArtifactSummary,
  type StudentArtifactSummary,
} from "@/shared/artifact-ledger-tauri";
import { fetchLessonCompanionReflection } from "@/shared/lesson-companion-tauri";
import { routes } from "@/shared/routes";
import type { Lesson, LessonSectionType } from "../training-course-model";
import type courseCss from "../../StudentCourse.module.css";
import { LessonCompanionVoiceBlock } from "../LessonCompanionVoiceBlock";
import {
  CHAOS_ITEMS,
  L3_DEMO_CASES,
  type ClusterId,
} from "./l3-data";
import l3 from "./Lesson3Unsupervised.module.css";

type Props = {
  lesson: Lesson;
  courseStyles: typeof courseCss;
  sectionCardClass: (t: LessonSectionType) => string;
  done: boolean;
  onMarkComplete: () => void;
  studentEmail?: string;
};

type HypothesisKey = "tone" | "urgency" | "risk";

type HypothesisOption = {
  key: HypothesisKey;
  title: string;
  framing: string;
  clusterLabels: Record<ClusterId, string>;
  clusterExplain: Record<ClusterId, string>;
  ambiguousIds: string[];
  outlierIds: string[];
};

const INTRO_PHASES = [
  "В неразмеченных данных скрытая структура не дана заранее. Инженер не получает правильные метки, а формулирует гипотезу: по какому признаку вообще стоит делить поток.",
  "Один и тот же набор сообщений можно сгруппировать по срочности, по тону, по риску или по другой логике. Важен не один “правильный” ответ, а осмысленная версия структуры и понимание, где она ломается.",
  "ИИ тоже может видеть структуру иначе. Поэтому миссия не про перетаскивание карточек, а про исследование паттернов, спорных примеров и проверку объяснения через Prompt Lab и Compare.",
];

const INTRO_MAX = INTRO_PHASES.length + 1;
const REQUIRED_PROMPT_EXPERIMENTS = 2;
const REQUIRED_COMPARE_RUNS = 1;

const HYPOTHESES: HypothesisOption[] = [
  {
    key: "urgency",
    title: "Гипотеза: группировать по срочности",
    framing: "Структура строится вокруг давления по времени: спокойные объявления, срочные сигналы и шум/риск.",
    clusterLabels: {
      0: "Спокойные объявления",
      1: "Срочные сигналы",
      2: "Шум и риск",
    },
    clusterExplain: {
      0: "Нейтральные сообщения без давления и без подозрительных признаков.",
      1: "Сообщения, где важен быстрый отклик, дедлайн или изменение режима.",
      2: "Рекламный шум, манипулятивные паттерны или сообщения вне школьного контекста.",
    },
    ambiguousIds: ["c3", "c7"],
    outlierIds: ["c9", "c10"],
  },
  {
    key: "tone",
    title: "Гипотеза: группировать по тону",
    framing: "Структура строится вокруг стиля речи: нейтральный тон, напряжённый тон и агрессивный/манипулятивный тон.",
    clusterLabels: {
      0: "Нейтральный поток",
      1: "Напряжённый поток",
      2: "Манипулятивный или чужой тон",
    },
    clusterExplain: {
      0: "Обычные организационные сообщения без эмоционального давления.",
      1: "Фразы со срочностью, тревогой или требованием немедленной реакции.",
      2: "Манипулятивные призывы, рекламный нажим и сообщения, которые плохо встраиваются в школьный поток.",
    },
    ambiguousIds: ["c5", "c8"],
    outlierIds: ["c9", "c10"],
  },
  {
    key: "risk",
    title: "Гипотеза: группировать по уровню риска",
    framing: "Структура строится вокруг доверия: безопасные сообщения, сообщения с организационным риском и явный внешнеопасный шум.",
    clusterLabels: {
      0: "Безопасные сообщения",
      1: "Требуют внимательной проверки",
      2: "Внешний риск / шум",
    },
    clusterExplain: {
      0: "Сообщения, которые выглядят нормальной частью учебного процесса.",
      1: "Сообщения, где важно не пропустить дедлайн или изменение режима.",
      2: "Потенциально вредный или нерелевантный контент.",
    },
    ambiguousIds: ["c5", "c6"],
    outlierIds: ["c9", "c10"],
  },
];

function countOf(summary: StudentArtifactSummary | null, key: string): number {
  return summary?.countsByType?.[key] ?? 0;
}

function itemById(id: string) {
  return CHAOS_ITEMS.find((item) => item.id === id) ?? null;
}

function buildHypothesisNarrative(hypothesis: HypothesisOption) {
  return [
    `Текущая гипотеза группировки: ${hypothesis.title}.`,
    hypothesis.framing,
    `Амбивалентные примеры: ${hypothesis.ambiguousIds
      .map((id) => itemById(id)?.text ?? id)
      .join(" | ")}.`,
    `Явные выбросы/шум: ${hypothesis.outlierIds
      .map((id) => itemById(id)?.text ?? id)
      .join(" | ")}.`,
  ].join("\n");
}

export function Lesson3UnsupervisedSession({
  lesson,
  courseStyles: cs,
  sectionCardClass,
  done,
  onMarkComplete,
  studentEmail = "",
}: Props) {
  const student = studentEmail.trim();

  const [introStep, setIntroStep] = useState(0);
  const [demoShown, setDemoShown] = useState<Record<string, boolean>>({});
  const [selectedHypothesisKey, setSelectedHypothesisKey] = useState<HypothesisKey>("urgency");
  const [hypothesisReason, setHypothesisReason] = useState("");
  const [uncertainNote, setUncertainNote] = useState("");
  const [artifactSummary, setArtifactSummary] = useState<StudentArtifactSummary | null>(null);
  const [aiInterpretation, setAiInterpretation] = useState<string | null>(null);
  const [aiInterpretationLoading, setAiInterpretationLoading] = useState(false);
  const [demoAiText, setDemoAiText] = useState<string | null>(null);
  const [demoAiLoading, setDemoAiLoading] = useState(false);

  const selectedHypothesis = useMemo(
    () => HYPOTHESES.find((item) => item.key === selectedHypothesisKey) ?? HYPOTHESES[0],
    [selectedHypothesisKey],
  );
  const lastDemo = useMemo(
    () => [...L3_DEMO_CASES].reverse().find((item) => demoShown[item.id]),
    [demoShown],
  );
  const promptExperimentCount = countOf(artifactSummary, "prompt_experiment_saved");
  const compareRunCount = countOf(artifactSummary, "compare_run_completed");
  const localInvestigationReady =
    hypothesisReason.trim().split(/\s+/).filter(Boolean).length >= 8 &&
    uncertainNote.trim().split(/\s+/).filter(Boolean).length >= 6 &&
    aiInterpretation != null;
  const artifactMissionReady =
    promptExperimentCount >= REQUIRED_PROMPT_EXPERIMENTS &&
    compareRunCount >= REQUIRED_COMPARE_RUNS;
  const canFinishLesson = artifactMissionReady || localInvestigationReady;
  const total = lesson.sections.length;

  useEffect(() => {
    if (!student) {
      setArtifactSummary(null);
      return;
    }
    let cancelled = false;
    void fetchStudentArtifactSummary(student)
      .then((summary) => {
        if (!cancelled) setArtifactSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setArtifactSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [student]);

  useEffect(() => {
    if (!student || !lastDemo) return;
    let cancelled = false;
    setDemoAiLoading(true);
    void (async () => {
      const text = await fetchLessonCompanionReflection({
        studentEmail: student,
        lessonKey: "l3",
        lessonTitle: lesson.title,
        scene: "unsupervised_demo_interpretation",
        stateSummary: `Текст: ${lastDemo.text}\nСлабая интерпретация ИИ: ${lastDemo.aiSays}\nНужно коротко объяснить, почему структура данных без хорошей гипотезы распадается.`,
      });
      if (!cancelled) {
        setDemoAiText(text);
        setDemoAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastDemo, lesson.title, student]);

  const showDemo = useCallback((id: string) => {
    setDemoShown((current) => ({ ...current, [id]: true }));
  }, []);

  const requestAiInterpretation = useCallback(() => {
    if (!student) return;
    setAiInterpretationLoading(true);
    void (async () => {
      const text = await fetchLessonCompanionReflection({
        studentEmail: student,
        lessonKey: "l3",
        lessonTitle: lesson.title,
        scene: "investigative_structure_hypothesis",
        stateSummary: [
          buildHypothesisNarrative(selectedHypothesis),
          `Почему студент выбрал такую структуру: ${hypothesisReason.trim() || "пока не объяснил"}.`,
          `Где студент видит неопределённость: ${uncertainNote.trim() || "пока не отметил"}.`,
          "Нужно ответить как AI-интерпретация структуры: показать, что модель может увидеть похожую, но не идентичную группировку.",
        ].join("\n\n"),
      });
      setAiInterpretation(text);
      setAiInterpretationLoading(false);
    })().catch(() => {
      setAiInterpretation("ИИ временно недоступен");
      setAiInterpretationLoading(false);
    });
  }, [hypothesisReason, lesson.title, selectedHypothesis, student, uncertainNote]);

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
                <div className={l3.l3Block}>
                  {introStep === 0 ? (
                    <div className={l3.l3Cinematic}>
                      <p className={l3.l3Overline}>Миссия 3 · анализ паттернов</p>
                      <h3 className={l3.l3Title}>Найти структуру в данных без готовых меток</h3>
                      <p className={l3.l3Narrative}>
                        Это расследование слабых мест. Ты ищешь повторяющийся паттерн, отмечаешь спорные
                        примеры и проверяешь, увидит ли ИИ ту же структуру.
                      </p>
                      <p className={l3.l3Narrative}>
                        Маршрут: выбери гипотезу → найди спорное место → спроси ИИ, как он видит структуру →
                        реши, что проверять в Prompt Lab или Compare.
                      </p>
                      <div className={l3.missionGrid}>
                        <div className={l3.missionCard}>
                          <strong>Что ищем</strong>
                          <span>Скрытый паттерн в неразмеченном наборе сообщений.</span>
                        </div>
                        <div className={l3.missionCard}>
                          <strong>Что нужно сформулировать</strong>
                          <span>Гипотезу группировки и объяснение, почему она полезна.</span>
                        </div>
                        <div className={l3.missionCard}>
                          <strong>Где проверять результат</strong>
                          <span>Prompt Lab и Compare.</span>
                        </div>
                        <div className={l3.missionCard}>
                          <strong>Что считается финишем</strong>
                          <span>Гипотеза, объяснение ИИ и понимание, что тестировать дальше.</span>
                        </div>
                      </div>
                      <div className={l3.l3BtnRow}>
                        <button
                          type="button"
                          className={l3.btnPrimary}
                          onClick={() => setIntroStep(1)}
                        >
                          Начать расследование
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {INTRO_PHASES.slice(0, Math.min(introStep, INTRO_PHASES.length)).map((text, idx) => (
                        <div key={idx} className={l3.l3Cinematic}>
                          <p className={l3.l3Narrative}>{text}</p>
                        </div>
                      ))}
                      {introStep >= INTRO_MAX ? (
                        <div className={l3.engineerPanel}>
                          <p className={l3.engineerEyebrow}>Статус результата</p>
                          <h4 className={l3.engineerTitle}>Что уже есть у студента</h4>
                          <div className={l3.dataGrid}>
                            <div className={l3.dataCell}>
                              <span className={l3.dataCellValue}>{promptExperimentCount}</span>
                              <span className={l3.dataCellLabel}>эксперименты в Prompt Lab</span>
                            </div>
                            <div className={l3.dataCell}>
                              <span className={l3.dataCellValue}>{compareRunCount}</span>
                              <span className={l3.dataCellLabel}>проверки в Compare</span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className={l3.l3BtnRow}>
                        {introStep < INTRO_MAX ? (
                          <button
                            type="button"
                            className={l3.btnPrimary}
                            onClick={() => setIntroStep((value) => Math.min(INTRO_MAX, value + 1))}
                          >
                            Далее
                          </button>
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
                <div className={l3.ruleCallout}>
                  Здесь важно не “попасть в правильную корзину”, а увидеть, как слабая гипотеза
                  разрушает структуру: модель цепляется за случайный сигнал и теряет полезное
                  объяснение набора.
                </div>
                <div className={l3.l3Block}>
                  {L3_DEMO_CASES.map((demo) => (
                    <div key={demo.id} className={l3.demoCard}>
                      <p className={l3.demoKind}>Слабая интерпретация структуры</p>
                      <p className={l3.l3Narrative}>
                        <strong>Текст:</strong> {demo.text}
                      </p>
                      {demoShown[demo.id] ? (
                        <>
                          <p className={l3.l3Narrative}>
                            <strong>Что решил ИИ:</strong> {demo.aiSays}
                          </p>
                          <p className={l3.l3Narrative}>{demo.explanation}</p>
                        </>
                      ) : null}
                      <div className={l3.l3BtnRow}>
                        <button
                          type="button"
                          className={l3.btnGhost}
                          onClick={() => showDemo(demo.id)}
                        >
                          Разобрать пример
                        </button>
                      </div>
                    </div>
                  ))}
                  <LessonCompanionVoiceBlock
                    courseStyles={cs}
                  label="Объяснение ИИ:"
                    text={demoAiText}
                    loading={demoAiLoading}
                  />
                </div>
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
                <div className={l3.engineerPanel}>
                  <p className={l3.engineerEyebrow}>Гипотеза группировки</p>
                  <h4 className={l3.engineerTitle}>По какому скрытому признаку ты делишь поток</h4>
                  <p className={l3.engineerLead}>
                    Выбери не “правильную корзину”, а исследовательскую логику. Это и есть твоя
                    текущая гипотеза о структуре данных.
                  </p>
                </div>

                <div className={l3.choiceGrid}>
                  {HYPOTHESES.map((hypothesis) => (
                    <button
                      key={hypothesis.key}
                      type="button"
                      className={`${l3.choiceCard} ${hypothesis.key === selectedHypothesisKey ? l3.choiceCardActive : ""}`}
                      onClick={() => setSelectedHypothesisKey(hypothesis.key)}
                    >
                      <strong>{hypothesis.title}</strong>
                      <span>{hypothesis.framing}</span>
                    </button>
                  ))}
                </div>

                <div className={l3.clusterSummaryGrid}>
                  {[0, 1, 2].map((cluster) => (
                    <div key={cluster} className={l3.clusterSummaryCard}>
                      <p className={l3.clusterSummaryTitle}>
                        {selectedHypothesis.clusterLabels[cluster as ClusterId]}
                      </p>
                      <p className={l3.l3Narrative}>{selectedHypothesis.clusterExplain[cluster as ClusterId]}</p>
                    </div>
                  ))}
                </div>

                <label className={l3.fieldLabel} htmlFor="l3-hypothesis-reason">
                  Какая закономерность стоит за твоей группировкой
                </label>
                <textarea
                  id="l3-hypothesis-reason"
                  className={l3.textarea}
                  rows={5}
                  value={hypothesisReason}
                  onChange={(event) => setHypothesisReason(event.target.value)}
                  placeholder="Опиши, по какому паттерну ты делишь данные и почему это полезно"
                />
              </article>
            );
          }

          if (section.type === "lab") {
            return (
              <article
                key={section.id}
                id={`section-${section.id}`}
                className={sectionCardClass("lab")}
                aria-labelledby={`heading-${section.id}`}
              >
                {head}
                <p className={cs.sectionBody}>{section.content}</p>
                <div className={l3.engineerPanel}>
                  <p className={l3.engineerEyebrow}>Спорные случаи и выбросы</p>
                  <h4 className={l3.engineerTitle}>Где структура неочевидна</h4>
                  <p className={l3.engineerLead}>
                    В этой миссии важны не только удачные группы, но и сообщения, которые спорят с гипотезой
                    или выглядят выбросами.
                  </p>
                </div>

                <div className={l3.insightGrid}>
                  <div className={l3.insightCard}>
                    <p className={l3.insightTitle}>Амбивалентные примеры</p>
                    {selectedHypothesis.ambiguousIds.map((id) => (
                      <p key={id} className={l3.l3Narrative}>
                        • {itemById(id)?.text}
                      </p>
                    ))}
                  </div>
                  <div className={l3.insightCard}>
                    <p className={l3.insightTitle}>Выбросы и внешний шум</p>
                    {selectedHypothesis.outlierIds.map((id) => (
                      <p key={id} className={l3.l3Narrative}>
                        • {itemById(id)?.text}
                      </p>
                    ))}
                  </div>
                </div>

                <label className={l3.fieldLabel} htmlFor="l3-uncertain-note">
                  Где твоя группировка неуверенна или спорна
                </label>
                <textarea
                  id="l3-uncertain-note"
                  className={l3.textarea}
                  rows={4}
                  value={uncertainNote}
                  onChange={(event) => setUncertainNote(event.target.value)}
                  placeholder="Отметь, где примеры спорят с гипотезой и почему AI может увидеть их иначе"
                />

                <div className={l3.l3BtnRow}>
                  <button
                    type="button"
                    className={l3.btnPrimary}
                    onClick={requestAiInterpretation}
                    disabled={!student || aiInterpretationLoading}
                  >
                    {aiInterpretationLoading ? "Запрашиваю объяснение ИИ..." : "Попросить ИИ объяснить структуру"}
                  </button>
                </div>
                <LessonCompanionVoiceBlock
                  courseStyles={cs}
                  label="Как AI может увидеть структуру:"
                  text={aiInterpretation}
                  loading={aiInterpretationLoading}
                />
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
                <div className={l3.summaryHero}>
                  <p className={l3.summaryTitle}>Куда идти, чтобы проверить гипотезу дальше</p>
                  <ul className={l3.summaryList}>
                    <li>Prompt Lab нужен, чтобы тестировать разные промпты для объяснения одной и той же структуры.</li>
                    <li>Compare нужен, чтобы проверить, как базовая и обученная модель по-разному объясняют один и тот же набор данных.</li>
                    <li>Полезный результат урока — не “идеальный кластер”, а гипотеза, список спорных мест и план следующей проверки.</li>
                  </ul>
                </div>
                <div className={l3.linkRow}>
                  <Link to={routes.studentPromptLab} className={l3.linkCta}>
                    Открыть Prompt Lab
                  </Link>
                  <Link to={routes.studentModelCompare} className={l3.linkCta}>
                    Открыть Compare
                  </Link>
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
                <div className={l3.engineerPanel}>
                  <p className={l3.engineerEyebrow}>Что должно получиться</p>
                    <h4 className={l3.engineerTitle}>Что должно остаться после урока</h4>
                  <ul className={l3.summaryList}>
                    <li>
                      <strong>Найденный паттерн:</strong> {selectedHypothesis.title.toLowerCase()}.
                    </li>
                    <li>
                      <strong>Гипотеза группировки:</strong> {hypothesisReason.trim() || "ещё не сформулирована"}.
                    </li>
                    <li>
                      <strong>Где группировка спорная:</strong> {uncertainNote.trim() || "ещё не отмечено"}.
                    </li>
                    <li>
                      <strong>Проверки:</strong> эксперименты в Prompt Lab — {promptExperimentCount}, проверки в Compare — {compareRunCount}.
                    </li>
                  </ul>
                </div>
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
          <p className={l3.completeHintWarn}>
            {done
                      ? "Миссия уже сохранена как пройденная."
              : artifactMissionReady
                ? "Есть результат через Prompt Lab и Compare."
                : localInvestigationReady
                       ? "Есть исследовательская гипотеза, объяснение ИИ и отмеченная неоднозначность. Можно завершить миссию."
                      : "Сначала сформулируй гипотезу группировки, отметь спорные примеры и посмотри объяснение ИИ или добери результаты через Prompt Lab и Compare."}
          </p>
        </div>
        <p className={cs.completeHint}>
                  Совместимость со старым маршрутом сохранена, но основным смыслом миссии теперь
          считается исследование структуры данных и её проверка.
        </p>
      </div>
    </>
  );
}
