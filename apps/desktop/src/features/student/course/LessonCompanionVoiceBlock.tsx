import type courseCss from "../StudentCourse.module.css";

type Props = {
  courseStyles: typeof courseCss;
  /** e.g. «Твой ИИ думает:» */
  label: string;
  text: string | null;
  loading?: boolean;
};

/**
 * Compact in-lesson block for Ollama “companion” lines (reactive layer; not validation).
 */
export function LessonCompanionVoiceBlock({ courseStyles: cs, label, text, loading }: Props) {
  if (!loading && !text) return null;
  return (
    <div className={cs.lessonCompanionVoice} aria-live="polite">
      <div className={cs.lessonCompanionVoiceLabel}>{label}</div>
      {loading ? (
        <p className={cs.lessonCompanionVoiceBody}>…</p>
      ) : text ? (
        <p className={cs.lessonCompanionVoiceBody}>{text}</p>
      ) : null}
    </div>
  );
}
