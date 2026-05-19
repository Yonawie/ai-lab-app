// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod db;
mod exam_benchmark;
mod ollama;

use db::{
    create_student_for_teacher, list_students_for_teacher, register_student_user, resolve_user_by_email,
    login_user, CreateStudentForTeacherResponse, LoginUserView, ResolvedUserView, TeacherLinkedStudentView,
    get_database_status, DatabaseStatusView,
    classification_task_completed, get_model_training_status, get_student_ai_companion,
    generate_chat_training_answer, generate_lesson_companion_reflection,
    get_chat_training_context, list_chat_training_interactions, save_chat_training_interaction,
    get_prompt_lab_exercise, list_prompt_lab_experiments, run_prompt_lab_experiment,
    save_prompt_lab_experiment, submit_prompt_experiment,
    submit_classification_attempt, submit_data_cleaning_attempt, submit_policy_path_attempt, submit_ranking_attempt,
    train_student_model, ChatTrainingContextView, GenerateChatTrainingAnswerRequest,
    GenerateChatTrainingAnswerResponse, GenerateLessonCompanionReflectionResponse,
    ModelTrainingStatusView, PromptLabExerciseView, PromptLabExperimentHistoryItemView,
    PromptLabRunResponse,
    ChatTrainingHistoryItemView,
    SaveChatTrainingInteractionRequest, SaveChatTrainingInteractionResponse, StudentAiCompanionView,
    SavePromptLabExperimentRequest,
    SubmitClassificationRequest, SubmitClassificationResponse, SubmitDataCleaningRequest,
    SubmitPromptExperimentRequest, SubmitPromptExperimentResponse, SubmitRankingRequest,
    TaskStatusRequest, TaskStatusResponse,     TrainModelResponse,
    ExportStudentTrainingDatasetRequest, ExportStudentTrainingDatasetResponse, export_student_training_dataset,
    RegisterStudentOllamaModelRequest, RegisterStudentOllamaModelResponse, register_student_ollama_model,
    StudentTrainingPipelineStatusView, get_student_training_pipeline_status, set_student_trained_model_usage,
    CompareRunHistoryItemView, CompareStudentModelsRequest, CompareStudentModelsResponse, compare_student_models,
    PairwisePreferenceHistoryItemView, SavePairwisePreferenceRequest, list_pairwise_preferences,
    save_pairwise_preference,
    BenchmarkRunHistoryItemView, SaveBenchmarkRunRequest, list_benchmark_run_history, save_benchmark_run,
    ArenaStudentOpponentRow, CompareStudentVsStudentRequest, StudentVsStudentDuelResponse,
    compare_student_trained_vs_student, list_arena_student_opponents, list_compare_run_history,
    GenerateAiStudioProjectRequest, AiStudioGenerationResponse, generate_ai_studio_project,
    SaveAiStudioProjectVersionRequest, AiStudioProjectVersionView, save_ai_studio_project_version,
    list_ai_studio_project_versions, ExportAiStudioProjectRequest, ExportAiStudioProjectResponse,
    export_ai_studio_project, ExportStudentAiPackageResponse, export_student_ai_package,
    PrepareStudentTrainingJobResponse, prepare_student_training_job,
    AiExamSubmitResponse,
    get_ai_exam_blueprint, submit_ai_exam,
    AppendStudentArtifactRequest, append_student_artifact,
    StudentArtifactRecordView, StudentArtifactSummaryView,
    get_student_artifact_summary, list_recent_student_artifacts,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_database_status_cmd() -> Result<DatabaseStatusView, String> {
    get_database_status()
}

#[tauri::command]
fn resolve_user_by_email_cmd(email: String) -> Result<ResolvedUserView, String> {
    resolve_user_by_email(email)
}

#[tauri::command]
fn login_user_cmd(email: String, password: String) -> Result<LoginUserView, String> {
    login_user(email, password)
}

#[tauri::command]
fn register_student_user_cmd(email: String, password: String) -> Result<LoginUserView, String> {
    register_student_user(email, password)
}

#[tauri::command]
fn create_student_for_teacher_cmd(
    teacher_email: String,
    teacher_id: Option<String>,
    student_email: String,
    student_display_name: Option<String>,
    group_name: Option<String>,
) -> Result<CreateStudentForTeacherResponse, String> {
    let te = teacher_email.trim();
    let teacher_email_opt = if te.is_empty() {
        None
    } else {
        Some(te.to_string())
    };
    create_student_for_teacher(
        teacher_email_opt,
        teacher_id,
        student_email,
        student_display_name,
        group_name,
    )
}

#[tauri::command]
fn list_students_for_teacher_cmd(
    teacher_email: String,
    teacher_id: Option<String>,
) -> Result<Vec<TeacherLinkedStudentView>, String> {
    let te = teacher_email.trim();
    let teacher_email_opt = if te.is_empty() {
        None
    } else {
        Some(te.to_string())
    };
    list_students_for_teacher(teacher_email_opt, teacher_id)
}

#[tauri::command]
fn submit_classification_attempt_cmd(
    student_email: String,
    lesson_id: String,
    task_id: String,
    selected_answer: String,
) -> Result<SubmitClassificationResponse, String> {
    submit_classification_attempt(SubmitClassificationRequest {
        student_email,
        lesson_id,
        task_id,
        selected_answer,
    })
}

#[tauri::command]
fn submit_ranking_attempt_cmd(
    student_email: String,
    lesson_id: String,
    task_id: String,
    ranked_order_json: String,
) -> Result<SubmitClassificationResponse, String> {
    submit_ranking_attempt(SubmitRankingRequest {
        student_email,
        lesson_id,
        task_id,
        ranked_order_json,
    })
}

#[tauri::command]
fn submit_policy_path_attempt_cmd(
    student_email: String,
    lesson_id: String,
    task_id: String,
    selected_answer: String,
) -> Result<SubmitClassificationResponse, String> {
    submit_policy_path_attempt(SubmitClassificationRequest {
        student_email,
        lesson_id,
        task_id,
        selected_answer,
    })
}

#[tauri::command]
fn submit_data_cleaning_attempt_cmd(
    student_email: String,
    lesson_id: String,
    task_id: String,
    selection_json: String,
) -> Result<SubmitClassificationResponse, String> {
    submit_data_cleaning_attempt(SubmitDataCleaningRequest {
        student_email,
        lesson_id,
        task_id,
        selection_json,
    })
}

#[tauri::command]
fn classification_task_completed_cmd(
    student_email: String,
    task_id: String,
) -> Result<TaskStatusResponse, String> {
    classification_task_completed(TaskStatusRequest {
        student_email,
        task_id,
    })
}

#[tauri::command]
fn get_student_ai_companion_cmd(student_email: String) -> Result<StudentAiCompanionView, String> {
    get_student_ai_companion(student_email)
}

#[tauri::command]
fn get_model_training_status_cmd(
    student_email: String,
) -> Result<ModelTrainingStatusView, String> {
    get_model_training_status(student_email)
}

#[tauri::command]
fn train_student_model_cmd(student_email: String) -> Result<TrainModelResponse, String> {
    train_student_model(student_email)
}

#[tauri::command]
fn get_prompt_lab_exercise_cmd(student_email: String) -> Result<PromptLabExerciseView, String> {
    get_prompt_lab_exercise(student_email)
}

#[tauri::command]
fn submit_prompt_experiment_cmd(
    student_email: String,
    improved_prompt: String,
) -> Result<SubmitPromptExperimentResponse, String> {
    submit_prompt_experiment(SubmitPromptExperimentRequest {
        student_email,
        improved_prompt,
    })
}

#[tauri::command]
async fn run_prompt_lab_experiment_cmd(
    student_email: String,
    task_input: String,
    prompt_a: String,
    prompt_b: String,
) -> Result<PromptLabRunResponse, String> {
    run_prompt_lab_experiment(student_email, task_input, prompt_a, prompt_b).await
}

#[tauri::command]
fn save_prompt_lab_experiment_cmd(
    student_email: String,
    task_title: String,
    task_input: String,
    prompt_a: String,
    prompt_b: String,
    output_a: String,
    output_b: String,
    winner: String,
    rationale: Option<String>,
    model_name: Option<String>,
) -> Result<PromptLabExperimentHistoryItemView, String> {
    save_prompt_lab_experiment(SavePromptLabExperimentRequest {
        student_email,
        task_title,
        task_input,
        prompt_a,
        prompt_b,
        output_a,
        output_b,
        winner,
        rationale,
        model_name,
    })
}

#[tauri::command]
fn list_prompt_lab_experiments_cmd(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<PromptLabExperimentHistoryItemView>, String> {
    list_prompt_lab_experiments(student_email, limit)
}

#[tauri::command]
fn get_chat_training_context_cmd(student_email: String) -> Result<ChatTrainingContextView, String> {
    get_chat_training_context(student_email)
}

#[tauri::command]
async fn generate_chat_training_answer_cmd(
    student_email: String,
    student_message: String,
) -> Result<GenerateChatTrainingAnswerResponse, String> {
    generate_chat_training_answer(GenerateChatTrainingAnswerRequest {
        student_email,
        student_message,
    })
    .await
}

#[tauri::command]
async fn generate_lesson_companion_reflection_cmd(
    student_email: String,
    lesson_key: String,
    lesson_title: String,
    scene: String,
    state_summary: String,
    student_choice: Option<String>,
    plain_completion: Option<bool>,
) -> Result<GenerateLessonCompanionReflectionResponse, String> {
    generate_lesson_companion_reflection(
        student_email,
        lesson_key,
        lesson_title,
        scene,
        state_summary,
        student_choice,
        plain_completion.unwrap_or(false),
    )
    .await
}

#[tauri::command]
fn save_chat_training_interaction_cmd(
    student_email: String,
    student_message: String,
    ai_answer: String,
    answer_quality: i32,
    student_critique: Option<String>,
    failure_category: Option<String>,
    minimal_edit: Option<String>,
    revised_target_answer: Option<String>,
    model_name: Option<String>,
    reference_answer: Option<String>,
    reference_model_name: Option<String>,
) -> Result<SaveChatTrainingInteractionResponse, String> {
    save_chat_training_interaction(SaveChatTrainingInteractionRequest {
        student_email,
        student_message,
        ai_answer,
        answer_quality,
        student_critique,
        failure_category,
        minimal_edit,
        revised_target_answer,
        model_name,
        reference_answer,
        reference_model_name,
    })
}

#[tauri::command]
fn list_chat_training_interactions_cmd(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<ChatTrainingHistoryItemView>, String> {
    list_chat_training_interactions(student_email, limit)
}

#[tauri::command]
fn get_ai_exam_blueprint_cmd() -> Result<serde_json::Value, String> {
    Ok(get_ai_exam_blueprint())
}

#[tauri::command]
fn submit_ai_exam_cmd(
    student_email: String,
    answers_json: String,
) -> Result<AiExamSubmitResponse, String> {
    submit_ai_exam(student_email, answers_json)
}

#[tauri::command]
fn export_student_training_dataset_cmd(
    student_email: Option<String>,
    student_id: Option<String>,
) -> Result<ExportStudentTrainingDatasetResponse, String> {
    export_student_training_dataset(ExportStudentTrainingDatasetRequest {
        student_email,
        student_id,
    })
}

#[tauri::command]
fn register_student_ollama_model_cmd(
    student_email: Option<String>,
    student_id: Option<String>,
    base_model: String,
    adapter_path: String,
    ollama_model_alias: String,
    training_summary_path: Option<String>,
    system_prompt: Option<String>,
) -> Result<RegisterStudentOllamaModelResponse, String> {
    register_student_ollama_model(RegisterStudentOllamaModelRequest {
        student_email,
        student_id,
        base_model,
        adapter_path,
        ollama_model_alias,
        training_summary_path,
        system_prompt,
    })
}

#[tauri::command]
fn get_student_training_pipeline_status_cmd(
    student_email: String,
) -> Result<StudentTrainingPipelineStatusView, String> {
    get_student_training_pipeline_status(student_email)
}

#[tauri::command]
fn set_student_trained_model_usage_cmd(
    student_email: String,
    use_trained_model: bool,
) -> Result<(), String> {
    set_student_trained_model_usage(student_email, use_trained_model)
}

#[tauri::command]
fn prepare_student_training_job_cmd(
    student_email: String,
    base_hf_model: Option<String>,
    ollama_base_model: Option<String>,
    launch_now: bool,
) -> Result<PrepareStudentTrainingJobResponse, String> {
    prepare_student_training_job(student_email, base_hf_model, ollama_base_model, launch_now)
}

#[tauri::command]
async fn compare_student_models_cmd(
    student_email: String,
    prompt: String,
    category_tag: Option<String>,
) -> Result<CompareStudentModelsResponse, String> {
    compare_student_models(CompareStudentModelsRequest {
        student_email,
        prompt,
        category_tag,
    })
    .await
}

#[tauri::command]
fn list_compare_run_history_cmd(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<CompareRunHistoryItemView>, String> {
    list_compare_run_history(student_email, limit)
}

#[tauri::command]
fn save_pairwise_preference_cmd(
    student_email: String,
    prompt: String,
    left_model_name: String,
    right_model_name: String,
    left_output: String,
    right_output: String,
    chosen_winner: String,
    rationale: String,
    source_surface: String,
    compare_run_id: Option<String>,
) -> Result<PairwisePreferenceHistoryItemView, String> {
    save_pairwise_preference(SavePairwisePreferenceRequest {
        student_email,
        prompt,
        left_model_name,
        right_model_name,
        left_output,
        right_output,
        chosen_winner,
        rationale,
        source_surface,
        compare_run_id,
    })
}

#[tauri::command]
fn list_pairwise_preferences_cmd(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<PairwisePreferenceHistoryItemView>, String> {
    list_pairwise_preferences(student_email, limit)
}

#[tauri::command]
fn save_benchmark_run_cmd(
    student_email: String,
    mode: String,
    benchmark_mission_id: String,
    benchmark_title: String,
    benchmark_category: String,
    prompt: String,
    primary_model_name: String,
    secondary_model_name: Option<String>,
    primary_output: String,
    secondary_output: Option<String>,
    result_winner: String,
    indicators: Vec<String>,
    explanation: String,
    opponent_student_email: Option<String>,
) -> Result<BenchmarkRunHistoryItemView, String> {
    save_benchmark_run(SaveBenchmarkRunRequest {
        student_email,
        mode,
        benchmark_mission_id,
        benchmark_title,
        benchmark_category,
        prompt,
        primary_model_name,
        secondary_model_name,
        primary_output,
        secondary_output,
        result_winner,
        indicators,
        explanation,
        opponent_student_email,
    })
}

#[tauri::command]
fn list_benchmark_run_history_cmd(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<BenchmarkRunHistoryItemView>, String> {
    list_benchmark_run_history(student_email, limit)
}

#[tauri::command]
async fn generate_ai_studio_project_cmd(
    student_email: String,
    project_type: String,
    goal: String,
    constraints: Option<String>,
    improvement_request: Option<String>,
    previous_html: Option<String>,
    previous_css: Option<String>,
    previous_js: Option<String>,
) -> Result<AiStudioGenerationResponse, String> {
    generate_ai_studio_project(GenerateAiStudioProjectRequest {
        student_email,
        project_type,
        goal,
        constraints,
        improvement_request,
        previous_html,
        previous_css,
        previous_js,
    })
    .await
}

#[tauri::command]
fn save_ai_studio_project_version_cmd(
    student_email: String,
    project_id: Option<String>,
    project_type: String,
    goal: String,
    constraints: Option<String>,
    generation_request: String,
    html_code: String,
    css_code: String,
    js_code: String,
    model_name: Option<String>,
) -> Result<AiStudioProjectVersionView, String> {
    save_ai_studio_project_version(SaveAiStudioProjectVersionRequest {
        student_email,
        project_id,
        project_type,
        goal,
        constraints,
        generation_request,
        html_code,
        css_code,
        js_code,
        model_name,
    })
}

#[tauri::command]
fn list_ai_studio_project_versions_cmd(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<AiStudioProjectVersionView>, String> {
    list_ai_studio_project_versions(student_email, limit)
}

#[tauri::command]
fn export_ai_studio_project_cmd(
    student_email: String,
    project_id: Option<String>,
    project_type: String,
    goal: String,
    constraints: Option<String>,
    generation_request: String,
    html_code: String,
    css_code: String,
    js_code: String,
    model_name: Option<String>,
) -> Result<ExportAiStudioProjectResponse, String> {
    export_ai_studio_project(ExportAiStudioProjectRequest {
        student_email,
        project_id,
        project_type,
        goal,
        constraints,
        generation_request,
        html_code,
        css_code,
        js_code,
        model_name,
    })
}

#[tauri::command]
fn export_student_ai_package_cmd(
    student_email: String,
) -> Result<ExportStudentAiPackageResponse, String> {
    export_student_ai_package(student_email)
}

#[tauri::command]
fn list_arena_student_opponents_cmd(student_email: String) -> Result<Vec<ArenaStudentOpponentRow>, String> {
    list_arena_student_opponents(student_email)
}

#[tauri::command]
async fn compare_student_trained_vs_student_cmd(
    self_student_email: String,
    opponent_student_email: String,
    prompt: String,
) -> Result<StudentVsStudentDuelResponse, String> {
    compare_student_trained_vs_student(CompareStudentVsStudentRequest {
        self_student_email,
        opponent_student_email,
        prompt,
    })
    .await
}

#[tauri::command]
fn append_student_artifact_cmd(
    student_email: String,
    artifact_type: String,
    label: String,
    detail: Option<String>,
) -> Result<(), String> {
    append_student_artifact(AppendStudentArtifactRequest {
        student_email,
        artifact_type,
        label,
        detail,
    })
}

#[tauri::command]
fn get_student_artifact_summary_cmd(
    student_email: String,
) -> Result<StudentArtifactSummaryView, String> {
    get_student_artifact_summary(student_email)
}

#[tauri::command]
fn list_recent_student_artifacts_cmd(
    student_email: String,
    limit: Option<i32>,
) -> Result<Vec<StudentArtifactRecordView>, String> {
    list_recent_student_artifacts(student_email, limit)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_database_status_cmd,
            resolve_user_by_email_cmd,
            login_user_cmd,
            register_student_user_cmd,
            create_student_for_teacher_cmd,
            list_students_for_teacher_cmd,
            submit_classification_attempt_cmd,
            submit_ranking_attempt_cmd,
            submit_policy_path_attempt_cmd,
            submit_data_cleaning_attempt_cmd,
            classification_task_completed_cmd,
            get_student_ai_companion_cmd,
            get_model_training_status_cmd,
            train_student_model_cmd,
            get_prompt_lab_exercise_cmd,
            submit_prompt_experiment_cmd,
            run_prompt_lab_experiment_cmd,
            save_prompt_lab_experiment_cmd,
            list_prompt_lab_experiments_cmd,
            get_chat_training_context_cmd,
            generate_chat_training_answer_cmd,
            generate_lesson_companion_reflection_cmd,
            save_chat_training_interaction_cmd,
            list_chat_training_interactions_cmd,
            get_ai_exam_blueprint_cmd,
            submit_ai_exam_cmd,
            export_student_training_dataset_cmd,
            register_student_ollama_model_cmd,
            get_student_training_pipeline_status_cmd,
            set_student_trained_model_usage_cmd,
            prepare_student_training_job_cmd,
            compare_student_models_cmd,
            list_compare_run_history_cmd,
            save_pairwise_preference_cmd,
            list_pairwise_preferences_cmd,
            save_benchmark_run_cmd,
            list_benchmark_run_history_cmd,
            generate_ai_studio_project_cmd,
            save_ai_studio_project_version_cmd,
            list_ai_studio_project_versions_cmd,
            export_ai_studio_project_cmd,
            export_student_ai_package_cmd,
            list_arena_student_opponents_cmd,
            compare_student_trained_vs_student_cmd,
            append_student_artifact_cmd,
            get_student_artifact_summary_cmd,
            list_recent_student_artifacts_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
