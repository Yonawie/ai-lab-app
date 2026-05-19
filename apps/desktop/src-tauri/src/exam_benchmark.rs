//! Fixed AI Assessment Lab content and grading (no lesson tasks, no external ML).

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

const EXAM_VERSION: &str = "ai_exam_v1";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GradedExam {
    pub total_score: i32,
    pub skill_scores: Value,
    pub strengths: Vec<String>,
    pub weaknesses: Vec<String>,
    pub recommendation: String,
}

fn skill_label_ru(skill: &str) -> &'static str {
    match skill {
        "classification" => "Классификация и разметка",
        "ranking" => "Ранжирование и приоритеты",
        "policy_path" => "Политика ответа",
        "data_cleaning" => "Очистка данных",
        "prompt_understanding" => "Понимание промптов",
        _ => "Навык",
    }
}

fn blueprint_steps() -> Value {
    json!([
      {
        "id": "exam_cl_01",
        "skill": "classification",
        "title": "Блок 1 · Классификация",
        "subtitle": "Оценка: умеет ли ваш ИИ отличать типы ошибок в диалоге",
        "instructions": "Выберите наиболее точную метку для ситуации (экзаменационный пример, не из уроков).",
        "payload": {
          "prompt": "Ученик пишет: «Модель отвечает одним и тем же шаблоном на разные вопросы по задаче».",
          "options": [
            "Нехватка данных для обучения",
            "Потеря вариативности / ответ зашаблонирован",
            "Проблема только в скорости ответа"
          ]
        }
      },
      {
        "id": "exam_rank_01",
        "skill": "ranking",
        "title": "Блок 2 · Ранжирование",
        "subtitle": "Оценка: порядок шагов при доводке запроса к ИИ",
        "instructions": "Расставьте шаги в логичном порядке (сверху — что делаем первым).",
        "payload": {
          "prompt": "Вы хотите получить полезный разбор ошибки в решении, а не общий лекторий.",
          "options": [
            "Проверить ответ ИИ на одном конкретном примере",
            "Сформулировать цель, контекст и ограничения одним блоком",
            "Написать первый черновик промпта",
            "Задать желаемый формат вывода (список, шаги, тон)"
          ]
        }
      },
      {
        "id": "exam_pp_01",
        "skill": "policy_path",
        "title": "Блок 3 · Политика ответа",
        "subtitle": "Оценка: выбор тона и стратегии в сложном диалоге",
        "instructions": "Какой вариант поведения ИИ уместнее в сценарии ниже?",
        "payload": {
          "prompt": "Ученик расстроен из-за низкой оценки и просит «просто сказать, что всё плохо».",
          "options": [
            "Дать сухой перечень всех ошибок подряд",
            "Коротко признать эмоции и перейти к одному конкретному шагу улучшения",
            "Пообещать, что при следующей попытке оценка точно будет высокой"
          ]
        }
      },
      {
        "id": "exam_dc_01",
        "skill": "data_cleaning",
        "title": "Блок 4 · Очистка данных",
        "subtitle": "Оценка: отделение полезных строк от шума",
        "instructions": "Для каждой строки укажите: оставить в обучающем наборе или отфильтровать как шум.",
        "payload": {
          "prompt": "Набор коротких текстов для фильтрации перед разметкой.",
          "examples": [
            {"id": "dc_a", "text": "2+2=4, проверено на калькуляторе"},
            {"id": "dc_b", "text": "asdf qqqqqqq"},
            {"id": "dc_c", "text": "Ошибка: при сложении дробей сложил знаменатели"},
            {"id": "dc_d", "text": "купить слона срочно!!!"}
          ]
        }
      },
      {
        "id": "exam_pr_01",
        "skill": "prompt_understanding",
        "title": "Блок 5 · Понимание промптов",
        "subtitle": "Оценка: какой запрос даст предметный ответ наставника",
        "instructions": "Выберите промпт, который лучше всего подходит для задачи в описании.",
        "payload": {
          "scenario": "Нужно помочь ученику исправить ошибку в шаге с дробями, не обобщая всю математику.",
          "choices": [
            {"id": "pr_a", "label": "A", "text": "Объясни математику."},
            {"id": "pr_b", "label": "B", "text": "Ты наставник. Ученик сложил знаменатели при одинаковых знаменателях. Укажи ошибку, покажи правило на примере 2/5+1/5 и один шаг исправления."},
            {"id": "pr_c", "label": "C", "text": "Расскажи историю дробей и все свойства подробно."}
          ]
        }
      }
    ])
}

/// Публичная схема экзамена для UI (без ответов).
pub fn blueprint() -> Value {
    json!({
        "version": EXAM_VERSION,
        "labTitle": "Лаборатория оценки ИИ",
        "missionTitle": "Миссия: зафиксировать уровень развития компаньона",
        "missionLead": "Это отдельный набор примеров — не ваши уроки. Результат покажет сильные стороны и зоны для тренировки.",
        "steps": blueprint_steps()
    })
}

fn grade_classification(selected: &str, correct: &str) -> bool {
    selected.trim() == correct.trim()
}

fn grade_ranking(order: &[String], correct: &[&str]) -> bool {
    if order.len() != correct.len() {
        return false;
    }
    order
        .iter()
        .zip(correct.iter())
        .all(|(a, b)| a.trim() == b.trim())
}

fn grade_data_cleaning(
    sub_clean: &[String],
    sub_noisy: &[String],
    exp_clean: &[&str],
    exp_noisy: &[&str],
) -> bool {
    let mut a: Vec<String> = sub_clean.iter().map(|s| s.trim().to_string()).collect();
    let mut b: Vec<String> = sub_noisy.iter().map(|s| s.trim().to_string()).collect();
    let mut c: Vec<String> = exp_clean.iter().map(|s| s.to_string()).collect();
    let mut d: Vec<String> = exp_noisy.iter().map(|s| s.to_string()).collect();
    a.sort();
    b.sort();
    c.sort();
    d.sort();
    a == c && b == d
}

fn parse_dc_answer(v: &Value) -> Result<(Vec<String>, Vec<String>), String> {
    let clean = v
        .get("clean")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "data_cleaning: нужен массив clean".to_string())?;
    let noisy = v
        .get("noisy")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "data_cleaning: нужен массив noisy".to_string())?;
    let clean: Vec<String> = clean
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    let noisy: Vec<String> = noisy
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    Ok((clean, noisy))
}

/// Ответы: объект { "exam_cl_01": { "type": "...", ... }, ... }
pub fn grade_answers(answers_json: &str) -> Result<GradedExam, String> {
    let root: Value =
        serde_json::from_str(answers_json.trim()).map_err(|e| format!("JSON ответов: {e}"))?;
    let obj = root
        .as_object()
        .ok_or_else(|| "Ожидается JSON-объект с ответами по id шага".to_string())?;

    let mut per_skill: HashMap<&'static str, Vec<bool>> = HashMap::new();

    // --- exam_cl_01
    let cl = obj.get("exam_cl_01").ok_or("Нет ответа для exam_cl_01")?;
    let cl_type = cl.get("type").and_then(|x| x.as_str()).unwrap_or("");
    if cl_type != "classification" {
        return Err("exam_cl_01: неверный type".into());
    }
    let sel = cl
        .get("selected")
        .and_then(|x| x.as_str())
        .ok_or("exam_cl_01: нужен selected")?;
    let ok_cl = grade_classification(
        sel,
        "Потеря вариативности / ответ зашаблонирован",
    );
    per_skill.entry("classification").or_default().push(ok_cl);

    // --- exam_rank_01 (correct order)
    let rank_correct = [
        "Сформулировать цель, контекст и ограничения одним блоком",
        "Написать первый черновик промпта",
        "Задать желаемый формат вывода (список, шаги, тон)",
        "Проверить ответ ИИ на одном конкретном примере",
    ];
    let rk = obj.get("exam_rank_01").ok_or("Нет ответа для exam_rank_01")?;
    if rk.get("type").and_then(|x| x.as_str()) != Some("ranking") {
        return Err("exam_rank_01: неверный type".into());
    }
    let ord = rk
        .get("order")
        .and_then(|x| x.as_array())
        .ok_or("exam_rank_01: нужен order[]")?;
    let ord: Vec<String> = ord
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.to_string()))
        .collect();
    let ok_rk = grade_ranking(&ord, &rank_correct);
    per_skill.entry("ranking").or_default().push(ok_rk);

    // --- exam_pp_01
    let pp = obj.get("exam_pp_01").ok_or("Нет ответа для exam_pp_01")?;
    if pp.get("type").and_then(|x| x.as_str()) != Some("policy_path") {
        return Err("exam_pp_01: неверный type".into());
    }
    let pp_sel = pp
        .get("selected")
        .and_then(|x| x.as_str())
        .ok_or("exam_pp_01: нужен selected")?;
    let ok_pp = grade_classification(
        pp_sel,
        "Коротко признать эмоции и перейти к одному конкретному шагу улучшения",
    );
    per_skill.entry("policy_path").or_default().push(ok_pp);

    // --- exam_dc_01
    let dc = obj.get("exam_dc_01").ok_or("Нет ответа для exam_dc_01")?;
    if dc.get("type").and_then(|x| x.as_str()) != Some("data_cleaning") {
        return Err("exam_dc_01: неверный type".into());
    }
    let (c_sub, n_sub) = parse_dc_answer(dc)?;
    let ok_dc = grade_data_cleaning(
        &c_sub,
        &n_sub,
        &["dc_a", "dc_c"],
        &["dc_b", "dc_d"],
    );
    per_skill.entry("data_cleaning").or_default().push(ok_dc);

    // --- exam_pr_01
    let pr = obj.get("exam_pr_01").ok_or("Нет ответа для exam_pr_01")?;
    if pr.get("type").and_then(|x| x.as_str()) != Some("prompt_understanding") {
        return Err("exam_pr_01: неверный type".into());
    }
    let choice = pr
        .get("choiceId")
        .and_then(|x| x.as_str())
        .ok_or("exam_pr_01: нужен choiceId")?;
    let ok_pr = choice.trim() == "pr_b";
    per_skill
        .entry("prompt_understanding")
        .or_default()
        .push(ok_pr);

    let skills_order = [
        "classification",
        "ranking",
        "policy_path",
        "data_cleaning",
        "prompt_understanding",
    ];
    let mut scores_obj = serde_json::Map::new();
    let mut total: i32 = 0;
    for sk in skills_order {
        let vec = per_skill.get(sk).cloned().unwrap_or_default();
        let passed = *vec.first().unwrap_or(&false);
        let pct = if passed { 100 } else { 0 };
        total += pct;
        scores_obj.insert(sk.to_string(), json!(pct));
    }
    let n = skills_order.len() as i32;
    let total_score = total / n;

    let mut strengths: Vec<String> = Vec::new();
    let mut weaknesses: Vec<String> = Vec::new();
    for sk in skills_order {
        let pct = scores_obj
            .get(sk)
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let label = skill_label_ru(sk);
        if pct >= 100 {
            strengths.push(format!("{label} — зачёт по экзамену."));
        } else {
            weaknesses.push(format!("{label} — стоит потренировать отдельно."));
        }
    }

    let lowest = skills_order
        .iter()
        .min_by_key(|sk| {
            scores_obj
                .get(**sk)
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
        })
        .copied()
        .unwrap_or("classification");
    let recommendation = match lowest {
        "classification" => "Дальше: больше классификаций в уроках и внимание к формулировке меток.".to_string(),
        "ranking" => "Дальше: задания на порядок шагов и проверка логики пайплайна.".to_string(),
        "policy_path" => "Дальше: сценарии выбора политики ответа и этика диалога.".to_string(),
        "data_cleaning" => "Дальше: разметка «в набор / шум» на новых примерах.".to_string(),
        "prompt_understanding" => "Дальше: Prompt Lab и чат-тренировка с конкретными инструкциями.".to_string(),
        _ => "Продолжайте сбалансированно проходить блоки компаньона.".to_string(),
    };

    Ok(GradedExam {
        total_score,
        skill_scores: Value::Object(scores_obj),
        strengths,
        weaknesses,
        recommendation,
    })
}
