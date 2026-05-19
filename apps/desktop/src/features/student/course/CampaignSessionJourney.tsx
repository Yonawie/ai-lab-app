import { Link } from "react-router-dom";
import { getSessionBlueprint } from "./campaign-session-blueprint";
import styles from "../StudentCourse.module.css";

type Props = {
  lessonId: string;
};

export function CampaignSessionJourney({ lessonId }: Props) {
  const blocks = getSessionBlueprint(lessonId);
  if (blocks.length === 0) return null;

  return (
    <section className={styles.campaignJourney} aria-labelledby="campaign-journey-title">
      <div className={styles.campaignJourneyHead}>
        <h2 id="campaign-journey-title" className={styles.campaignJourneyTitle}>
          Структура миссии · ~90 минут
        </h2>
        <p className={styles.campaignJourneyLead}>
          У каждой миссии один главный рычаг улучшения ИИ. Ниже — что ты меняешь, где проверяешь и какой результат
          должен появиться.
        </p>
      </div>
      <ol className={styles.campaignSteps}>
        {blocks.map((b, i) => (
          <li key={`${lessonId}-${b.phase}-${i}`} className={styles.campaignStep}>
            <div className={styles.campaignStepRail} aria-hidden>
              <span className={styles.campaignStepDot} />
              {i < blocks.length - 1 ? <span className={styles.campaignStepLine} /> : null}
            </div>
            <div className={styles.campaignStepBody}>
              <p className={styles.campaignStepKicker}>{b.phaseLabel}</p>
              <h3 className={styles.campaignStepTitle}>{b.title}</h3>
              <p className={styles.campaignStepText}>{b.body}</p>
              {b.links && b.links.length > 0 ? (
                <div className={styles.campaignStepLinks}>
                  {b.links.map((l) => (
                    <Link key={l.href + l.label} to={l.href} className={styles.campaignLink}>
                      {l.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
