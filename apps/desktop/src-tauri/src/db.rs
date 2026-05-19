//! Direct SQLite access aligned with Prisma schema (`packages/database/prisma`).

use crate::exam_benchmark;
use crate::ollama;

use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use bcrypt::{hash, verify, DEFAULT_COST};
use rusqlite::{params, Connection, Transaction};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

static DATABASE_READY: OnceLock<Result<DatabaseRuntimePaths, String>> = OnceLock::new();
const EMBEDDED_SEED_DB: &[u8] = include_bytes!("../../../../packages/database/prisma/dev.sqlite");
const TRAIN_LORA_STUDENT_SCRIPT: &str = include_str!("../../../../tools/training/train_lora_student.py");
const REGISTER_OLLAMA_ADAPTER_SCRIPT: &str =
    include_str!("../../../../tools/training/register_ollama_adapter.py");
const TRAINING_REQUIREMENTS: &str = include_str!("../../../../tools/training/requirements.txt");

#[derive(Debug, Clone)]
struct DatabaseRuntimePaths {
    db_path: PathBuf,
    data_dir: PathBuf,
    backups_dir: PathBuf,
    templates_dir: PathBuf,
    using_env_override: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatusView {
    pub db_path: String,
    pub data_dir: String,
    pub backups_dir: String,
    pub templates_dir: String,
    pub using_env_override: bool,
    pub database_exists: bool,
}

fn timestamp_unix_secs_local() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|e| e.to_string())
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var(name)
        .ok()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .map(PathBuf::from)
}

fn repo_seed_db_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/database/prisma/dev.sqlite")
}

fn default_class_root() -> PathBuf {
    if let Some(root) = env_path("AI_LAB_CLASS_ROOT") {
        return root;
    }

    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"C:\AI-Lab-Class")
    }

    #[cfg(not(target_os = "windows"))]
    {
        env_path("HOME")
            .unwrap_or_else(|| std::env::temp_dir())
            .join("AI-Lab-Class")
    }
}

fn fallback_class_root() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        env_path("LOCALAPPDATA")
            .unwrap_or_else(|| std::env::temp_dir())
            .join("AI-Lab-Class")
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::temp_dir().join("AI-Lab-Class")
    }
}

fn create_dir_with_fallback(primary: PathBuf) -> Result<PathBuf, String> {
    match std::fs::create_dir_all(&primary) {
        Ok(_) => Ok(primary),
        Err(primary_error) => {
            let fallback = fallback_class_root();
            std::fs::create_dir_all(&fallback).map_err(|fallback_error| {
                format!(
                    "Не удалось создать папку данных `{}` ({primary_error}) и запасную папку `{}` ({fallback_error}).",
                    primary.display(),
                    fallback.display()
                )
            })?;
            Ok(fallback)
        }
    }
}

fn database_template_candidates(paths: &DatabaseRuntimePaths) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(p) = env_path("AI_LAB_DATABASE_TEMPLATE_PATH") {
        out.push(p);
    }
    out.push(paths.templates_dir.join("ai-lab-template.sqlite"));
    out.push(paths.templates_dir.join("dev.sqlite"));
    out.push(repo_seed_db_path());
    out
}

fn copy_database_template_if_needed(paths: &DatabaseRuntimePaths) -> Result<bool, String> {
    if paths.db_path.exists() {
        return Ok(false);
    }

    if let Some(parent) = paths.db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    for candidate in database_template_candidates(paths) {
        if candidate.exists() {
            std::fs::copy(&candidate, &paths.db_path).map_err(|e| {
                format!(
                    "Не удалось создать рабочую базу `{}` из шаблона `{}`: {e}",
                    paths.db_path.display(),
                    candidate.display()
                )
            })?;
            return Ok(true);
        }
    }

    std::fs::write(&paths.db_path, EMBEDDED_SEED_DB).map_err(|e| {
        format!(
            "Не удалось создать рабочую базу `{}` из встроенного шаблона: {e}",
            paths.db_path.display()
        )
    })?;
    Ok(true)
}

fn backup_database_once(paths: &DatabaseRuntimePaths, just_created: bool) -> Result<(), String> {
    if just_created || !paths.db_path.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(&paths.backups_dir).map_err(|e| e.to_string())?;
    let stamp = timestamp_unix_secs_local()?;
    let backup_path = paths
        .backups_dir
        .join(format!("ai-lab-backup-{stamp}.sqlite"));
    std::fs::copy(&paths.db_path, &backup_path).map_err(|e| {
        format!(
            "Не удалось создать резервную копию базы `{}`: {e}",
            backup_path.display()
        )
    })?;
    Ok(())
}

fn resolve_database_paths() -> Result<DatabaseRuntimePaths, String> {
    if let Some(explicit_db_path) = env_path("AI_LAB_DATABASE_PATH") {
        let data_dir = explicit_db_path
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(default_class_root);
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let class_root = data_dir
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| data_dir.clone());
        return Ok(DatabaseRuntimePaths {
            db_path: explicit_db_path,
            data_dir,
            backups_dir: class_root.join("backups"),
            templates_dir: class_root.join("templates"),
            using_env_override: true,
        });
    }

    let class_root = create_dir_with_fallback(default_class_root())?;
    let data_dir = class_root.join("data");
    let backups_dir = class_root.join("backups");
    let templates_dir = class_root.join("templates");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&templates_dir).map_err(|e| e.to_string())?;
    Ok(DatabaseRuntimePaths {
        db_path: data_dir.join("ai-lab.sqlite"),
        data_dir,
        backups_dir,
        templates_dir,
        using_env_override: false,
    })
}

fn prepare_database_runtime() -> Result<DatabaseRuntimePaths, String> {
    let paths = resolve_database_paths()?;
    let just_created = copy_database_template_if_needed(&paths)?;
    backup_database_once(&paths, just_created)?;
    Ok(paths)
}

fn database_runtime_paths() -> Result<DatabaseRuntimePaths, String> {
    DATABASE_READY
        .get_or_init(prepare_database_runtime)
        .clone()
}

fn db_path() -> Result<PathBuf, String> {
    Ok(database_runtime_paths()?.db_path)
}

pub fn get_database_status() -> Result<DatabaseStatusView, String> {
    let paths = database_runtime_paths()?;
    Ok(DatabaseStatusView {
        database_exists: paths.db_path.exists(),
        db_path: paths.db_path.to_string_lossy().to_string(),
        data_dir: paths.data_dir.to_string_lossy().to_string(),
        backups_dir: paths.backups_dir.to_string_lossy().to_string(),
        templates_dir: paths.templates_dir.to_string_lossy().to_string(),
        using_env_override: paths.using_env_override,
    })
}

fn open_read_write() -> Result<Connection, String> {
    let path = db_path()?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 7000;",
    )
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedUserView {
    pub id: String,
    pub email: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Resolve a `User` row by email (case-insensitive). Used for DB-backed login and route protection.
pub fn resolve_user_by_email(email: String) -> Result<ResolvedUserView, String> {
    let email = email.trim();
    if email.is_empty() {
        return Err("Укажите email.".to_string());
    }
    let conn = open_read_write()?;
    let row = conn.query_row(
        r#"SELECT id, email, role FROM "User" WHERE LOWER(TRIM(email)) = LOWER(TRIM(?1)) LIMIT 1"#,
        params![email],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    );
    match row {
        Ok((id, email_db, role_raw)) => {
            let role = role_raw.trim().to_lowercase();
            if role != "student" && role != "teacher" && role != "admin" {
                return Err("Некорректная роль пользователя в базе.".to_string());
            }
            Ok(ResolvedUserView {
                id,
                email: email_db,
                role,
                name: None,
            })
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(
            "Пользователь не найден. Обратитесь к учителю или администратору.".to_string(),
        ),
        Err(e) => Err(e.to_string()),
    }
}

fn user_table_column_exists(conn: &Connection, column_name: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(r#"PRAGMA table_info("User")"#)
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let current: String = row.get(1).map_err(|e| e.to_string())?;
        if current == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_user_display_name_column(conn: &Connection) -> Result<(), String> {
    if !user_table_column_exists(conn, "displayName")? {
        conn.execute(
            r#"ALTER TABLE "User" ADD COLUMN "displayName" TEXT"#,
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_user_password_hash_column(conn: &Connection) -> Result<(), String> {
    if !user_table_column_exists(conn, "passwordHash")? {
        conn.execute(
            r#"ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT"#,
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginUserView {
    pub id: String,
    pub email: String,
    pub role: String,
    pub display_name: Option<String>,
}

pub fn register_student_user(email: String, password: String) -> Result<LoginUserView, String> {
    let email = email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email.".to_string());
    }
    let password = password.trim().to_string();
    if password.len() < 6 {
        return Err("Пароль должен содержать минимум 6 символов.".to_string());
    }

    let mut conn = open_read_write()?;
    ensure_user_display_name_column(&conn)?;
    ensure_user_password_hash_column(&conn)?;
    let password_hash = hash(password, DEFAULT_COST).map_err(|e| e.to_string())?;

    let existing = conn.query_row(
        r#"SELECT id, email, role, "displayName", "passwordHash"
           FROM "User"
           WHERE LOWER(TRIM(email)) = LOWER(TRIM(?1))
           LIMIT 1"#,
        params![email.as_str()],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        },
    );

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let (id, email_db, display_name) = match existing {
        Ok((id, email_db, role_raw, display_name, existing_hash)) => {
            let role = role_raw.trim().to_lowercase();
            if role != "student" {
                return Err("Этот email уже используется не учеником.".to_string());
            }
            if existing_hash.as_deref().map(str::trim).unwrap_or("").is_empty() {
                tx.execute(
                    r#"UPDATE "User"
                       SET "passwordHash" = ?1, "updatedAt" = datetime('now')
                       WHERE id = ?2"#,
                    params![password_hash.as_str(), id.as_str()],
                )
                .map_err(|e| e.to_string())?;
                (id, email_db, display_name)
            } else {
                return Err("Ученик с этим email уже зарегистрирован. Войдите с паролем.".to_string());
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let id = format!("{}", Uuid::new_v4());
            let display_name = email.split('@').next().map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
            tx.execute(
                r#"INSERT INTO "User" ("id", "email", "role", "passwordHash", "displayName", "createdAt", "updatedAt")
                   VALUES (?1, ?2, 'student', ?3, ?4, datetime('now'), datetime('now'))"#,
                params![id.as_str(), email.as_str(), password_hash.as_str(), display_name.as_deref()],
            )
            .map_err(|e| e.to_string())?;
            (id, email.clone(), display_name)
        }
        Err(e) => return Err(e.to_string()),
    };

    ensure_student_companion(&tx, &id)?;
    ensure_model_profile(&tx, &id)?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(LoginUserView {
        id,
        email: email_db,
        role: "student".to_string(),
        display_name,
    })
}

pub fn login_user(email: String, password: String) -> Result<LoginUserView, String> {
    let email = email.trim();
    if email.is_empty() {
        return Err("Укажите email.".to_string());
    }
    let conn = open_read_write()?;
    ensure_user_display_name_column(&conn)?;
    ensure_user_password_hash_column(&conn)?;
    let row = conn.query_row(
        r#"SELECT id, email, role, "displayName", "passwordHash"
           FROM "User"
           WHERE LOWER(TRIM(email)) = LOWER(TRIM(?1))
           LIMIT 1"#,
        params![email],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        },
    );
    let (id, email_db, role_raw, display_name, password_hash) = match row {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Err("Пользователь не найден".to_string()),
        Err(e) => return Err(e.to_string()),
    };
    let password_hash = match password_hash {
        Some(v) if !v.trim().is_empty() => v,
        _ => return Err("Пароль не установлен".to_string()),
    };
    let is_ok = verify(password, &password_hash).map_err(|e| e.to_string())?;
    if !is_ok {
        return Err("Неверный пароль".to_string());
    }
    let role = role_raw.trim().to_lowercase();
    if role != "student" && role != "teacher" && role != "admin" {
        return Err("Некорректная роль пользователя в базе.".to_string());
    }
    Ok(LoginUserView {
        id,
        email: email_db,
        role,
        display_name,
    })
}

fn ensure_teacher_student_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "TeacherStudent" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "teacherId" TEXT NOT NULL,
            "studentId" TEXT NOT NULL,
            "groupName" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "TeacherStudent_teacherId_studentId_key"
            ON "TeacherStudent"("teacherId", "studentId");
        CREATE INDEX IF NOT EXISTS "TeacherStudent_teacherId_idx"
            ON "TeacherStudent"("teacherId");
        CREATE INDEX IF NOT EXISTS "TeacherStudent_studentId_idx"
            ON "TeacherStudent"("studentId");
        "#,
    )
    .map_err(|e| e.to_string())
}

fn resolve_teacher_id(
    conn: &Connection,
    teacher_email: Option<&str>,
    teacher_id: Option<&str>,
) -> Result<String, String> {
    if let Some(id) = teacher_id.map(str::trim).filter(|s| !s.is_empty()) {
        let ok: i32 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM "User" WHERE id = ?1 AND role = 'teacher'"#,
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if ok == 0 {
            return Err("Учитель с указанным id не найден.".to_string());
        }
        return Ok(id.to_string());
    }
    let email = teacher_email
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Укажите email учителя.".to_string())?;
    conn.query_row(
        r#"SELECT id FROM "User" WHERE LOWER(TRIM(email)) = LOWER(TRIM(?1)) AND role = 'teacher' LIMIT 1"#,
        params![email],
        |row| row.get::<_, String>(0),
    )
    .map_err(|_| "Учитель с таким email не найден или у вас нет прав учителя.".to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeacherLinkedStudentView {
    pub student_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub group_name: Option<String>,
    pub linked_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStudentForTeacherResponse {
    pub student_id: String,
    pub student_email: String,
    pub display_name: Option<String>,
    pub group_name: Option<String>,
    pub linked_at: String,
    pub was_new_user: bool,
    pub was_new_link: bool,
}

/// Create or link a student user to a teacher roster. Caller must supply a valid teacher email or id.
pub fn create_student_for_teacher(
    teacher_email: Option<String>,
    teacher_id: Option<String>,
    student_email: String,
    student_display_name: Option<String>,
    group_name: Option<String>,
) -> Result<CreateStudentForTeacherResponse, String> {
    let student_email = student_email.trim().to_string();
    if student_email.is_empty() {
        return Err("Укажите email ученика.".to_string());
    }
    let group_name = group_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let display_in = student_display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let mut conn = open_read_write()?;
    ensure_user_display_name_column(&conn)?;
    ensure_teacher_student_table(&conn)?;

    let tid = resolve_teacher_id(
        &conn,
        teacher_email.as_deref(),
        teacher_id.as_deref(),
    )?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let student_row: Option<(String, String, Option<String>)> = match tx.query_row(
        r#"SELECT id, role, displayName FROM "User" WHERE LOWER(TRIM(email)) = LOWER(TRIM(?1)) LIMIT 1"#,
        params![student_email.as_str()],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        },
    ) {
        Ok(x) => Some(x),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e.to_string()),
    };

    let (student_id, was_new_user) = if let Some((sid, role, existing_name)) = student_row {
        let role = role.trim().to_lowercase();
        if role != "student" {
            return Err(
                "Пользователь с этим email уже зарегистрирован не как ученик.".to_string(),
            );
        }
        if let Some(ref n) = display_in {
            let need_set = existing_name.as_deref().map(str::trim).unwrap_or("").is_empty();
            if need_set {
                tx.execute(
                    r#"UPDATE "User" SET "displayName" = ?1, "updatedAt" = datetime('now') WHERE id = ?2"#,
                    params![n, sid.as_str()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        (sid, false)
    } else {
        let sid = format!("{}", Uuid::new_v4());
        tx.execute(
            r#"INSERT INTO "User" ("id", "email", "role", "displayName", "createdAt", "updatedAt")
               VALUES (?1, ?2, 'student', ?3, datetime('now'), datetime('now'))"#,
            params![sid.as_str(), student_email.as_str(), display_in.as_deref()],
        )
        .map_err(|e| e.to_string())?;
        (sid, true)
    };

    let link_exists: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "TeacherStudent" WHERE "teacherId" = ?1 AND "studentId" = ?2"#,
            params![tid.as_str(), student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let was_new_link = if link_exists == 0 {
        let link_id = format!("{}", Uuid::new_v4());
        tx.execute(
            r#"INSERT INTO "TeacherStudent" ("id", "teacherId", "studentId", "groupName", "createdAt")
               VALUES (?1, ?2, ?3, ?4, datetime('now'))"#,
            params![link_id, tid.as_str(), student_id.as_str(), group_name.as_deref()],
        )
        .map_err(|e| e.to_string())?;
        true
    } else {
        if group_name.is_some() {
            tx.execute(
                r#"UPDATE "TeacherStudent" SET "groupName" = ?1 WHERE "teacherId" = ?2 AND "studentId" = ?3"#,
                params![group_name.as_deref(), tid.as_str(), student_id.as_str()],
            )
            .map_err(|e| e.to_string())?;
        }
        false
    };

    let linked_at: String = tx
        .query_row(
            r#"SELECT "createdAt" FROM "TeacherStudent" WHERE "teacherId" = ?1 AND "studentId" = ?2"#,
            params![tid.as_str(), student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let display_name: Option<String> = tx
        .query_row(
            r#"SELECT "displayName" FROM "User" WHERE id = ?1"#,
            params![student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let group_res: Option<String> = tx
        .query_row(
            r#"SELECT "groupName" FROM "TeacherStudent" WHERE "teacherId" = ?1 AND "studentId" = ?2"#,
            params![tid.as_str(), student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(CreateStudentForTeacherResponse {
        student_id: student_id.clone(),
        student_email,
        display_name,
        group_name: group_res,
        linked_at,
        was_new_user,
        was_new_link,
    })
}

pub fn list_students_for_teacher(
    teacher_email: Option<String>,
    teacher_id: Option<String>,
) -> Result<Vec<TeacherLinkedStudentView>, String> {
    let conn = open_read_write()?;
    ensure_user_display_name_column(&conn)?;
    ensure_teacher_student_table(&conn)?;
    let tid = resolve_teacher_id(
        &conn,
        teacher_email.as_deref(),
        teacher_id.as_deref(),
    )?;

    let mut stmt = conn
        .prepare(
            r#"SELECT u.id, u.email, u.displayName, ts."groupName", ts."createdAt"
               FROM "TeacherStudent" ts
               INNER JOIN "User" u ON u.id = ts."studentId"
               WHERE ts."teacherId" = ?1
               ORDER BY ts."createdAt" DESC"#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![tid.as_str()], |row| {
            Ok(TeacherLinkedStudentView {
                student_id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                group_name: row.get(3)?,
                linked_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[derive(Debug)]
pub struct SubmitClassificationRequest {
    pub student_email: String,
    pub lesson_id: String,
    pub task_id: String,
    pub selected_answer: String,
}

#[derive(Debug)]
pub struct SubmitRankingRequest {
    pub student_email: String,
    pub lesson_id: String,
    pub task_id: String,
    pub ranked_order_json: String,
}

#[derive(Debug)]
pub struct SubmitDataCleaningRequest {
    pub student_email: String,
    pub lesson_id: String,
    pub task_id: String,
    pub selection_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitClassificationResponse {
    pub is_correct: bool,
    pub correct_answer: String,
    pub lesson_progress_percent: i32,
    pub new_xp: i32,
    pub xp_earned_this_attempt: i32,
    pub first_completion: bool,
}

#[derive(Debug)]
pub struct TaskStatusRequest {
    pub student_email: String,
    pub task_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatusResponse {
    pub completed: bool,
}

const XP_FIRST_CORRECT: i32 = 15;
const XP_FIRST_WRONG: i32 = 4;

/// Stat points added per affected dimension on first task completion.
const COMPANION_STEP: i32 = 2;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentAiCompanionView {
    pub name: String,
    pub stage: i32,
    pub personality_type: String,
    pub logic: i32,
    pub creativity: i32,
    pub empathy: i32,
    pub focus: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTrainingStatusView {
    pub model_type: String,
    pub dataset_size: i32,
    pub accuracy: f64,
    pub last_trained_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainModelResponse {
    pub previous_accuracy: f64,
    pub new_accuracy: f64,
    pub dataset_size: i32,
    pub improvement: f64,
    pub last_trained_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptLabExerciseView {
    pub task_title: String,
    pub task_description: String,
    pub weak_prompt: String,
    pub weak_output: String,
    pub improved_prompt_options: Vec<String>,
    pub improved_output: String,
    pub explanation: String,
}

#[derive(Debug)]
pub struct SubmitPromptExperimentRequest {
    pub student_email: String,
    pub improved_prompt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptLabRunResponse {
    pub model_name: String,
    pub using_trained_model: bool,
    pub task_input: String,
    pub prompt_a: String,
    pub prompt_b: String,
    pub output_a: String,
    pub output_b: String,
}

#[derive(Debug)]
pub struct SavePromptLabExperimentRequest {
    pub student_email: String,
    pub task_title: String,
    pub task_input: String,
    pub prompt_a: String,
    pub prompt_b: String,
    pub output_a: String,
    pub output_b: String,
    pub winner: String,
    pub rationale: Option<String>,
    pub model_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitPromptExperimentResponse {
    pub experiment_id: String,
    pub improved_prompt: String,
    pub improved_output: String,
    pub explanation: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptLabExperimentHistoryItemView {
    pub experiment_id: String,
    pub task_title: String,
    pub task_input: String,
    pub prompt_a: String,
    pub prompt_b: String,
    pub output_a: String,
    pub output_b: String,
    pub winner: String,
    pub rationale: String,
    pub model_name: Option<String>,
    pub created_at: String,
}

const PROMPT_LAB_TASK_TITLE: &str = "Поддерживающий учебный ответ";
const PROMPT_LAB_TASK_DESCRIPTION: &str = "Составьте запрос к ИИ, чтобы получить полезное объяснение ошибки в решении ученика, а не общий ответ.";
const PROMPT_LAB_WEAK_PROMPT: &str = "Объясни математику.";
const PROMPT_LAB_WEAK_OUTPUT: &str = "Математика — это наука о числах, формулах и закономерностях. Нужно просто больше практики.";
const PROMPT_LAB_IMPROVED_OUTPUT: &str = "Разберем твой шаг с дробями: ты сложил знаменатели (5+5), но при одинаковых знаменателях нужно складывать только числители. Пример: 2/5 + 1/5 = 3/5. Проверь свое решение и перепиши последний шаг по этому правилу.";
const PROMPT_LAB_EXPLANATION: &str = "Сильный промпт задает роль (наставник), контекст ошибки (сложение дробей), формат ответа (короткий разбор + шаг исправления) и ограничения по тону. Поэтому ответ становится конкретным, применимым и дружелюбным.";
const OLLAMA_BASE_MODEL_DEFAULT: &str = "qwen3:8b";
const PROMPT_LAB_AI_UNAVAILABLE: &str = "ИИ временно недоступен";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTrainingContextView {
    pub companion_name: String,
    pub stage: i32,
    pub personality_type: String,
    pub logic: i32,
    pub creativity: i32,
    pub empathy: i32,
    pub focus: i32,
    pub model_accuracy: f64,
    pub dataset_size: i32,
    pub simulator_hint: String,
}

#[derive(Debug)]
pub struct GenerateChatTrainingAnswerRequest {
    pub student_email: String,
    pub student_message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateChatTrainingAnswerResponse {
    pub ai_answer: String,
    pub answer_quality: i32,
    pub quality_note: String,
    /// Коротко для ученика: от чего зависел черновик или запасной ответ.
    pub simulator_explanation: String,
    /// True when recent dataset / prompt-lab / chat corrections were injected into the system prompt.
    pub answer_used_training_context: bool,
    pub model_name: String,
    pub using_trained_model: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLessonCompanionReflectionResponse {
    pub reflection: String,
}

const LESSON_COMPANION_REFLECTION_GUIDE: &str = r#"Ты внутри учебной кампании (интерактивный урок в приложении).
Приложение УЖЕ локально проверило шаги ученика — не спорь с вердиктом урока, не пересказывай длинные условия.
Ответь по-русски, от первого лица, как учебный ИИ-компаньон, который ещё тренируется: 1–3 коротких предложения, можно чуть неуверенно, без markdown-списков и без лекции эксперта."#;

const LESSON_PLAIN_COMPLETION_GUIDE: &str = r#"Ты в учебной симуляции продолжения текста.
Дай ТОЛЬКО короткое продолжение на русском (1–2 фразы, без мета-комментариев, без «как модель я…», без списков).
Не повторяй дословно весь контекст — только логичный хвост."#;

fn clamp_lesson_companion_reflection(s: &str) -> String {
    let t = s.trim();
    if t.is_empty() {
        return String::new();
    }
    let collapsed: String = t
        .lines()
        .map(|l| {
            let x = l.trim();
            let y = x.trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c == '·');
            y.trim()
        })
        .filter(|l| !l.is_empty())
        .take(5)
        .collect::<Vec<_>>()
        .join(" ");
    truncate_for_chat_prompt(&collapsed, 420)
}

#[derive(Debug)]
pub struct SaveChatTrainingInteractionRequest {
    pub student_email: String,
    pub student_message: String,
    pub ai_answer: String,
    pub answer_quality: i32,
    pub student_critique: Option<String>,
    pub failure_category: Option<String>,
    pub minimal_edit: Option<String>,
    pub revised_target_answer: Option<String>,
    pub model_name: Option<String>,
    pub reference_answer: Option<String>,
    pub reference_model_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChatTrainingInteractionResponse {
    pub interaction_id: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTrainingHistoryItemView {
    pub interaction_id: String,
    pub input_prompt: String,
    pub draft_model_answer: String,
    pub student_critique: String,
    pub failure_category: String,
    pub minimal_edit: String,
    pub revised_target_answer: String,
    pub answer_quality: i32,
    pub model_name: Option<String>,
    pub reference_answer: String,
    pub reference_model_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExamSubmitResponse {
    pub exam_run_id: String,
    pub total_score: i32,
    pub skill_scores: Value,
    pub strengths: Vec<String>,
    pub weaknesses: Vec<String>,
    pub recommendation: String,
    pub created_at: String,
}

#[derive(Debug)]
pub struct RegisterStudentOllamaModelRequest {
    pub student_email: Option<String>,
    pub student_id: Option<String>,
    pub base_model: String,
    pub adapter_path: String,
    pub ollama_model_alias: String,
    pub training_summary_path: Option<String>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterStudentOllamaModelResponse {
    pub student_id: String,
    pub student_email: String,
    pub model_version_id: String,
    pub dataset_snapshot_id: Option<String>,
    pub base_model: String,
    pub adapter_path: String,
    pub ollama_model_alias: String,
    pub modelfile_path: String,
    pub training_summary_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentTrainingPipelineStatusView {
    pub student_id: String,
    pub student_email: String,
    pub dataset_snapshot_id: Option<String>,
    pub model_version_id: Option<String>,
    pub base_model_name: String,
    pub active_student_model_alias: Option<String>,
    pub using_trained_model: bool,
    pub dataset_size: i32,
    pub dataset_example_count: i32,
    pub prompt_experiment_count: i32,
    pub chat_training_interaction_count: i32,
    pub chat_training_strong_example_count: i32,
    pub export_available: bool,
    pub exported_dataset_path: Option<String>,
    pub export_metadata_path: Option<String>,
    pub export_created_at: Option<String>,
    pub export_total_rows: i32,
    pub export_dataset_example_rows: i32,
    pub export_prompt_experiment_rows: i32,
    pub export_chat_training_rows: i32,
    pub adapter_available: bool,
    pub adapter_path: Option<String>,
    pub ollama_model_registered: bool,
    pub model_registered_at: Option<String>,
    pub training_summary_path: Option<String>,
    pub suggested_next_step: String,
}

#[derive(Debug)]
pub struct CompareStudentModelsRequest {
    pub student_email: String,
    pub prompt: String,
    pub category_tag: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareStudentModelsResponse {
    pub compare_run_id: String,
    pub base_model: String,
    pub trained_model_alias: Option<String>,
    pub trained_available: bool,
    pub prompt: String,
    pub base_response: String,
    pub trained_response: Option<String>,
    pub indicators: Vec<String>,
    pub explanation: String,
    pub category_tag: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareRunHistoryItemView {
    pub compare_run_id: String,
    pub prompt: String,
    pub base_model: String,
    pub trained_model_name: Option<String>,
    pub trained_available: bool,
    pub base_output: String,
    pub trained_output: Option<String>,
    pub indicators: Vec<String>,
    pub explanation: String,
    pub category_tag: Option<String>,
    pub created_at: String,
}

#[derive(Debug)]
pub struct SavePairwisePreferenceRequest {
    pub student_email: String,
    pub prompt: String,
    pub left_model_name: String,
    pub right_model_name: String,
    pub left_output: String,
    pub right_output: String,
    pub chosen_winner: String,
    pub rationale: String,
    pub source_surface: String,
    pub compare_run_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairwisePreferenceHistoryItemView {
    pub preference_id: String,
    pub prompt: String,
    pub left_model_name: String,
    pub right_model_name: String,
    pub left_output: String,
    pub right_output: String,
    pub chosen_winner: String,
    pub rationale: String,
    pub source_surface: String,
    pub compare_run_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug)]
pub struct SaveBenchmarkRunRequest {
    pub student_email: String,
    pub mode: String,
    pub benchmark_mission_id: String,
    pub benchmark_title: String,
    pub benchmark_category: String,
    pub prompt: String,
    pub primary_model_name: String,
    pub secondary_model_name: Option<String>,
    pub primary_output: String,
    pub secondary_output: Option<String>,
    pub result_winner: String,
    pub indicators: Vec<String>,
    pub explanation: String,
    pub opponent_student_email: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRunHistoryItemView {
    pub benchmark_run_id: String,
    pub mode: String,
    pub benchmark_mission_id: String,
    pub benchmark_title: String,
    pub benchmark_category: String,
    pub prompt: String,
    pub primary_model_name: String,
    pub secondary_model_name: Option<String>,
    pub primary_output: String,
    pub secondary_output: Option<String>,
    pub result_winner: String,
    pub indicators: Vec<String>,
    pub explanation: String,
    pub opponent_student_email: Option<String>,
    pub created_at: String,
}

#[derive(Debug)]
pub struct GenerateAiStudioProjectRequest {
    pub student_email: String,
    pub project_type: String,
    pub goal: String,
    pub constraints: Option<String>,
    pub improvement_request: Option<String>,
    pub previous_html: Option<String>,
    pub previous_css: Option<String>,
    pub previous_js: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStudioGenerationResponse {
    pub project_type: String,
    pub goal: String,
    pub constraints: String,
    pub generation_request: String,
    pub html_code: String,
    pub css_code: String,
    pub js_code: String,
    pub model_name: String,
    pub using_trained_model: bool,
}

#[derive(Debug)]
pub struct SaveAiStudioProjectVersionRequest {
    pub student_email: String,
    pub project_id: Option<String>,
    pub project_type: String,
    pub goal: String,
    pub constraints: Option<String>,
    pub generation_request: String,
    pub html_code: String,
    pub css_code: String,
    pub js_code: String,
    pub model_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStudioProjectVersionView {
    pub version_id: String,
    pub project_id: String,
    pub project_type: String,
    pub goal: String,
    pub constraints: String,
    pub generation_request: String,
    pub html_code: String,
    pub css_code: String,
    pub js_code: String,
    pub model_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug)]
pub struct ExportAiStudioProjectRequest {
    pub student_email: String,
    pub project_id: Option<String>,
    pub project_type: String,
    pub goal: String,
    pub constraints: Option<String>,
    pub generation_request: String,
    pub html_code: String,
    pub css_code: String,
    pub js_code: String,
    pub model_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAiStudioProjectResponse {
    pub export_dir: String,
    pub index_html_path: String,
    pub style_css_path: String,
    pub script_js_path: String,
    pub readme_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStudentAiPackageResponse {
    pub export_dir: String,
    pub data_dir: String,
    pub model_dir: String,
    pub project_dir: String,
    pub checks_dir: String,
    pub readme_path: String,
    pub package_metadata_path: String,
    pub dataset_jsonl_path: Option<String>,
    pub dataset_metadata_path: Option<String>,
    pub project_index_html_path: Option<String>,
    pub model_card_path: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareStudentTrainingJobResponse {
    pub job_dir: String,
    pub dataset_jsonl_path: String,
    pub output_dir: String,
    pub adapter_path: String,
    pub training_summary_path: String,
    pub run_training_script_path: String,
    pub run_register_script_path: String,
    pub readme_path: String,
    pub base_hf_model: String,
    pub ollama_base_model: String,
    pub ollama_alias: String,
    pub launched: bool,
    pub warnings: Vec<String>,
}

/// Зарегистрированная student-модель в Ollama (для списка соперников на арене).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArenaStudentOpponentRow {
    pub student_email: String,
    pub ollama_model_alias: String,
}

#[derive(Debug)]
pub struct CompareStudentVsStudentRequest {
    pub self_student_email: String,
    pub opponent_student_email: String,
    pub prompt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentVsStudentDuelResponse {
    pub prompt: String,
    pub self_student_email: String,
    pub opponent_student_email: String,
    pub self_model_alias: Option<String>,
    pub opponent_model_alias: Option<String>,
    pub self_available: bool,
    pub opponent_available: bool,
    pub self_response: Option<String>,
    pub opponent_response: Option<String>,
    pub indicators: Vec<String>,
    pub explanation: String,
}

#[derive(Debug, Clone, Copy)]
pub enum StudentArtifactKind {
    PromptExperimentSaved,
    ChatTrainingSaved,
    DatasetExampleAdded,
    DatasetExported,
    LoraAdapterRegistered,
    TrainedModelActivated,
    CompareRunCompleted,
    BenchmarkEvalCompleted,
    PairwisePreferenceSaved,
    AiStudioProjectCreated,
    AiStudioVersionSaved,
}

impl StudentArtifactKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::PromptExperimentSaved => "prompt_experiment_saved",
            Self::ChatTrainingSaved => "chat_training_saved",
            Self::DatasetExampleAdded => "dataset_example_added",
            Self::DatasetExported => "dataset_exported",
            Self::LoraAdapterRegistered => "lora_adapter_registered",
            Self::TrainedModelActivated => "trained_model_activated",
            Self::CompareRunCompleted => "compare_run_completed",
            Self::BenchmarkEvalCompleted => "benchmark_eval_completed",
            Self::PairwisePreferenceSaved => "pairwise_preference_saved",
            Self::AiStudioProjectCreated => "ai_studio_project_created",
            Self::AiStudioVersionSaved => "ai_studio_version_saved",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentArtifactRecordView {
    pub artifact_id: String,
    pub artifact_type: String,
    pub label: String,
    pub detail: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentArtifactSummaryView {
    pub total_count: i32,
    pub counts_by_type: HashMap<String, i32>,
}

#[derive(Debug)]
pub struct ExportStudentTrainingDatasetRequest {
    pub student_email: Option<String>,
    pub student_id: Option<String>,
}

#[derive(Debug)]
pub struct AppendStudentArtifactRequest {
    pub student_email: String,
    pub artifact_type: String,
    pub label: String,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStudentTrainingDatasetResponse {
    pub student_id: String,
    pub student_email: String,
    pub dataset_snapshot_id: String,
    pub export_dir: String,
    pub dataset_jsonl_path: String,
    pub metadata_json_path: String,
    pub total_rows: i32,
    pub dataset_example_rows: i32,
    pub prompt_experiment_rows: i32,
    pub chat_training_rows: i32,
}

fn prompt_lab_options() -> Vec<String> {
    vec![
        "Ты — терпеливый наставник. Ученик ошибся при сложении дробей с одинаковыми знаменателями. Коротко укажи ошибку, покажи правильный шаг на примере 2/5 + 1/5 и дай одно действие, что сделать дальше.".to_string(),
        "Дай идеальный ответ по математике.".to_string(),
        "Объясни всё очень подробно про дроби и историю математики.".to_string(),
    ]
}

fn clamp_quality(v: i32) -> i32 {
    v.clamp(1, 5)
}

fn ensure_student_companion(tx: &Transaction<'_>, student_id: &str) -> Result<(), String> {
    let count: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "StudentAICompanion" WHERE "studentId" = ?1"#,
            params![student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }
    let id = format!("{}", Uuid::new_v4());
    tx.execute(
        r#"INSERT INTO "StudentAICompanion" (
            id, "studentId", name, stage, "personalityType", logic, creativity, empathy, focus, "createdAt", "updatedAt"
        ) VALUES (?1, ?2, 'Лума', 1, 'explorer', 5, 5, 5, 5, datetime('now'), datetime('now'))"#,
        params![id, student_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_model_profile(tx: &Transaction<'_>, student_id: &str) -> Result<(), String> {
    let count: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "ModelProfile" WHERE "studentId" = ?1"#,
            params![student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }
    tx.execute(
        r#"INSERT INTO "ModelProfile"
           (id, "studentId", "modelType", "datasetSize", accuracy, "lastTrainedAt")
           VALUES (?1, ?2, 'baseline_classifier', 0, 0.0, NULL)"#,
        params![format!("{}", Uuid::new_v4()), student_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Applies task-type influence rules when a task is **first** completed (same moment as XP grant).
fn apply_companion_on_first_task_completion(
    tx: &Transaction<'_>,
    student_id: &str,
    task_type: &str,
) -> Result<(), String> {
    ensure_student_companion(tx, student_id)?;
    let (dl, dc, de, df) = match task_type {
        "classification" => (COMPANION_STEP, 0, 0, COMPANION_STEP),
        "ranking" => (COMPANION_STEP, 0, COMPANION_STEP, 0),
        "policy_path" => (COMPANION_STEP, 0, 0, COMPANION_STEP),
        "data_cleaning" => (COMPANION_STEP, 0, 0, COMPANION_STEP),
        _ => (0, 0, 0, 0),
    };
    if dl == 0 && dc == 0 && de == 0 && df == 0 {
        return Ok(());
    }
    tx.execute(
        r#"UPDATE "StudentAICompanion" SET
            logic = logic + ?1,
            creativity = creativity + ?2,
            empathy = empathy + ?3,
            focus = focus + ?4,
            stage = CASE WHEN stage < 99 THEN stage + 1 ELSE stage END,
            "updatedAt" = datetime('now')
           WHERE "studentId" = ?5"#,
        params![dl, dc, de, df, student_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_student_ai_companion(student_email: String) -> Result<StudentAiCompanionView, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    ensure_student_companion(&tx, &user_id)?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::DatasetExampleAdded,
        "Добавлен новый пример обучения",
        "Сохранённая пара запрос/целевой ответ готова для данных обучения.",
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    conn.query_row(
        r#"SELECT name, stage, "personalityType", logic, creativity, empathy, focus
           FROM "StudentAICompanion" WHERE "studentId" = ?1"#,
        params![user_id],
        |row| {
            Ok(StudentAiCompanionView {
                name: row.get(0)?,
                stage: row.get(1)?,
                personality_type: row.get(2)?,
                logic: row.get(3)?,
                creativity: row.get(4)?,
                empathy: row.get(5)?,
                focus: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn dataset_metrics_for_student(conn: &Connection, student_id: &str) -> Result<(i32, f64), String> {
    let total: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "DatasetExample" WHERE "studentId" = ?1"#,
            params![student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if total == 0 {
        return Ok((0, 0.0));
    }
    let correct: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "DatasetExample" WHERE "studentId" = ?1 AND "isCorrect" = 1"#,
            params![student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let acc = (correct as f64 / total as f64) * 100.0;
    Ok((total, acc))
}

pub fn get_model_training_status(student_email: String) -> Result<ModelTrainingStatusView, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    ensure_model_profile(&tx, &user_id)?;
    tx.commit().map_err(|e| e.to_string())?;

    let (dataset_size, accuracy) = dataset_metrics_for_student(&conn, &user_id)?;

    let row = conn.query_row(
        r#"SELECT "modelType", "lastTrainedAt"
           FROM "ModelProfile" WHERE "studentId" = ?1"#,
        params![user_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        },
    );

    match row {
        Ok((model_type, last_raw)) => {
            let last_trained_at = last_raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            Ok(ModelTrainingStatusView {
                model_type,
                dataset_size,
                accuracy,
                last_trained_at,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

pub fn train_student_model(student_email: String) -> Result<TrainModelResponse, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let (dataset_size, new_accuracy) = dataset_metrics_for_student(&conn, &user_id)?;
    if dataset_size == 0 {
        return Err("Нет примеров обучения — сначала добавьте несколько примеров в AI Lab.".into());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    ensure_model_profile(&tx, &user_id)?;

    let profile_id: String = tx
        .query_row(
            r#"SELECT id FROM "ModelProfile" WHERE "studentId" = ?1"#,
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let accuracy_before: f64 = tx
        .query_row(
            r#"SELECT accuracy FROM "ModelProfile" WHERE id = ?1"#,
            params![profile_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let run_id = format!("{}", Uuid::new_v4());
    tx.execute(
        r#"INSERT INTO "TrainingRun"
           (id, "studentId", "modelProfileId", "examplesUsed", "accuracyBefore", "accuracyAfter", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))"#,
        params![
            run_id,
            user_id,
            profile_id,
            dataset_size,
            accuracy_before,
            new_accuracy,
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        r#"UPDATE "ModelProfile" SET
            "datasetSize" = ?1,
            accuracy = ?2,
            "lastTrainedAt" = datetime('now')
           WHERE id = ?3"#,
        params![dataset_size, new_accuracy, profile_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let last_trained_at: String = conn
        .query_row(
            r#"SELECT "lastTrainedAt" FROM "ModelProfile" WHERE id = ?1"#,
            params![profile_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let improvement = new_accuracy - accuracy_before;
    Ok(TrainModelResponse {
        previous_accuracy: accuracy_before,
        new_accuracy,
        dataset_size,
        improvement,
        last_trained_at,
    })
}

pub fn get_prompt_lab_exercise(student_email: String) -> Result<PromptLabExerciseView, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    let _: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    Ok(PromptLabExerciseView {
        task_title: PROMPT_LAB_TASK_TITLE.to_string(),
        task_description: PROMPT_LAB_TASK_DESCRIPTION.to_string(),
        weak_prompt: PROMPT_LAB_WEAK_PROMPT.to_string(),
        weak_output: PROMPT_LAB_WEAK_OUTPUT.to_string(),
        improved_prompt_options: prompt_lab_options(),
        improved_output: PROMPT_LAB_IMPROVED_OUTPUT.to_string(),
        explanation: PROMPT_LAB_EXPLANATION.to_string(),
    })
}

fn prompt_lab_output_or_fallback(raw: Result<String, String>) -> String {
    match raw {
        Ok(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                "Пустой ответ модели.".to_string()
            } else {
                trimmed.to_string()
            }
        }
        Err(_) => PROMPT_LAB_AI_UNAVAILABLE.to_string(),
    }
}

fn prompt_lab_selected_model(conn: &Connection, student_id: &str) -> Result<(String, bool), String> {
    let use_trained_model = student_prefers_trained_model(conn, student_id)?;
    if use_trained_model {
        if let Some(alias) = get_active_student_ollama_model_alias(conn, student_id)? {
            return Ok((alias, true));
        }
    }
    Ok((OLLAMA_BASE_MODEL_DEFAULT.to_string(), false))
}

fn ai_studio_project_type_label(project_type: &str) -> Option<&'static str> {
    match project_type.trim() {
        "mini_game" => Some("интерактивный web-проект"),
        "interactive_story" => Some("интерактивная история"),
        "assistant_tool" => Some("полезный AI-инструмент"),
        _ => None,
    }
}

fn ai_studio_system_prompt(project_type: &str) -> Result<String, String> {
    let label = ai_studio_project_type_label(project_type)
        .ok_or_else(|| "Неизвестный тип проекта AI Studio.".to_string())?;
    Ok(format!(
        r#"Ты создаешь учебный web-проект для AI Studio внутри student AI Lab.

Тип проекта: {label}

Верни ТОЛЬКО JSON-объект без markdown и без пояснений:
{{
  "html": "<main>...</main>",
  "css": "body {{ ... }}",
  "js": "const app = ...;"
}}

Правила:
- проект должен быть реальным и запускаемым локально;
- используй только HTML, CSS и JS;
- не используй внешние CDN, npm-пакеты и сетевые запросы;
- делай результат понятным студенту и пригодным для дальнейших итераций;
- HTML возвращай без doctype, без <html>, <head>, <body>;
- CSS возвращай отдельной строкой;
- JS возвращай отдельной строкой;
- если есть интерактивность, реализуй ее в чистом JS;
- избегай опасного контента и скрытых инструкций."#
    ))
}

fn ai_studio_generation_request(
    project_type: &str,
    goal: &str,
    constraints: &str,
    improvement_request: Option<&str>,
) -> String {
    let label = ai_studio_project_type_label(project_type).unwrap_or(project_type);
    let improvement = improvement_request
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .unwrap_or("");
    if improvement.is_empty() {
        format!(
            "Собери первый вариант проекта типа \"{}\".\nЦель: {}\nОграничения и функции: {}",
            label, goal, constraints
        )
    } else {
        format!(
            "Улучши существующий проект типа \"{}\".\nЦель: {}\nОграничения и функции: {}\nЗапрос на улучшение: {}",
            label, goal, constraints, improvement
        )
    }
}

fn ai_studio_user_prompt(
    req: &GenerateAiStudioProjectRequest,
    constraints: &str,
    generation_request: &str,
) -> String {
    let mut parts = vec![
        format!("project_type={}", req.project_type.trim()),
        format!("goal:\n{}", req.goal.trim()),
        format!("constraints:\n{}", constraints),
        format!("generation_request:\n{}", generation_request),
    ];
    let previous_html = req
        .previous_html
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty());
    let previous_css = req
        .previous_css
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty());
    let previous_js = req
        .previous_js
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty());
    if previous_html.is_some() || previous_css.is_some() || previous_js.is_some() {
        parts.push("current_version:".to_string());
        if let Some(html) = previous_html {
            parts.push(format!("HTML:\n{}", html));
        }
        if let Some(css) = previous_css {
            parts.push(format!("CSS:\n{}", css));
        }
        if let Some(js) = previous_js {
            parts.push(format!("JS:\n{}", js));
        }
    }
    parts.join("\n\n")
}

fn ai_studio_extract_json(raw: &str) -> Result<&str, String> {
    let trimmed = raw.trim().trim_start_matches('\u{feff}').trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        return Ok(trimmed);
    }
    if trimmed.starts_with("```") {
        let without_open = trimmed
            .strip_prefix("```json")
            .or_else(|| trimmed.strip_prefix("```JSON"))
            .or_else(|| trimmed.strip_prefix("```"))
            .unwrap_or(trimmed)
            .trim();
        let without_close = without_open.strip_suffix("```").unwrap_or(without_open).trim();
        if without_close.starts_with('{') && without_close.ends_with('}') {
            return Ok(without_close);
        }
    }
    let start = trimmed
        .find('{')
        .ok_or_else(|| "AI Studio: модель вернула ответ без JSON.".to_string())?;
    let end = trimmed
        .rfind('}')
        .ok_or_else(|| "AI Studio: модель вернула поврежденный JSON.".to_string())?;
    trimmed
        .get(start..=end)
        .ok_or_else(|| "AI Studio: не удалось выделить JSON-ответ.".to_string())
}

fn ai_studio_required_json_text<'a>(
    value: &'a Value,
    field: &str,
    missing_message: &str,
) -> Result<&'a str, String> {
    value.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .ok_or_else(|| missing_message.to_string())
}

fn ai_studio_optional_json_text(value: &Value, field: &str) -> Result<String, String> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(text)) => Ok(text.trim().to_string()),
        Some(_) => Err(format!("AI Studio: поле `{field}` должно быть строкой.")),
    }
}

fn ai_studio_parse_generation_payload(raw: &str) -> Result<(String, String, String), String> {
    let json_str = ai_studio_extract_json(raw)?;
    let value: Value = serde_json::from_str(json_str)
        .map_err(|_| "AI Studio: модель вернула невалидный JSON.".to_string())?;
    if !value.is_object() {
        return Err("AI Studio: модель вернула JSON не в формате объекта.".to_string());
    }
    let html = ai_studio_required_json_text(
        &value,
        "html",
        "AI Studio: модель не вернула HTML.",
    )?;
    let css = ai_studio_optional_json_text(&value, "css")?;
    let js = ai_studio_optional_json_text(&value, "js")?;
    if !html.contains('<') || !html.contains('>') {
        return Err("AI Studio: HTML проекта выглядит поврежденным.".to_string());
    }
    if html.chars().count() > 50_000 || css.chars().count() > 50_000 || js.chars().count() > 50_000 {
        return Err("AI Studio: ответ модели слишком большой для v1 workspace.".to_string());
    }
    Ok((html.to_string(), css, js))
}

fn prompt_experiment_column_exists(conn: &Connection, column_name: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(r#"PRAGMA table_info("PromptExperiment")"#)
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let current: String = row.get(1).map_err(|e| e.to_string())?;
        if current == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_prompt_experiment_lab_columns(conn: &Connection) -> Result<(), String> {
    let additions = [
        ("taskInput", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "taskInput" TEXT NOT NULL DEFAULT ''"#),
        ("promptA", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "promptA" TEXT NOT NULL DEFAULT ''"#),
        ("promptB", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "promptB" TEXT NOT NULL DEFAULT ''"#),
        ("outputA", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "outputA" TEXT NOT NULL DEFAULT ''"#),
        ("outputB", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "outputB" TEXT NOT NULL DEFAULT ''"#),
        ("winner", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "winner" TEXT NOT NULL DEFAULT 'B'"#),
        (
            "judgmentRationale",
            r#"ALTER TABLE "PromptExperiment" ADD COLUMN "judgmentRationale" TEXT NOT NULL DEFAULT ''"#,
        ),
        ("modelName", r#"ALTER TABLE "PromptExperiment" ADD COLUMN "modelName" TEXT"#),
    ];
    for (column_name, sql) in additions {
        if !prompt_experiment_column_exists(conn, column_name)? {
            conn.execute(sql, []).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn chat_training_column_exists(conn: &Connection, column_name: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(r#"PRAGMA table_info("ChatTrainingInteraction")"#)
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let current: String = row.get(1).map_err(|e| e.to_string())?;
        if current == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_chat_training_authoring_columns(conn: &Connection) -> Result<(), String> {
    let additions = [
        (
            "studentCritique",
            r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "studentCritique" TEXT NOT NULL DEFAULT ''"#,
        ),
        (
            "revisedTargetAnswer",
            r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "revisedTargetAnswer" TEXT NOT NULL DEFAULT ''"#,
        ),
        (
            "failureCategory",
            r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "failureCategory" TEXT NOT NULL DEFAULT ''"#,
        ),
        (
            "minimalEdit",
            r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "minimalEdit" TEXT NOT NULL DEFAULT ''"#,
        ),
        ("modelName", r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "modelName" TEXT"#),
        (
            "referenceAnswer",
            r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "referenceAnswer" TEXT NOT NULL DEFAULT ''"#,
        ),
        (
            "referenceModelName",
            r#"ALTER TABLE "ChatTrainingInteraction" ADD COLUMN "referenceModelName" TEXT"#,
        ),
    ];
    for (column_name, sql) in additions {
        if !chat_training_column_exists(conn, column_name)? {
            conn.execute(sql, []).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn normalize_prompt_lab_winner(winner: &str) -> Result<&'static str, String> {
    match winner.trim().to_uppercase().as_str() {
        "A" => Ok("A"),
        "B" => Ok("B"),
        _ => Err("Выберите победивший промпт: A или B.".to_string()),
    }
}

fn save_prompt_lab_experiment_inner(
    conn: &mut Connection,
    user_id: &str,
    email: &str,
    req: SavePromptLabExperimentRequest,
) -> Result<PromptLabExperimentHistoryItemView, String> {
    ensure_prompt_experiment_lab_columns(conn)?;
    let task_title = req.task_title.trim();
    if task_title.is_empty() {
        return Err("Укажите название задачи эксперимента.".into());
    }
    let task_input = req.task_input.trim();
    if task_input.is_empty() {
        return Err("Введите task/input для Prompt Lab.".into());
    }
    let prompt_a = req.prompt_a.trim();
    if prompt_a.is_empty() {
        return Err("Введите Prompt A.".into());
    }
    let prompt_b = req.prompt_b.trim();
    if prompt_b.is_empty() {
        return Err("Введите Prompt B.".into());
    }
    let output_a = req.output_a.trim();
    if output_a.is_empty() {
        return Err("Сначала выполните Prompt A.".into());
    }
    let output_b = req.output_b.trim();
    if output_b.is_empty() {
        return Err("Сначала выполните Prompt B.".into());
    }
    let winner = normalize_prompt_lab_winner(&req.winner)?;
    let rationale = req.rationale.unwrap_or_default().trim().to_string();
    let model_name = req
        .model_name
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());

    let (weak_prompt, weak_output, improved_prompt, improved_output) = if winner == "A" {
        (prompt_b, output_b, prompt_a, output_a)
    } else {
        (prompt_a, output_a, prompt_b, output_b)
    };

    let experiment_id = format!("{}", Uuid::new_v4());
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "PromptExperiment"
           (id, "studentId", "taskTitle", "taskInput", "weakPrompt", "weakOutput", "improvedPrompt", "improvedOutput", explanation, "promptA", "promptB", "outputA", "outputB", winner, "judgmentRationale", "modelName", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'))"#,
        params![
            experiment_id,
            user_id,
            task_title,
            task_input,
            weak_prompt,
            weak_output,
            improved_prompt,
            improved_output,
            rationale.clone(),
            prompt_a,
            prompt_b,
            output_a,
            output_b,
            winner,
            rationale.clone(),
            model_name.clone(),
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        user_id,
        email,
        StudentArtifactKind::PromptExperimentSaved,
        "Prompt Lab: эксперимент сохранён",
        &format!("Сохранено A/B-сравнение вариантов запроса. Победитель: {}.", winner),
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "PromptExperiment" WHERE id = ?1"#,
            params![experiment_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(PromptLabExperimentHistoryItemView {
        experiment_id,
        task_title: task_title.to_string(),
        task_input: task_input.to_string(),
        prompt_a: prompt_a.to_string(),
        prompt_b: prompt_b.to_string(),
        output_a: output_a.to_string(),
        output_b: output_b.to_string(),
        winner: winner.to_string(),
        rationale,
        model_name,
        created_at,
    })
}

pub async fn run_prompt_lab_experiment(
    student_email: String,
    task_input: String,
    prompt_a: String,
    prompt_b: String,
) -> Result<PromptLabRunResponse, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let task_input = task_input.trim();
    if task_input.is_empty() {
        return Err("Введите task/input для Prompt Lab.".into());
    }
    let prompt_a = prompt_a.trim();
    if prompt_a.is_empty() {
        return Err("Введите Prompt A.".into());
    }
    let prompt_b = prompt_b.trim();
    if prompt_b.is_empty() {
        return Err("Введите Prompt B.".into());
    }

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    let (model_name, using_trained_model) = prompt_lab_selected_model(&conn, &student_id)?;

    let output_a = prompt_lab_output_or_fallback(
        ollama::generate_with_ollama(&model_name, prompt_a.to_string(), task_input.to_string()).await,
    );
    let output_b = prompt_lab_output_or_fallback(
        ollama::generate_with_ollama(&model_name, prompt_b.to_string(), task_input.to_string()).await,
    );

    Ok(PromptLabRunResponse {
        model_name,
        using_trained_model,
        task_input: task_input.to_string(),
        prompt_a: prompt_a.to_string(),
        prompt_b: prompt_b.to_string(),
        output_a,
        output_b,
    })
}

pub fn submit_prompt_experiment(
    req: SubmitPromptExperimentRequest,
) -> Result<SubmitPromptExperimentResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let improved_prompt = req.improved_prompt.trim();
    if improved_prompt.is_empty() {
        return Err("Введите улучшенный промпт".into());
    }

    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let experiment_id = format!("{}", Uuid::new_v4());
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "PromptExperiment"
           (id, "studentId", "taskTitle", "weakPrompt", "weakOutput", "improvedPrompt", "improvedOutput", explanation, "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))"#,
        params![
            experiment_id,
            user_id,
            PROMPT_LAB_TASK_TITLE,
            PROMPT_LAB_WEAK_PROMPT,
            PROMPT_LAB_WEAK_OUTPUT,
            improved_prompt,
            PROMPT_LAB_IMPROVED_OUTPUT,
            PROMPT_LAB_EXPLANATION,
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::PromptExperimentSaved,
        "Prompt Lab: эксперимент сохранён",
        "Улучшенный промпт добавлен в историю Prompt Lab.",
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "PromptExperiment" WHERE id = ?1"#,
            params![experiment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(SubmitPromptExperimentResponse {
        experiment_id,
        improved_prompt: improved_prompt.to_string(),
        improved_output: PROMPT_LAB_IMPROVED_OUTPUT.to_string(),
        explanation: PROMPT_LAB_EXPLANATION.to_string(),
        created_at,
    })
}

pub fn save_prompt_lab_experiment(
    req: SavePromptLabExperimentRequest,
) -> Result<PromptLabExperimentHistoryItemView, String> {
    let email = req.student_email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let mut conn = open_read_write()?;
    let user_id = student_id_for_email(&conn, &email)?;
    save_prompt_lab_experiment_inner(&mut conn, &user_id, &email, req)
}

pub fn list_prompt_lab_experiments(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<PromptLabExperimentHistoryItemView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    ensure_prompt_experiment_lab_columns(&conn)?;
    let take = limit.unwrap_or(12).clamp(1, 40);

    let mut stmt = conn
        .prepare(
            r#"SELECT id,
                      "taskTitle",
                      COALESCE("taskInput", ''),
                      CASE WHEN length(trim(COALESCE("promptA", ''))) > 0 THEN "promptA" ELSE "weakPrompt" END,
                      CASE WHEN length(trim(COALESCE("promptB", ''))) > 0 THEN "promptB" ELSE "improvedPrompt" END,
                      CASE WHEN length(trim(COALESCE("outputA", ''))) > 0 THEN "outputA" ELSE "weakOutput" END,
                      CASE WHEN length(trim(COALESCE("outputB", ''))) > 0 THEN "outputB" ELSE "improvedOutput" END,
                      COALESCE(NULLIF(trim(winner), ''), 'B'),
                      COALESCE("judgmentRationale", explanation, ''),
                      "modelName",
                      "createdAt"
               FROM "PromptExperiment"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC, id DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id.as_str(), take], |row| {
            Ok(PromptLabExperimentHistoryItemView {
                experiment_id: row.get(0)?,
                task_title: row.get(1)?,
                task_input: row.get(2)?,
                prompt_a: row.get(3)?,
                prompt_b: row.get(4)?,
                output_a: row.get(5)?,
                output_b: row.get(6)?,
                winner: row.get(7)?,
                rationale: row.get(8)?,
                model_name: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn get_chat_training_context(student_email: String) -> Result<ChatTrainingContextView, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    ensure_student_companion(&tx, &user_id)?;
    ensure_model_profile(&tx, &user_id)?;
    tx.commit().map_err(|e| e.to_string())?;

    let (dataset_size, model_accuracy) = dataset_metrics_for_student(&conn, &user_id)?;
    let (companion_name, stage, personality_type, logic, creativity, empathy, focus): (
        String,
        i32,
        String,
        i32,
        i32,
        i32,
        i32,
    ) = conn
        .query_row(
            r#"SELECT name, stage, "personalityType", logic, creativity, empathy, focus
               FROM "StudentAICompanion" WHERE "studentId" = ?1"#,
            params![user_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let simulator_hint = if dataset_size == 0 {
        "Пока нет размеченных примеров: ответы ИИ будут общими и неточными.".to_string()
    } else if model_accuracy < 60.0 {
        "ИИ учится, но пока часто отвечает расплывчато. Улучшайте формулировки и фиксируйте правки."
            .to_string()
    } else {
        "Ответы стали лучше, но модель всё ещё может ошибаться — продолжайте тренировать."
            .to_string()
    };

    Ok(ChatTrainingContextView {
        companion_name,
        stage,
        personality_type,
        logic,
        creativity,
        empathy,
        focus,
        model_accuracy,
        dataset_size,
        simulator_hint,
    })
}

/// Сила черновика 0.0–1.0: чем выше, тем структурнее и полезнее запасной ответ.
fn chat_training_power(ctx: &ChatTrainingContextView) -> f64 {
    let stat_sum = (ctx.logic + ctx.creativity + ctx.empathy + ctx.focus) as f64;
    let stat_norm = (stat_sum / 160.0).clamp(0.0, 1.0);
    let stage_norm = (ctx.stage as f64 / 48.0).clamp(0.0, 1.0);
    let acc_norm = (ctx.model_accuracy / 100.0).clamp(0.0, 1.0);
    let data_norm = if ctx.dataset_size <= 0 {
        0.0
    } else {
        ((ctx.dataset_size as f64).ln_1p() / (45.0_f64).ln_1p()).clamp(0.0, 1.0)
    };
    // Точность и примеры сильнее влияют на качество; стадия и статы задают характер и опору.
    let p = 0.22 * stat_norm + 0.18 * stage_norm + 0.38 * acc_norm + 0.22 * data_norm;
    p.clamp(0.0, 1.0)
}

fn chat_training_quality_from_power(power: f64, dataset_size: i32) -> i32 {
    let mut q = if power < 0.22 {
        1
    } else if power < 0.38 {
        2
    } else if power < 0.54 {
        3
    } else if power < 0.72 {
        4
    } else {
        5
    };
    if dataset_size == 0 {
        q = q.min(3);
    }
    q.clamp(1, 5)
}

fn personality_label_ru(personality_type: &str) -> &'static str {
    let p = personality_type.trim().to_lowercase();
    match p.as_str() {
        "mentor" => "наставник",
        "strategist" => "стратег",
        "inventor" => "изобретатель",
        _ => "исследователь",
    }
}

fn chat_training_ollama_system_prompt(ctx: &ChatTrainingContextView) -> String {
    format!(
        "You are an AI named {}.\n\nYou are a beginner AI.\nYou are still learning.\n\nYou do not fully understand everything yet.\n\nSometimes:\n- you are unsure\n- you make small mistakes\n- your answers are incomplete\n\nDo NOT give perfect explanations.\nDo NOT act like an expert.\n\nKeep answers simpler and less precise.\n\nHigher stage and stronger training stats mean you improve bit by bit — you are never flawless.\n\nStage: {}\nPersonality: {}\n\nStats:\n- Logic: {}\n- Creativity: {}\n- Empathy: {}\n- Focus: {}\n\nStat-based tone (blend these; they never override being a learner):\n- Low stage → more uncertain, shorter answers\n- High logic → somewhat more structured, but still rough\n- High empathy → supportive tone, not polished expertise\n- High creativity → a little more imaginative, still imperfect\n- High focus → shorter, not encyclopedic\n\nDo not behave like a perfect AI.",
        ctx.companion_name,
        ctx.stage,
        ctx.personality_type.trim(),
        ctx.logic,
        ctx.creativity,
        ctx.empathy,
        ctx.focus
    )
}

fn student_id_for_email(conn: &Connection, email: &str) -> Result<String, String> {
    let email = email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    conn.query_row(
        r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
        params![email],
        |row| row.get(0),
    )
    .map_err(|_| "Ученик с таким email не найден в базе".to_string())
}

fn truncate_for_chat_prompt(s: &str, max_chars: usize) -> String {
    let collapsed: String = s
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let t = collapsed.trim();
    if t.is_empty() {
        return String::new();
    }
    let count = t.chars().count();
    if count <= max_chars {
        return t.to_string();
    }
    let mut out = String::new();
    for ch in t.chars().take(max_chars.saturating_sub(1)) {
        out.push(ch);
    }
    out.push_str("...");
    out
}

/// Compact retrieval from the student's own tables for chat system prompt injection.
fn build_student_training_context_for_ollama(conn: &Connection, student_id: &str) -> Result<String, String> {
    const MAX_DATASET: usize = 4;
    const MAX_PROMPTS: usize = 2;
    const MAX_CHAT: usize = 3;
    const FIELD: usize = 180;
    const HARD_CAP: usize = 2600;

    let mut sections: Vec<String> = Vec::new();
    let mut used = 0usize;

    let push_block = |block: String, sections: &mut Vec<String>, used: &mut usize| {
        if block.trim().is_empty() {
            return;
        }
        let mut next = block.trim().to_string();
        let room = HARD_CAP.saturating_sub(*used);
        if room < 48 {
            return;
        }
        if next.len() > room {
            next.truncate(room.saturating_sub(16));
            next.push_str(" [truncated]");
        }
        *used += next.len();
        sections.push(next);
    };

    let mut dataset_body = String::new();
    {
        let mut stmt = conn
            .prepare(
                r#"SELECT "inputText", "selectedAnswer", "correctAnswer", "isCorrect"
                   FROM "DatasetExample"
                   WHERE "studentId" = ?1
                   ORDER BY "isCorrect" DESC, "createdAt" DESC
                   LIMIT ?2"#,
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(params![student_id, MAX_DATASET as i64])
            .map_err(|e| e.to_string())?;
        let mut n = 0;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            n += 1;
            let input: String = row.get(0).map_err(|e| e.to_string())?;
            let selected: String = row.get(1).map_err(|e| e.to_string())?;
            let correct: String = row.get(2).map_err(|e| e.to_string())?;
            let ok: i64 = row.get(3).map_err(|e| e.to_string())?;
            let tag = if ok != 0 { "correct" } else { "incorrect" };
            dataset_body.push_str(&format!(
                "\n{n}. Запрос ученика: {}\n   Выбранный ответ: {}\n   Правильный ответ: {} ({tag})\n",
                truncate_for_chat_prompt(&input, FIELD),
                truncate_for_chat_prompt(&selected, 100),
                truncate_for_chat_prompt(&correct, 100),
            ));
        }
        if !dataset_body.is_empty() {
            let block = format!(
                "1. Примеры обучения из уроков:{}",
                dataset_body
            );
            push_block(block, &mut sections, &mut used);
        }
    }

    let mut prompt_body = String::new();
    {
        let mut stmt = conn
            .prepare(
                r#"SELECT "weakPrompt", "improvedPrompt"
                   FROM "PromptExperiment"
                   WHERE "studentId" = ?1
                   ORDER BY "createdAt" DESC
                   LIMIT ?2"#,
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(params![student_id, MAX_PROMPTS as i64])
            .map_err(|e| e.to_string())?;
        let mut n = 0;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            n += 1;
            let weak: String = row.get(0).map_err(|e| e.to_string())?;
            let improved: String = row.get(1).map_err(|e| e.to_string())?;
            prompt_body.push_str(&format!(
                "\n{n}. Prompt improvement:\n   Weak prompt: {}\n   Improved prompt: {}\n",
                truncate_for_chat_prompt(&weak, FIELD),
                truncate_for_chat_prompt(&improved, FIELD),
            ));
        }
        if !prompt_body.is_empty() {
            let block = format!(
                "2. Prompt improvement (from your PromptExperiment runs):{}",
                prompt_body
            );
            push_block(block, &mut sections, &mut used);
        }
    }

    let mut chat_body = String::new();
    {
        let mut stmt = conn
            .prepare(
                r#"SELECT "studentMessage", "aiAnswer", "studentImprovement"
                   FROM "ChatTrainingInteraction"
                   WHERE "studentId" = ?1
                   ORDER BY CASE WHEN "studentImprovement" IS NOT NULL
                        AND length(trim("studentImprovement")) > 0 THEN 0 ELSE 1 END,
                        "createdAt" DESC
                   LIMIT ?2"#,
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(params![student_id, MAX_CHAT as i64])
            .map_err(|e| e.to_string())?;
        let mut n = 0;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            n += 1;
            let q: String = row.get(0).map_err(|e| e.to_string())?;
            let draft: String = row.get(1).map_err(|e| e.to_string())?;
            let imp: Option<String> = row.get(2).map_err(|e| e.to_string())?;
            let imp_t = imp
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| truncate_for_chat_prompt(s, FIELD))
                .unwrap_or_default();
            if imp_t.is_empty() {
                chat_body.push_str(&format!(
                    "\n{n}. Chat practice:\n   User asked: {}\n   AI draft: {}\n",
                    truncate_for_chat_prompt(&q, FIELD),
                    truncate_for_chat_prompt(&draft, FIELD),
                ));
            } else {
                chat_body.push_str(&format!(
                    "\n{n}. Chat correction:\n   User asked: {}\n   AI draft: {}\n   Better answer (student note): {}\n",
                    truncate_for_chat_prompt(&q, FIELD),
                    truncate_for_chat_prompt(&draft, FIELD),
                    imp_t,
                ));
            }
        }
        if !chat_body.is_empty() {
            let block = format!(
                "3. Chat training (from your ChatTrainingInteraction history):{}",
                chat_body
            );
            push_block(block, &mut sections, &mut used);
        }
    }

    if sections.is_empty() {
        return Ok(String::new());
    }

    Ok(format!(
        "Examples from your training (short snippets from this student's own data - let themes, vocabulary, and mistakes echo softly in your reply; never copy long passages; you are still a beginner AI):\n\n{}",
        sections.join("\n\n")
    ))
}

fn chat_training_simulator_explanation(
    ctx: &ChatTrainingContextView,
    power: f64,
    quality: i32,
) -> String {
    let pers = personality_label_ru(&ctx.personality_type);
    let tier = if power < 0.28 {
        "очень слабый"
    } else if power < 0.45 {
        "слабый"
    } else if power < 0.62 {
        "средний"
    } else if power < 0.78 {
        "уверенный"
    } else {
        "высокий"
    };
    format!(
        "Тип «{pers}» задаёт тон и вступление. Сила черновика ({tier}, автооценка {quality}/5) считается из стадии {st}, качества данных {acc:.1}%, числа примеров ({ds}) и параметров логика {lg}/креатив {cr}/эмпатия {em}/фокус {fc}. Если локальная модель недоступна, ответ строится как запасной учебный вариант.",
        pers = pers,
        tier = tier,
        quality = quality,
        st = ctx.stage,
        acc = ctx.model_accuracy,
        ds = ctx.dataset_size,
        lg = ctx.logic,
        cr = ctx.creativity,
        em = ctx.empathy,
        fc = ctx.focus,
    )
}

pub async fn generate_chat_training_answer(
    req: GenerateChatTrainingAnswerRequest,
) -> Result<GenerateChatTrainingAnswerResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let msg = req.student_message.trim();
    if msg.is_empty() {
        return Err("Введите сообщение для ИИ.".into());
    }

    let ctx = get_chat_training_context(email.to_string())?;
    let power = chat_training_power(&ctx);
    let quality = chat_training_quality_from_power(power, ctx.dataset_size);

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    let training_block = build_student_training_context_for_ollama(&conn, &student_id)?;
    let use_trained_model = student_prefers_trained_model(&conn, &student_id)?;
    let model_name = if use_trained_model {
        get_active_student_ollama_model_alias(&conn, &student_id)?
            .unwrap_or_else(|| OLLAMA_BASE_MODEL_DEFAULT.to_string())
    } else {
        OLLAMA_BASE_MODEL_DEFAULT.to_string()
    };
    let answer_used_training_context = !training_block.trim().is_empty();
    let system_prompt = if answer_used_training_context {
        format!(
            "{}\n\n{}",
            chat_training_ollama_system_prompt(&ctx),
            training_block
        )
    } else {
        chat_training_ollama_system_prompt(&ctx)
    };
    let user_input = msg.to_string();
    let ai_answer = match ollama::generate_with_ollama(&model_name, system_prompt, user_input).await {
        Ok(text) => {
            let t = text.trim();
            if t.is_empty() {
                "ИИ временно недоступен. Проверь Ollama.".to_string()
            } else {
                t.to_string()
            }
        }
        Err(_) => "ИИ временно недоступен. Проверь Ollama.".to_string(),
    };

    let quality_note = match quality {
        5 => "Черновик уже структурный, но модель всё равно может ошибаться — проверяй факты.",
        4 => "Хороший каркас; не хватает только вашей предметной детали.",
        3 => "Средне: есть план, но он общий.",
        2 => "Слабо: мало опоры на задачу и данные.",
        _ => "Очень слабо: мало опоры на задачу и пока недостаточно примеров обучения.",
    }
    .to_string();

    let simulator_explanation = chat_training_simulator_explanation(&ctx, power, quality);

    Ok(GenerateChatTrainingAnswerResponse {
        ai_answer,
        answer_quality: quality,
        quality_note,
        simulator_explanation,
        answer_used_training_context,
        model_name,
        using_trained_model: use_trained_model,
    })
}

pub async fn generate_lesson_companion_reflection(
    student_email: String,
    lesson_key: String,
    lesson_title: String,
    scene: String,
    state_summary: String,
    student_choice: Option<String>,
    plain_completion: bool,
) -> Result<GenerateLessonCompanionReflectionResponse, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }

    let ctx = get_chat_training_context(email.to_string())?;

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    let training_block = build_student_training_context_for_ollama(&conn, &student_id)?;
    let use_trained_model = student_prefers_trained_model(&conn, &student_id)?;
    let model_name = if use_trained_model {
        get_active_student_ollama_model_alias(&conn, &student_id)?
            .unwrap_or_else(|| OLLAMA_BASE_MODEL_DEFAULT.to_string())
    } else {
        OLLAMA_BASE_MODEL_DEFAULT.to_string()
    };

    let tail_guide = if plain_completion {
        LESSON_PLAIN_COMPLETION_GUIDE
    } else {
        LESSON_COMPANION_REFLECTION_GUIDE
    };

    let system_prompt = if !training_block.trim().is_empty() {
        format!(
            "{}\n\n{}\n\n{}",
            chat_training_ollama_system_prompt(&ctx),
            training_block,
            tail_guide
        )
    } else {
        format!(
            "{}\n\n{}",
            chat_training_ollama_system_prompt(&ctx),
            tail_guide
        )
    };

    let user_input = if plain_completion {
        truncate_for_chat_prompt(&state_summary, 2400)
    } else {
        let choice_line = student_choice
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("—");
        format!(
            "Урок (ключ): {}\nНазвание урока: {}\nСцена / шаг: {}\nКраткое состояние (только атмосфера, не эталон истины): {}\nНедавний выбор ученика: {}\n\nСкажи очень коротко своим голосом, что ты чувствуешь или думаешь в этой ситуации.",
            truncate_for_chat_prompt(lesson_key.trim(), 40),
            truncate_for_chat_prompt(&lesson_title, 120),
            truncate_for_chat_prompt(&scene, 220),
            truncate_for_chat_prompt(&state_summary, 1400),
            truncate_for_chat_prompt(choice_line, 200),
        )
    };

    let reflection_raw = match ollama::generate_with_ollama(&model_name, system_prompt, user_input).await {
        Ok(text) => text,
        Err(_) => String::new(),
    };
    let mut reflection = if plain_completion {
        truncate_for_chat_prompt(reflection_raw.trim(), 360)
    } else {
        clamp_lesson_companion_reflection(&reflection_raw)
    };
    if reflection.is_empty() {
        reflection = "ИИ временно недоступен".to_string();
    }

    Ok(GenerateLessonCompanionReflectionResponse { reflection })
}

pub fn save_chat_training_interaction(
    req: SaveChatTrainingInteractionRequest,
) -> Result<SaveChatTrainingInteractionResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let student_message = req.student_message.trim();
    let ai_answer = req.ai_answer.trim();
    if student_message.is_empty() || ai_answer.is_empty() {
        return Err("Сообщение и ответ ИИ не должны быть пустыми.".into());
    }
    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    ensure_chat_training_authoring_columns(&conn)?;

    let interaction_id = format!("{}", Uuid::new_v4());
    let quality = clamp_quality(req.answer_quality);
    let critique_clean = req
        .student_critique
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());
    let failure_category_clean = req
        .failure_category
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());
    let minimal_edit_clean = req
        .minimal_edit
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());
    let revised_target_clean = req
        .revised_target_answer
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());
    let final_target = revised_target_clean
        .clone()
        .unwrap_or_else(|| ai_answer.to_string());
    let model_name_clean = req
        .model_name
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());
    let reference_answer_clean = req
        .reference_answer
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());
    let reference_model_name_clean = req
        .reference_model_name
        .as_deref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "ChatTrainingInteraction"
           (id, "studentId", "studentMessage", "aiAnswer", "answerQuality", "studentImprovement", "studentCritique", "failureCategory", "minimalEdit", "revisedTargetAnswer", "modelName", "referenceAnswer", "referenceModelName", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'))"#,
        params![
            interaction_id,
            user_id,
            student_message,
            ai_answer,
            quality,
            Some(final_target.clone()),
            critique_clean,
            failure_category_clean,
            minimal_edit_clean,
            final_target,
            model_name_clean,
            reference_answer_clean,
            reference_model_name_clean,
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::ChatTrainingSaved,
        "Chat Training: пример сохранён",
        "Черновик и правка ученика добавлены в тренировочные данные.",
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "ChatTrainingInteraction" WHERE id = ?1"#,
            params![interaction_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(SaveChatTrainingInteractionResponse {
        interaction_id,
        created_at,
    })
}

pub fn list_chat_training_interactions(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<ChatTrainingHistoryItemView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    ensure_chat_training_authoring_columns(&conn)?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let mut stmt = conn
        .prepare(
            r#"SELECT id, "studentMessage", "aiAnswer", "studentCritique", "failureCategory", "minimalEdit", "revisedTargetAnswer", "studentImprovement", "answerQuality", "modelName", "referenceAnswer", "referenceModelName", "createdAt"
               FROM "ChatTrainingInteraction"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id, limit.unwrap_or(12)], |row| {
            let revised_target: String = row.get(6)?;
            let legacy_improvement: Option<String> = row.get(7)?;
            let final_target = if revised_target.trim().is_empty() {
                legacy_improvement.unwrap_or_default()
            } else {
                revised_target
            };
            Ok(ChatTrainingHistoryItemView {
                interaction_id: row.get(0)?,
                input_prompt: row.get(1)?,
                draft_model_answer: row.get(2)?,
                student_critique: row.get::<_, String>(3)?,
                failure_category: row.get::<_, String>(4)?,
                minimal_edit: row.get::<_, String>(5)?,
                revised_target_answer: final_target,
                answer_quality: row.get(8)?,
                model_name: row.get(9)?,
                reference_answer: row.get::<_, String>(10)?,
                reference_model_name: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn get_ai_exam_blueprint() -> Value {
    exam_benchmark::blueprint()
}

pub fn submit_ai_exam(
    student_email: String,
    answers_json: String,
) -> Result<AiExamSubmitResponse, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let graded = exam_benchmark::grade_answers(&answers_json)?;

    let mut conn = open_read_write()?;
    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let exam_run_id = format!("{}", Uuid::new_v4());
    let skill_scores_json =
        serde_json::to_string(&graded.skill_scores).map_err(|e| e.to_string())?;
    let strengths_json = serde_json::to_string(&graded.strengths).map_err(|e| e.to_string())?;
    let weaknesses_json = serde_json::to_string(&graded.weaknesses).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "StudentAiExamRun"
           (id, "studentId", "totalScore", "skillScoresJson", "strengthsJson", "weaknessesJson", "recommendation", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))"#,
        params![
            exam_run_id,
            user_id,
            graded.total_score,
            skill_scores_json,
            strengths_json,
            weaknesses_json,
            graded.recommendation.clone(),
        ],
    )
    .map_err(|e| {
        if e.to_string().contains("no such table") {
            "Таблица экзамена не найдена. Выполните миграции Prisma (StudentAiExamRun).".to_string()
        } else {
            e.to_string()
        }
    })?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "StudentAiExamRun" WHERE id = ?1"#,
            params![exam_run_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(AiExamSubmitResponse {
        exam_run_id,
        total_score: graded.total_score,
        skill_scores: graded.skill_scores,
        strengths: graded.strengths,
        weaknesses: graded.weaknesses,
        recommendation: graded.recommendation,
        created_at,
    })
}

fn parse_data_cleaning_examples(raw: &str) -> Result<Vec<(String, String)>, String> {
    let v: Value = serde_json::from_str(raw.trim())
        .map_err(|_| "Некорректный формат примеров в задании".to_string())?;
    let arr = v
        .as_array()
        .ok_or_else(|| "Примеры задания должны быть JSON-массивом".to_string())?;
    let mut out = Vec::new();
    let mut ids = HashSet::new();
    for item in arr {
        let obj = item.as_object().ok_or_else(|| {
            "Каждый пример должен быть объектом с полями id и text".to_string()
        })?;
        let id = obj
            .get("id")
            .and_then(|x| x.as_str())
            .ok_or_else(|| "У примера должен быть id (строка)".to_string())?
            .trim()
            .to_string();
        let text = obj
            .get("text")
            .and_then(|x| x.as_str())
            .ok_or_else(|| "У примера должен быть text (строка)".to_string())?
            .trim()
            .to_string();
        if id.is_empty() || text.is_empty() {
            return Err("Пустой id или text в примере".into());
        }
        if !ids.insert(id.clone()) {
            return Err("Повторяющийся id в примерах задания".into());
        }
        out.push((id, text));
    }
    if out.is_empty() {
        return Err("Нет ни одного примера в задании".into());
    }
    Ok(out)
}

fn parse_cleaning_labels(raw: &str) -> Result<(Vec<String>, Vec<String>), String> {
    let v: Value = serde_json::from_str(raw.trim()).map_err(|_| {
        "Некорректная разметка (ожидается JSON с полями clean и noisy — массивы id)".to_string()
    })?;
    let obj = v
        .as_object()
        .ok_or_else(|| "Разметка должна быть JSON-объектом".to_string())?;
    let clean_arr = obj
        .get("clean")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "Поле clean должно быть массивом строк id".to_string())?;
    let noisy_arr = obj
        .get("noisy")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "Поле noisy должно быть массивом строк id".to_string())?;
    let clean: Vec<String> = clean_arr
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    let noisy: Vec<String> = noisy_arr
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    Ok((clean, noisy))
}

fn validate_cleaning_partition(
    clean: &[String],
    noisy: &[String],
    all_ids: &HashSet<String>,
) -> Result<(), String> {
    let mut seen = HashSet::new();
    for id in clean {
        if !all_ids.contains(id) {
            return Err(format!("Неизвестный id в чистых: {id}"));
        }
        if !seen.insert(id.clone()) {
            return Err("Дубликат или пересечение в разметке".into());
        }
    }
    for id in noisy {
        if !all_ids.contains(id) {
            return Err(format!("Неизвестный id в шумных: {id}"));
        }
        if !seen.insert(id.clone()) {
            return Err("Дубликат или пересечение в разметке".into());
        }
    }
    if seen.len() != all_ids.len() {
        return Err("Нужно отнести каждый пример ровно к одной категории (в набор или шум)".into());
    }
    Ok(())
}

fn cleaning_partitions_equal(
    a_clean: &[String],
    a_noisy: &[String],
    b_clean: &[String],
    b_noisy: &[String],
) -> bool {
    let mut ac = a_clean.to_vec();
    let mut an = a_noisy.to_vec();
    let mut bc = b_clean.to_vec();
    let mut bn = b_noisy.to_vec();
    ac.sort();
    an.sort();
    bc.sort();
    bn.sort();
    ac == bc && an == bn
}

fn shorten_label(s: &str) -> String {
    let t = s.trim();
    let mut it = t.chars();
    let take: String = it.by_ref().take(48).collect();
    if it.next().is_some() {
        format!("{take}…")
    } else {
        take
    }
}

fn format_data_cleaning_answer_display(
    id_to_text: &HashMap<String, String>,
    clean: &[String],
    noisy: &[String],
) -> String {
    let mut clean_ids: Vec<_> = clean.to_vec();
    clean_ids.sort();
    let mut noisy_ids: Vec<_> = noisy.to_vec();
    noisy_ids.sort();

    let clean_bits: Vec<String> = clean_ids
        .iter()
        .map(|id| {
            id_to_text
                .get(id)
                .map(|t| shorten_label(t))
                .unwrap_or_else(|| id.clone())
        })
        .collect();
    let noisy_bits: Vec<String> = noisy_ids
        .iter()
        .map(|id| {
            id_to_text
                .get(id)
                .map(|t| shorten_label(t))
                .unwrap_or_else(|| id.clone())
        })
        .collect();

    format!(
        "В набор: {}. Отфильтровать (шум): {}.",
        if clean_bits.is_empty() {
            "—".to_string()
        } else {
            clean_bits.join(" · ")
        },
        if noisy_bits.is_empty() {
            "—".to_string()
        } else {
            noisy_bits.join(" · ")
        }
    )
}

fn canonical_cleaning_json(clean: &[String], noisy: &[String]) -> Result<String, String> {
    let mut c = clean.to_vec();
    let mut n = noisy.to_vec();
    c.sort();
    n.sort();
    serde_json::to_string(&serde_json::json!({ "clean": c, "noisy": n })).map_err(|e| e.to_string())
}

fn build_response_after_submit(
    conn: &Connection,
    user_id: &str,
    lesson_id: &str,
    first_completion: bool,
    is_correct: bool,
    correct_answer: String,
) -> Result<SubmitClassificationResponse, String> {
    let new_xp: i32 = conn
        .query_row(
            r#"SELECT xp FROM "StudentProfile" WHERE "userId" = ?1"#,
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_tasks: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "Task" WHERE "lessonId" = ?1"#,
            params![lesson_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let done_tasks: i32 = if total_tasks > 0 {
        conn.query_row(
            r#"SELECT COUNT(DISTINCT T."taskId") FROM "TaskAttempt" T
               INNER JOIN "Task" TK ON TK.id = T."taskId"
               WHERE T."userId" = ?1 AND TK."lessonId" = ?2 AND T."completedAt" IS NOT NULL"#,
            params![user_id, lesson_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    } else {
        0
    };

    let lesson_progress_percent = if total_tasks > 0 {
        ((done_tasks as f64 / total_tasks as f64) * 100.0).round() as i32
    } else {
        0
    };

    let xp_earned_this_attempt = if first_completion {
        if is_correct {
            XP_FIRST_CORRECT
        } else {
            XP_FIRST_WRONG
        }
    } else {
        0
    };

    Ok(SubmitClassificationResponse {
        is_correct,
        correct_answer,
        lesson_progress_percent,
        new_xp,
        xp_earned_this_attempt,
        first_completion,
    })
}

pub fn classification_task_completed(req: TaskStatusRequest) -> Result<TaskStatusResponse, String> {
    let conn = open_read_write()?;
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }

    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let completed: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "TaskAttempt"
               WHERE "userId" = ?1 AND "taskId" = ?2 AND "completedAt" IS NOT NULL"#,
            params![user_id, req.task_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(TaskStatusResponse {
        completed: completed > 0,
    })
}

pub fn submit_classification_attempt(
    req: SubmitClassificationRequest,
) -> Result<SubmitClassificationResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let selected = req.selected_answer.trim();
    if selected.is_empty() {
        return Err("Выберите вариант ответа".into());
    }

    let mut conn = open_read_write()?;

    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let (task_lesson_id, task_type, prompt_text, options_json, correct_answer): (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            r#"SELECT "lessonId", "taskType", "promptText", "optionsJson", "correctAnswer" FROM "Task" WHERE id = ?1"#,
            params![req.task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| "Задание не найдено".to_string())?;

    if task_lesson_id != req.lesson_id {
        return Err("Задание не относится к этому уроку".into());
    }

    if task_type != "classification" {
        return Err("Это задание не классификация".into());
    }

    let prompt = prompt_text.ok_or_else(|| "Задание не настроено (нет текста)".to_string())?;
    let options_str = options_json.ok_or_else(|| "Задание не настроено (нет вариантов)".to_string())?;
    let correct = correct_answer.ok_or_else(|| "Задание не настроено (нет эталона)".to_string())?;

    let options: Vec<String> =
        serde_json::from_str(&options_str).map_err(|_| "Некорректные варианты задания".to_string())?;
    let options: Vec<String> = options.into_iter().map(|s| s.trim().to_string()).collect();
    if !options.iter().any(|o| o == selected) {
        return Err("Выбранный ответ не входит в список вариантов".into());
    }

    let is_correct = selected == correct.trim();
    let score = if is_correct { 100 } else { 0 };

    let example_id = format!("{}", Uuid::new_v4());
    let attempt_id = format!("{}", Uuid::new_v4());

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        r#"INSERT INTO "DatasetExample"
           (id, "studentId", "lessonId", "taskId", "taskType", "inputText", "selectedAnswer", "correctAnswer", "isCorrect", "createdAt")
           VALUES (?1, ?2, ?3, ?4, 'classification', ?5, ?6, ?7, ?8, datetime('now'))"#,
        params![
            example_id,
            user_id,
            req.lesson_id,
            req.task_id,
            prompt,
            selected,
            correct,
            if is_correct { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::DatasetExampleAdded,
        "Урок: пример добавлен в данные обучения",
        &format!("Классификация: сохранён ответ по заданию {}.", req.task_id),
    )?;

    let existing: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "TaskAttempt"
               WHERE "userId" = ?1 AND "taskId" = ?2 AND "completedAt" IS NOT NULL"#,
            params![user_id, req.task_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let first_completion = existing == 0;
    if first_completion {
        tx.execute(
            r#"INSERT INTO "TaskAttempt" (id, "userId", "taskId", score, "completedAt", "createdAt")
               VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))"#,
            params![attempt_id, user_id, req.task_id, score],
        )
        .map_err(|e| e.to_string())?;

        let delta_xp = if is_correct {
            XP_FIRST_CORRECT
        } else {
            XP_FIRST_WRONG
        };
        tx.execute(
            r#"UPDATE "StudentProfile" SET xp = xp + ?1 WHERE "userId" = ?2"#,
            params![delta_xp, user_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            r#"UPDATE "User" SET "updatedAt" = datetime('now') WHERE id = ?1"#,
            params![user_id],
        )
        .map_err(|e| e.to_string())?;

        apply_companion_on_first_task_completion(&tx, &user_id, "classification")?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    build_response_after_submit(
        &conn,
        &user_id,
        &req.lesson_id,
        first_completion,
        is_correct,
        correct,
    )
}

pub fn submit_policy_path_attempt(
    req: SubmitClassificationRequest,
) -> Result<SubmitClassificationResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let selected = req.selected_answer.trim();
    if selected.is_empty() {
        return Err("Выберите вариант ответа".into());
    }

    let mut conn = open_read_write()?;

    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let (task_lesson_id, task_type, prompt_text, options_json, correct_answer): (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            r#"SELECT "lessonId", "taskType", "promptText", "optionsJson", "correctAnswer" FROM "Task" WHERE id = ?1"#,
            params![req.task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| "Задание не найдено".to_string())?;

    if task_lesson_id != req.lesson_id {
        return Err("Задание не относится к этому уроку".into());
    }

    if task_type != "policy_path" {
        return Err("Это задание не выбор политики ответа".into());
    }

    let prompt = prompt_text.ok_or_else(|| "Задание не настроено (нет текста сценария)".to_string())?;
    let options_str = options_json.ok_or_else(|| "Задание не настроено (нет вариантов)".to_string())?;
    let correct = correct_answer.ok_or_else(|| "Задание не настроено (нет эталона)".to_string())?;

    let options: Vec<String> =
        serde_json::from_str(&options_str).map_err(|_| "Некорректные варианты задания".to_string())?;
    let options: Vec<String> = options.into_iter().map(|s| s.trim().to_string()).collect();
    if !options.iter().any(|o| o == selected) {
        return Err("Выбранный ответ не входит в список вариантов".into());
    }

    let is_correct = selected == correct.trim();
    let score = if is_correct { 100 } else { 0 };

    let example_id = format!("{}", Uuid::new_v4());
    let attempt_id = format!("{}", Uuid::new_v4());

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        r#"INSERT INTO "DatasetExample"
           (id, "studentId", "lessonId", "taskId", "taskType", "inputText", "selectedAnswer", "correctAnswer", "isCorrect", "createdAt")
           VALUES (?1, ?2, ?3, ?4, 'policy_path', ?5, ?6, ?7, ?8, datetime('now'))"#,
        params![
            example_id,
            user_id,
            req.lesson_id,
            req.task_id,
            prompt,
            selected,
            correct,
            if is_correct { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::DatasetExampleAdded,
        "Урок: пример добавлен в данные обучения",
        &format!("Политика ответа: сохранён ответ по заданию {}.", req.task_id),
    )?;

    let existing: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "TaskAttempt"
               WHERE "userId" = ?1 AND "taskId" = ?2 AND "completedAt" IS NOT NULL"#,
            params![user_id, req.task_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let first_completion = existing == 0;
    if first_completion {
        tx.execute(
            r#"INSERT INTO "TaskAttempt" (id, "userId", "taskId", score, "completedAt", "createdAt")
               VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))"#,
            params![attempt_id, user_id, req.task_id, score],
        )
        .map_err(|e| e.to_string())?;

        let delta_xp = if is_correct {
            XP_FIRST_CORRECT
        } else {
            XP_FIRST_WRONG
        };
        tx.execute(
            r#"UPDATE "StudentProfile" SET xp = xp + ?1 WHERE "userId" = ?2"#,
            params![delta_xp, user_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            r#"UPDATE "User" SET "updatedAt" = datetime('now') WHERE id = ?1"#,
            params![user_id],
        )
        .map_err(|e| e.to_string())?;

        apply_companion_on_first_task_completion(&tx, &user_id, "policy_path")?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    build_response_after_submit(
        &conn,
        &user_id,
        &req.lesson_id,
        first_completion,
        is_correct,
        correct,
    )
}

pub fn submit_ranking_attempt(req: SubmitRankingRequest) -> Result<SubmitClassificationResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let order_raw = req.ranked_order_json.trim();
    if order_raw.is_empty() {
        return Err("Укажите порядок элементов".into());
    }

    let submitted: Vec<String> = serde_json::from_str(order_raw)
        .map_err(|_| "Некорректный формат порядка (ожидается JSON-массив строк)".to_string())?;
    let submitted: Vec<String> = submitted.into_iter().map(|s| s.trim().to_string()).collect();

    let mut conn = open_read_write()?;

    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let (task_lesson_id, task_type, prompt_text, options_json, correct_answer): (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            r#"SELECT "lessonId", "taskType", "promptText", "optionsJson", "correctAnswer" FROM "Task" WHERE id = ?1"#,
            params![req.task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| "Задание не найдено".to_string())?;

    if task_lesson_id != req.lesson_id {
        return Err("Задание не относится к этому уроку".into());
    }

    if task_type != "ranking" {
        return Err("Это задание не ранжирование".into());
    }

    let prompt = prompt_text.ok_or_else(|| "Задание не настроено (нет текста)".to_string())?;
    let options_str = options_json.ok_or_else(|| "Задание не настроено (нет вариантов)".to_string())?;
    let correct_raw = correct_answer.ok_or_else(|| "Задание не настроено (нет эталона)".to_string())?;

    let options: Vec<String> =
        serde_json::from_str(&options_str).map_err(|_| "Некорректные варианты задания".to_string())?;
    let options: Vec<String> = options.into_iter().map(|s| s.trim().to_string()).collect();

    let correct_order: Vec<String> = serde_json::from_str(correct_raw.trim()).map_err(|_| {
        "Некорректный эталон порядка (ожидается JSON-массив строк в correctAnswer)".to_string()
    })?;
    let correct_order: Vec<String> = correct_order.into_iter().map(|s| s.trim().to_string()).collect();

    if options.is_empty() || correct_order.len() != options.len() || submitted.len() != options.len() {
        return Err("Порядок должен содержать все варианты ровно один раз".into());
    }

    let mut sub_sorted = submitted.clone();
    let mut opt_sorted = options.clone();
    sub_sorted.sort();
    opt_sorted.sort();
    if sub_sorted != opt_sorted {
        return Err("Порядок должен содержать ровно те же элементы, что и в списке вариантов".into());
    }

    let mut cor_sorted = correct_order.clone();
    cor_sorted.sort();
    if cor_sorted != opt_sorted {
        return Err("Эталон порядка в задании не совпадает с набором вариантов".into());
    }

    let is_correct = submitted == correct_order;
    let score = if is_correct { 100 } else { 0 };

    let selected_json =
        serde_json::to_string(&submitted).map_err(|e| format!("Сериализация ответа: {e}"))?;
    let correct_json =
        serde_json::to_string(&correct_order).map_err(|e| format!("Сериализация эталона: {e}"))?;
    let correct_display = correct_order.join(" → ");

    let example_id = format!("{}", Uuid::new_v4());
    let attempt_id = format!("{}", Uuid::new_v4());

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        r#"INSERT INTO "DatasetExample"
           (id, "studentId", "lessonId", "taskId", "taskType", "inputText", "selectedAnswer", "correctAnswer", "isCorrect", "createdAt")
           VALUES (?1, ?2, ?3, ?4, 'ranking', ?5, ?6, ?7, ?8, datetime('now'))"#,
        params![
            example_id,
            user_id,
            req.lesson_id,
            req.task_id,
            prompt,
            selected_json,
            correct_json,
            if is_correct { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::DatasetExampleAdded,
        "Урок: пример добавлен в данные обучения",
        &format!("Ранжирование: сохранён ответ по заданию {}.", req.task_id),
    )?;

    let existing: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "TaskAttempt"
               WHERE "userId" = ?1 AND "taskId" = ?2 AND "completedAt" IS NOT NULL"#,
            params![user_id, req.task_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let first_completion = existing == 0;
    if first_completion {
        tx.execute(
            r#"INSERT INTO "TaskAttempt" (id, "userId", "taskId", score, "completedAt", "createdAt")
               VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))"#,
            params![attempt_id, user_id, req.task_id, score],
        )
        .map_err(|e| e.to_string())?;

        let delta_xp = if is_correct {
            XP_FIRST_CORRECT
        } else {
            XP_FIRST_WRONG
        };
        tx.execute(
            r#"UPDATE "StudentProfile" SET xp = xp + ?1 WHERE "userId" = ?2"#,
            params![delta_xp, user_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            r#"UPDATE "User" SET "updatedAt" = datetime('now') WHERE id = ?1"#,
            params![user_id],
        )
        .map_err(|e| e.to_string())?;

        apply_companion_on_first_task_completion(&tx, &user_id, "ranking")?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    build_response_after_submit(
        &conn,
        &user_id,
        &req.lesson_id,
        first_completion,
        is_correct,
        correct_display,
    )
}

pub fn submit_data_cleaning_attempt(
    req: SubmitDataCleaningRequest,
) -> Result<SubmitClassificationResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let sel_raw = req.selection_json.trim();
    if sel_raw.is_empty() {
        return Err("Отправьте разметку примеров (JSON)".into());
    }

    let mut conn = open_read_write()?;

    let user_id: String = conn
        .query_row(
            r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
            params![email],
            |row| row.get(0),
        )
        .map_err(|_| "Ученик с таким email не найден в базе".to_string())?;

    let (task_lesson_id, task_type, prompt_text, options_json, correct_answer): (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            r#"SELECT "lessonId", "taskType", "promptText", "optionsJson", "correctAnswer" FROM "Task" WHERE id = ?1"#,
            params![req.task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| "Задание не найдено".to_string())?;

    if task_lesson_id != req.lesson_id {
        return Err("Задание не относится к этому уроку".into());
    }

    if task_type != "data_cleaning" {
        return Err("Это задание не очистка данных".into());
    }

    let prompt = prompt_text.ok_or_else(|| "Задание не настроено (нет инструкции)".to_string())?;
    let options_str = options_json.ok_or_else(|| "Задание не настроено (нет примеров)".to_string())?;
    let correct_raw = correct_answer.ok_or_else(|| "Задание не настроено (нет эталона)".to_string())?;

    let examples = parse_data_cleaning_examples(&options_str)?;
    let all_ids: HashSet<String> = examples.iter().map(|(id, _)| id.clone()).collect();
    let id_to_text: HashMap<String, String> = examples.iter().cloned().collect();

    let (exp_clean, exp_noisy) = parse_cleaning_labels(&correct_raw)?;
    validate_cleaning_partition(&exp_clean, &exp_noisy, &all_ids)?;

    let (sub_clean, sub_noisy) = parse_cleaning_labels(sel_raw)?;
    validate_cleaning_partition(&sub_clean, &sub_noisy, &all_ids)?;

    let is_correct = cleaning_partitions_equal(&sub_clean, &sub_noisy, &exp_clean, &exp_noisy);
    let score = if is_correct { 100 } else { 0 };

    let selected_json = canonical_cleaning_json(&sub_clean, &sub_noisy)?;
    let correct_json = canonical_cleaning_json(&exp_clean, &exp_noisy)?;
    let correct_display = format_data_cleaning_answer_display(&id_to_text, &exp_clean, &exp_noisy);

    let example_id = format!("{}", Uuid::new_v4());
    let attempt_id = format!("{}", Uuid::new_v4());

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        r#"INSERT INTO "DatasetExample"
           (id, "studentId", "lessonId", "taskId", "taskType", "inputText", "selectedAnswer", "correctAnswer", "isCorrect", "createdAt")
           VALUES (?1, ?2, ?3, ?4, 'data_cleaning', ?5, ?6, ?7, ?8, datetime('now'))"#,
        params![
            example_id,
            user_id,
            req.lesson_id,
            req.task_id,
            prompt,
            selected_json,
            correct_json,
            if is_correct { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &user_id,
        email,
        StudentArtifactKind::DatasetExampleAdded,
        "Урок: пример добавлен в данные обучения",
        &format!("Очистка данных: сохранён ответ по заданию {}.", req.task_id),
    )?;

    let existing: i32 = tx
        .query_row(
            r#"SELECT COUNT(*) FROM "TaskAttempt"
               WHERE "userId" = ?1 AND "taskId" = ?2 AND "completedAt" IS NOT NULL"#,
            params![user_id, req.task_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let first_completion = existing == 0;
    if first_completion {
        tx.execute(
            r#"INSERT INTO "TaskAttempt" (id, "userId", "taskId", score, "completedAt", "createdAt")
               VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))"#,
            params![attempt_id, user_id, req.task_id, score],
        )
        .map_err(|e| e.to_string())?;

        let delta_xp = if is_correct {
            XP_FIRST_CORRECT
        } else {
            XP_FIRST_WRONG
        };
        tx.execute(
            r#"UPDATE "StudentProfile" SET xp = xp + ?1 WHERE "userId" = ?2"#,
            params![delta_xp, user_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            r#"UPDATE "User" SET "updatedAt" = datetime('now') WHERE id = ?1"#,
            params![user_id],
        )
        .map_err(|e| e.to_string())?;

        apply_companion_on_first_task_completion(&tx, &user_id, "data_cleaning")?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    build_response_after_submit(
        &conn,
        &user_id,
        &req.lesson_id,
        first_completion,
        is_correct,
        correct_display,
    )
}

fn timestamp_unix_secs() -> Result<u64, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_secs())
        .map_err(|e| e.to_string())
}

fn sanitize_filename_token(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        let safe = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.';
        out.push(if safe { ch } else { '_' });
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "student".to_string()
    } else {
        trimmed.to_string()
    }
}

fn resolve_student_selector(
    conn: &Connection,
    student_email: Option<String>,
    student_id: Option<String>,
) -> Result<(String, String), String> {
    if let Some(raw_id) = student_id {
        let id = raw_id.trim();
        if !id.is_empty() {
            let email: String = conn
                .query_row(
                    r#"SELECT email FROM "User" WHERE id = ?1 AND role = 'student'"#,
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|_| "Ученик с таким id не найден".to_string())?;
            return Ok((id.to_string(), email));
        }
    }

    if let Some(raw_email) = student_email {
        let email = raw_email.trim();
        if !email.is_empty() {
            let id: String = conn
                .query_row(
                    r#"SELECT id FROM "User" WHERE email = ?1 AND role = 'student'"#,
                    params![email],
                    |row| row.get(0),
                )
                .map_err(|_| "Ученик с таким email не найден".to_string())?;
            return Ok((id, email.to_string()));
        }
    }

    Err("Укажите student_email или student_id".to_string())
}

fn export_base_dir() -> PathBuf {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local).join("ai-lab-app").join("training-exports");
    }
    std::env::temp_dir().join("ai-lab-app").join("training-exports")
}

fn ollama_model_base_dir() -> PathBuf {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local)
            .join("ai-lab-app")
            .join("ollama-student-models");
    }
    std::env::temp_dir()
        .join("ai-lab-app")
        .join("ollama-student-models")
}

fn ensure_student_ollama_model_ref_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentOllamaModelRef" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL UNIQUE,
            "studentEmail" TEXT NOT NULL,
            "baseModel" TEXT NOT NULL,
            "adapterPath" TEXT NOT NULL,
            "ollamaModelAlias" TEXT NOT NULL,
            "modelfilePath" TEXT NOT NULL,
            "trainingSummaryPath" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentOllamaModelRef_studentId_idx"
            ON "StudentOllamaModelRef"("studentId");
        CREATE INDEX IF NOT EXISTS "StudentOllamaModelRef_alias_idx"
            ON "StudentOllamaModelRef"("ollamaModelAlias");
        "#,
    )
    .map_err(|e| e.to_string())?;

    let duplicate_alias_count: i64 = conn
        .query_row(
            r#"
            SELECT COUNT(*)
            FROM (
                SELECT "ollamaModelAlias"
                FROM "StudentOllamaModelRef"
                GROUP BY "ollamaModelAlias"
                HAVING COUNT(*) > 1
            )
            "#,
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if duplicate_alias_count == 0 {
        conn.execute_batch(
            r#"
            CREATE UNIQUE INDEX IF NOT EXISTS "StudentOllamaModelRef_alias_unique_idx"
                ON "StudentOllamaModelRef"("ollamaModelAlias");
            "#,
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn ensure_student_training_export_ref_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentTrainingExportRef" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL UNIQUE,
            "studentEmail" TEXT NOT NULL,
            "datasetJsonlPath" TEXT NOT NULL,
            "metadataJsonPath" TEXT NOT NULL,
            "datasetExampleRows" INTEGER NOT NULL,
            "promptExperimentRows" INTEGER NOT NULL,
            "chatTrainingRows" INTEGER NOT NULL,
            "totalRows" INTEGER NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentTrainingExportRef_studentId_idx"
            ON "StudentTrainingExportRef"("studentId");
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_student_dataset_snapshot_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentDatasetSnapshot" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL,
            "studentEmail" TEXT NOT NULL,
            "datasetJsonlPath" TEXT NOT NULL,
            "metadataJsonPath" TEXT NOT NULL,
            "datasetExampleRows" INTEGER NOT NULL,
            "promptExperimentRows" INTEGER NOT NULL,
            "chatTrainingRows" INTEGER NOT NULL,
            "totalRows" INTEGER NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentDatasetSnapshot_studentId_createdAt_idx"
            ON "StudentDatasetSnapshot"("studentId", "createdAt" DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS "StudentDatasetSnapshot_datasetPath_idx"
            ON "StudentDatasetSnapshot"("datasetJsonlPath");
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_student_model_version_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentModelVersion" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL,
            "studentEmail" TEXT NOT NULL,
            "datasetSnapshotId" TEXT,
            "baseModel" TEXT NOT NULL,
            "adapterPath" TEXT NOT NULL,
            "ollamaModelAlias" TEXT NOT NULL,
            "modelfilePath" TEXT NOT NULL,
            "trainingSummaryPath" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY ("datasetSnapshotId") REFERENCES "StudentDatasetSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentModelVersion_studentId_createdAt_idx"
            ON "StudentModelVersion"("studentId", "createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())?;

    // Older builds incorrectly enforced globally-unique `ollamaModelAlias` on this *history* table,
    // which could block the same student from recording multiple versions or collide across students'
    // past aliases. Active-alias uniqueness for Arena PvP stays on `StudentOllamaModelRef` only.
    conn.execute(
        r#"DROP INDEX IF EXISTS "StudentModelVersion_alias_idx""#,
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS "StudentModelVersion_studentId_alias_createdAt_idx"
            ON "StudentModelVersion"("studentId", "ollamaModelAlias", "createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn latest_dataset_snapshot_id(conn: &Connection, student_id: &str) -> Result<Option<String>, String> {
    ensure_student_dataset_snapshot_table(conn)?;
    match conn.query_row(
        r#"SELECT "id"
           FROM "StudentDatasetSnapshot"
           WHERE "studentId" = ?1
           ORDER BY "createdAt" DESC
           LIMIT 1"#,
        params![student_id],
        |row| row.get::<_, String>(0),
    ) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn latest_model_version_id(conn: &Connection, student_id: &str) -> Result<Option<String>, String> {
    ensure_student_model_version_table(conn)?;
    match conn.query_row(
        r#"SELECT "id"
           FROM "StudentModelVersion"
           WHERE "studentId" = ?1
           ORDER BY "createdAt" DESC
           LIMIT 1"#,
        params![student_id],
        |row| row.get::<_, String>(0),
    ) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn student_evaluation_run_column_exists(conn: &Connection, column_name: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(r#"PRAGMA table_info("StudentEvaluationRun")"#)
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let current: String = row.get(1).map_err(|e| e.to_string())?;
        if current == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_student_evaluation_run_metadata_column(conn: &Connection) -> Result<(), String> {
    if !student_evaluation_run_column_exists(conn, "metadataJson")? {
        conn.execute(
            r#"ALTER TABLE "StudentEvaluationRun" ADD COLUMN "metadataJson" TEXT NOT NULL DEFAULT '{}'"#,
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_student_evaluation_run_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentEvaluationRun" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL,
            "studentEmail" TEXT NOT NULL,
            "modelVersionId" TEXT,
            "sourceKind" TEXT NOT NULL,
            "sourceRunId" TEXT NOT NULL,
            "title" TEXT NOT NULL,
            "outcome" TEXT NOT NULL,
            "metadataJson" TEXT NOT NULL DEFAULT '{}',
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY ("modelVersionId") REFERENCES "StudentModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentEvaluationRun_studentId_createdAt_idx"
            ON "StudentEvaluationRun"("studentId", "createdAt" DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS "StudentEvaluationRun_source_idx"
            ON "StudentEvaluationRun"("sourceKind", "sourceRunId");
        "#,
    )
    .map_err(|e| e.to_string())?;
    ensure_student_evaluation_run_metadata_column(conn)?;
    Ok(())
}

/// Shared evaluation history row for Compare and Arena (benchmark / PvP).
/// `sourceKind` is one of: `compare`, `arena_benchmark`, `arena_pvp` (mirrors `metadata.evaluationType`).
/// Rich fields live in `metadata` JSON (prompt, models, outputs, indicators, mission ids, etc.).
fn append_student_evaluation_run(
    conn: &Connection,
    student_id: &str,
    student_email: &str,
    evaluation_type: &str,
    source_run_id: &str,
    title: &str,
    outcome: &str,
    metadata: &serde_json::Value,
) -> Result<(), String> {
    ensure_student_evaluation_run_table(conn)?;
    let model_version_id = latest_model_version_id(conn, student_id)?;
    let metadata_json = serde_json::to_string(metadata).map_err(|e| e.to_string())?;
    conn.execute(
        r#"INSERT OR IGNORE INTO "StudentEvaluationRun"
           ("id", "studentId", "studentEmail", "modelVersionId", "sourceKind", "sourceRunId", "title", "outcome", "metadataJson", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))"#,
        params![
            format!("{}", Uuid::new_v4()),
            student_id,
            student_email,
            model_version_id.as_deref(),
            evaluation_type,
            source_run_id,
            title,
            outcome,
            metadata_json,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_student_model_usage_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentModelUsagePreference" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL UNIQUE,
            "useTrainedModel" INTEGER NOT NULL DEFAULT 1,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentModelUsagePreference_studentId_idx"
            ON "StudentModelUsagePreference"("studentId");
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_student_artifact_ledger_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentArtifactLedger" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL,
            "studentEmail" TEXT NOT NULL,
            "artifactType" TEXT NOT NULL,
            "label" TEXT NOT NULL,
            "detail" TEXT NOT NULL DEFAULT '',
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentArtifactLedger_studentId_idx"
            ON "StudentArtifactLedger"("studentId");
        CREATE INDEX IF NOT EXISTS "StudentArtifactLedger_artifactType_idx"
            ON "StudentArtifactLedger"("artifactType");
        CREATE INDEX IF NOT EXISTS "StudentArtifactLedger_createdAt_idx"
            ON "StudentArtifactLedger"("createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_compare_run_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentCompareRun" (
            "id" TEXT PRIMARY KEY,
            "studentId" TEXT NOT NULL,
            "studentEmail" TEXT NOT NULL,
            "prompt" TEXT NOT NULL,
            "baseModel" TEXT NOT NULL,
            "trainedModelName" TEXT,
            "trainedAvailable" INTEGER NOT NULL DEFAULT 0,
            "baseOutput" TEXT NOT NULL,
            "trainedOutput" TEXT,
            "indicatorsJson" TEXT NOT NULL DEFAULT '[]',
            "explanation" TEXT NOT NULL DEFAULT '',
            "categoryTag" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentCompareRun_studentId_idx"
            ON "StudentCompareRun"("studentId");
        CREATE INDEX IF NOT EXISTS "StudentCompareRun_createdAt_idx"
            ON "StudentCompareRun"("createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_benchmark_run_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentBenchmarkRun" (
            "id" TEXT PRIMARY KEY,
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
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentBenchmarkRun_studentId_idx"
            ON "StudentBenchmarkRun"("studentId");
        CREATE INDEX IF NOT EXISTS "StudentBenchmarkRun_createdAt_idx"
            ON "StudentBenchmarkRun"("createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_pairwise_preference_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentPairwisePreference" (
            "id" TEXT PRIMARY KEY,
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
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentPairwisePreference_studentId_idx"
            ON "StudentPairwisePreference"("studentId");
        CREATE INDEX IF NOT EXISTS "StudentPairwisePreference_createdAt_idx"
            ON "StudentPairwisePreference"("createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())
}

fn ensure_ai_studio_project_versions_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "StudentAiStudioProjectVersion" (
            "id" TEXT PRIMARY KEY,
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
            FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "StudentAiStudioProjectVersion_studentId_idx"
            ON "StudentAiStudioProjectVersion"("studentId");
        CREATE INDEX IF NOT EXISTS "StudentAiStudioProjectVersion_projectId_idx"
            ON "StudentAiStudioProjectVersion"("projectId");
        CREATE INDEX IF NOT EXISTS "StudentAiStudioProjectVersion_createdAt_idx"
            ON "StudentAiStudioProjectVersion"("createdAt" DESC);
        "#,
    )
    .map_err(|e| e.to_string())
}

fn save_compare_run_record(
    conn: &Connection,
    student_id: &str,
    student_email: &str,
    prompt: &str,
    base_model: &str,
    trained_model_name: Option<&str>,
    trained_available: bool,
    base_output: &str,
    trained_output: Option<&str>,
    indicators: &[String],
    explanation: &str,
    category_tag: Option<&str>,
) -> Result<(String, String), String> {
    ensure_compare_run_table(conn)?;
    let compare_run_id = format!("{}", Uuid::new_v4());
    let indicators_json = serde_json::to_string(indicators).map_err(|e| e.to_string())?;
    let category_tag = category_tag
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());
    conn.execute(
        r#"INSERT INTO "StudentCompareRun"
           ("id", "studentId", "studentEmail", "prompt", "baseModel", "trainedModelName", "trainedAvailable", "baseOutput", "trainedOutput", "indicatorsJson", "explanation", "categoryTag", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))"#,
        params![
            compare_run_id.as_str(),
            student_id,
            student_email,
            prompt,
            base_model,
            trained_model_name,
            if trained_available { 1 } else { 0 },
            base_output,
            trained_output,
            indicators_json,
            explanation,
            category_tag.clone(),
        ],
    )
    .map_err(|e| e.to_string())?;
    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "StudentCompareRun" WHERE id = ?1"#,
            params![compare_run_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let title = truncate_for_chat_prompt(prompt, 160);
    let outcome = if trained_available {
        "compare_trained_vs_base"
    } else {
        "compare_base_only"
    };
    let metadata = serde_json::json!({
        "evaluationType": "compare",
        "studentId": student_id,
        "studentEmail": student_email,
        "prompt": prompt,
        "baseModel": base_model,
        "trainedModelName": trained_model_name,
        "trainedAvailable": trained_available,
        "baseOutput": base_output,
        "trainedOutput": trained_output,
        "indicators": indicators,
        "explanation": explanation,
        "categoryTag": category_tag,
        "createdAt": created_at,
    });
    append_student_evaluation_run(
        conn,
        student_id,
        student_email,
        "compare",
        compare_run_id.as_str(),
        &title,
        outcome,
        &metadata,
    )?;
    Ok((compare_run_id, created_at))
}

fn append_student_artifact_row(
    conn: &Connection,
    student_id: &str,
    student_email: &str,
    artifact_type: &str,
    label: &str,
    detail: &str,
) -> Result<(), String> {
    ensure_student_artifact_ledger_table(conn)?;
    conn.execute(
        r#"INSERT INTO "StudentArtifactLedger"
           ("id", "studentId", "studentEmail", "artifactType", "label", "detail", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))"#,
        params![
            format!("{}", Uuid::new_v4()),
            student_id,
            student_email.trim(),
            artifact_type.trim(),
            label.trim(),
            detail.trim(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn append_student_artifact_kind(
    conn: &Connection,
    student_id: &str,
    student_email: &str,
    kind: StudentArtifactKind,
    label: &str,
    detail: &str,
) -> Result<(), String> {
    append_student_artifact_row(conn, student_id, student_email, kind.as_str(), label, detail)
}

fn get_active_student_ollama_model_alias(
    conn: &Connection,
    student_id: &str,
) -> Result<Option<String>, String> {
    ensure_student_ollama_model_ref_table(conn)?;
    let alias = conn.query_row(
        r#"SELECT "ollamaModelAlias"
           FROM "StudentOllamaModelRef"
           WHERE "studentId" = ?1"#,
        params![student_id],
        |row| row.get::<_, String>(0),
    );
    match alias {
        Ok(x) => {
            let t = x.trim().to_string();
            if t.is_empty() {
                Ok(None)
            } else {
                Ok(Some(t))
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn normalize_ollama_alias(alias: &str) -> String {
    alias.trim().to_lowercase()
}

fn find_student_by_ollama_alias(
    conn: &Connection,
    alias: &str,
    exclude_student_id: Option<&str>,
) -> Result<Option<(String, String)>, String> {
    ensure_student_ollama_model_ref_table(conn)?;
    let normalized = normalize_ollama_alias(alias);
    if normalized.is_empty() {
        return Ok(None);
    }

    let row = if let Some(exclude_id) = exclude_student_id {
        conn.query_row(
            r#"SELECT "studentId", "studentEmail"
               FROM "StudentOllamaModelRef"
               WHERE LOWER(TRIM("ollamaModelAlias")) = ?1
                 AND "studentId" != ?2
               LIMIT 1"#,
            params![normalized, exclude_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
    } else {
        conn.query_row(
            r#"SELECT "studentId", "studentEmail"
               FROM "StudentOllamaModelRef"
               WHERE LOWER(TRIM("ollamaModelAlias")) = ?1
               LIMIT 1"#,
            params![normalized],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
    };

    match row {
        Ok(found) => Ok(Some(found)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn student_prefers_trained_model(conn: &Connection, student_id: &str) -> Result<bool, String> {
    ensure_student_model_usage_table(conn)?;
    let row = conn.query_row(
        r#"SELECT "useTrainedModel"
           FROM "StudentModelUsagePreference"
           WHERE "studentId" = ?1"#,
        params![student_id],
        |row| row.get::<_, i64>(0),
    );
    match row {
        Ok(v) => Ok(v != 0),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

pub fn append_student_artifact(req: AppendStudentArtifactRequest) -> Result<(), String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let artifact_type = req.artifact_type.trim();
    if artifact_type.is_empty() {
        return Err("Укажите тип артефакта.".into());
    }
    let label = req.label.trim();
    if label.is_empty() {
        return Err("Укажите заголовок артефакта.".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    append_student_artifact_row(
        &conn,
        &student_id,
        email,
        artifact_type,
        label,
        req.detail.as_deref().unwrap_or(""),
    )
}

pub fn get_student_artifact_summary(
    student_email: String,
) -> Result<StudentArtifactSummaryView, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    ensure_student_artifact_ledger_table(&conn)?;

    let total_count: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "StudentArtifactLedger" WHERE "studentId" = ?1"#,
            params![student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut counts_by_type: HashMap<String, i32> = HashMap::new();
    let mut stmt = conn
        .prepare(
            r#"SELECT "artifactType", COUNT(*)
               FROM "StudentArtifactLedger"
               WHERE "studentId" = ?1
               GROUP BY "artifactType""#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id.as_str()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (artifact_type, count) = row.map_err(|e| e.to_string())?;
        counts_by_type.insert(artifact_type, count);
    }

    Ok(StudentArtifactSummaryView {
        total_count,
        counts_by_type,
    })
}

pub fn list_recent_student_artifacts(
    student_email: String,
    limit: Option<i32>,
) -> Result<Vec<StudentArtifactRecordView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    ensure_student_artifact_ledger_table(&conn)?;
    let take = limit.unwrap_or(8).clamp(1, 30);

    let mut stmt = conn
        .prepare(
            r#"SELECT id, "artifactType", "label", "detail", "createdAt"
               FROM "StudentArtifactLedger"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC, id DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id.as_str(), take], |row| {
            Ok(StudentArtifactRecordView {
                artifact_id: row.get(0)?,
                artifact_type: row.get(1)?,
                label: row.get(2)?,
                detail: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out: Vec<StudentArtifactRecordView> = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn export_student_training_dataset(
    req: ExportStudentTrainingDatasetRequest,
) -> Result<ExportStudentTrainingDatasetResponse, String> {
    let conn = open_read_write()?;
    let (student_id, student_email) =
        resolve_student_selector(&conn, req.student_email, req.student_id)?;
    ensure_student_training_export_ref_table(&conn)?;
    ensure_student_dataset_snapshot_table(&conn)?;
    ensure_chat_training_authoring_columns(&conn)?;

    let now = timestamp_unix_secs()?;
    let student_token = sanitize_filename_token(&student_email);
    let export_dir = export_base_dir().join(format!("{student_token}-{now}"));
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let dataset_jsonl_path = export_dir.join("training_dataset.jsonl");
    let metadata_json_path = export_dir.join("metadata.json");
    let mut dataset_file = std::fs::File::create(&dataset_jsonl_path).map_err(|e| e.to_string())?;

    let mut dataset_example_rows = 0_i32;
    let mut prompt_experiment_rows = 0_i32;
    let mut chat_training_rows = 0_i32;

    {
        let mut stmt = conn
            .prepare(
                r#"SELECT "inputText", "correctAnswer", "selectedAnswer", "isCorrect", "taskType", "lessonId", "taskId", "createdAt"
                   FROM "DatasetExample"
                   WHERE "studentId" = ?1
                   ORDER BY "createdAt" ASC"#,
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![student_id.as_str()]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            dataset_example_rows += 1;
            let input_text: String = row.get(0).map_err(|e| e.to_string())?;
            let correct_answer: String = row.get(1).map_err(|e| e.to_string())?;
            let selected_answer: String = row.get(2).map_err(|e| e.to_string())?;
            let is_correct: i64 = row.get(3).map_err(|e| e.to_string())?;
            let task_type: String = row.get(4).map_err(|e| e.to_string())?;
            let lesson_id: String = row.get(5).map_err(|e| e.to_string())?;
            let task_id: String = row.get(6).map_err(|e| e.to_string())?;
            let created_at: String = row.get(7).map_err(|e| e.to_string())?;
            let line = json!({
                "type": "dataset_example",
                "input": input_text,
                "target": correct_answer,
                "meta": {
                    "studentId": student_id.as_str(),
                    "studentEmail": student_email.as_str(),
                    "selectedAnswer": selected_answer,
                    "isCorrect": is_correct != 0,
                    "taskType": task_type,
                    "lessonId": lesson_id,
                    "taskId": task_id,
                    "createdAt": created_at,
                    "source": "DatasetExample"
                }
            });
            writeln!(
                dataset_file,
                "{}",
                serde_json::to_string(&line).map_err(|e| e.to_string())?
            )
            .map_err(|e| e.to_string())?;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                r#"SELECT "taskTitle", "weakPrompt", "weakOutput", "improvedPrompt", "improvedOutput", "explanation", "createdAt"
                   FROM "PromptExperiment"
                   WHERE "studentId" = ?1
                   ORDER BY "createdAt" ASC"#,
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![student_id.as_str()]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            prompt_experiment_rows += 1;
            let task_title: String = row.get(0).map_err(|e| e.to_string())?;
            let weak_prompt: String = row.get(1).map_err(|e| e.to_string())?;
            let weak_output: String = row.get(2).map_err(|e| e.to_string())?;
            let improved_prompt: String = row.get(3).map_err(|e| e.to_string())?;
            let improved_output: String = row.get(4).map_err(|e| e.to_string())?;
            let explanation: String = row.get(5).map_err(|e| e.to_string())?;
            let created_at: String = row.get(6).map_err(|e| e.to_string())?;
            let line = json!({
                "type": "prompt_experiment",
                "instruction": task_title,
                "input": weak_prompt,
                "target": improved_output,
                "meta": {
                    "studentId": student_id.as_str(),
                    "studentEmail": student_email.as_str(),
                    "weakOutput": weak_output,
                    "improvedPrompt": improved_prompt,
                    "explanation": explanation,
                    "createdAt": created_at,
                    "source": "PromptExperiment"
                }
            });
            writeln!(
                dataset_file,
                "{}",
                serde_json::to_string(&line).map_err(|e| e.to_string())?
            )
            .map_err(|e| e.to_string())?;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                r#"SELECT "studentMessage", "aiAnswer", "answerQuality", "studentImprovement", "studentCritique", "failureCategory", "minimalEdit", "revisedTargetAnswer", "modelName", "referenceAnswer", "referenceModelName", "createdAt"
                   FROM "ChatTrainingInteraction"
                   WHERE "studentId" = ?1
                   ORDER BY "createdAt" ASC"#,
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![student_id.as_str()]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            chat_training_rows += 1;
            let student_message: String = row.get(0).map_err(|e| e.to_string())?;
            let ai_answer: String = row.get(1).map_err(|e| e.to_string())?;
            let answer_quality: i32 = row.get(2).map_err(|e| e.to_string())?;
            let student_improvement: Option<String> = row.get(3).map_err(|e| e.to_string())?;
            let student_critique: String = row.get(4).map_err(|e| e.to_string())?;
            let failure_category: String = row.get(5).map_err(|e| e.to_string())?;
            let minimal_edit: String = row.get(6).map_err(|e| e.to_string())?;
            let revised_target_answer: String = row.get(7).map_err(|e| e.to_string())?;
            let model_name: Option<String> = row.get(8).map_err(|e| e.to_string())?;
            let reference_answer: String = row.get(9).map_err(|e| e.to_string())?;
            let reference_model_name: Option<String> = row.get(10).map_err(|e| e.to_string())?;
            let created_at: String = row.get(11).map_err(|e| e.to_string())?;
            let target = revised_target_answer
                .trim()
                .to_string()
                .chars()
                .count()
                .gt(&0)
                .then_some(revised_target_answer.trim().to_string())
                .or_else(|| {
                    student_improvement
                        .as_deref()
                        .map(str::trim)
                        .filter(|x| !x.is_empty())
                        .map(|x| x.to_string())
                })
                .unwrap_or_else(|| ai_answer.clone());
            let has_legacy_improvement = student_improvement
                .as_deref()
                .map(str::trim)
                .is_some_and(|x| !x.is_empty());
            let line = json!({
                "type": "chat_training",
                "instruction": "Provide a short, helpful beginner-level answer and improve gradually from feedback.",
                "input": student_message,
                "target": target,
                "meta": {
                    "studentId": student_id.as_str(),
                    "studentEmail": student_email.as_str(),
                    "aiAnswer": ai_answer,
                    "answerQuality": answer_quality,
                    "hasStudentImprovement": has_legacy_improvement,
                    "studentImprovement": student_improvement,
                    "studentCritique": student_critique,
                    "failureCategory": failure_category,
                    "minimalEdit": minimal_edit,
                    "revisedTargetAnswer": revised_target_answer,
                    "modelName": model_name,
                    "referenceAnswer": reference_answer,
                    "referenceModelName": reference_model_name,
                    "createdAt": created_at,
                    "source": "ChatTrainingInteraction"
                }
            });
            writeln!(
                dataset_file,
                "{}",
                serde_json::to_string(&line).map_err(|e| e.to_string())?
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let total_rows = dataset_example_rows + prompt_experiment_rows + chat_training_rows;
    let metadata = json!({
        "phase": "2A-export-only",
        "exportedAtUnix": now,
        "studentId": student_id.as_str(),
        "studentEmail": student_email.as_str(),
        "counts": {
            "dataset_example": dataset_example_rows,
            "prompt_experiment": prompt_experiment_rows,
            "chat_training": chat_training_rows,
            "total": total_rows
        },
        "files": {
            "datasetJsonl": dataset_jsonl_path.to_string_lossy(),
            "metadataJson": metadata_json_path.to_string_lossy()
        },
        "note": "Export only. No LoRA training in this phase."
    });
    std::fs::write(
        &metadata_json_path,
        serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let dataset_snapshot_id = format!("{}", Uuid::new_v4());

    conn.execute(
        r#"INSERT INTO "StudentTrainingExportRef"
           ("id", "studentId", "studentEmail", "datasetJsonlPath", "metadataJsonPath", "datasetExampleRows", "promptExperimentRows", "chatTrainingRows", "totalRows", "createdAt", "updatedAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))
           ON CONFLICT("studentId") DO UPDATE SET
              "studentEmail" = excluded."studentEmail",
              "datasetJsonlPath" = excluded."datasetJsonlPath",
              "metadataJsonPath" = excluded."metadataJsonPath",
              "datasetExampleRows" = excluded."datasetExampleRows",
              "promptExperimentRows" = excluded."promptExperimentRows",
              "chatTrainingRows" = excluded."chatTrainingRows",
              "totalRows" = excluded."totalRows",
              "updatedAt" = datetime('now')"#,
        params![
            format!("{}", Uuid::new_v4()),
            student_id.as_str(),
            student_email.as_str(),
            dataset_jsonl_path.to_string_lossy().to_string(),
            metadata_json_path.to_string_lossy().to_string(),
            dataset_example_rows,
            prompt_experiment_rows,
            chat_training_rows,
            total_rows,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        r#"INSERT INTO "StudentDatasetSnapshot"
           ("id", "studentId", "studentEmail", "datasetJsonlPath", "metadataJsonPath", "datasetExampleRows", "promptExperimentRows", "chatTrainingRows", "totalRows", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))"#,
        params![
            dataset_snapshot_id.as_str(),
            student_id.as_str(),
            student_email.as_str(),
            dataset_jsonl_path.to_string_lossy().to_string(),
            metadata_json_path.to_string_lossy().to_string(),
            dataset_example_rows,
            prompt_experiment_rows,
            chat_training_rows,
            total_rows,
        ],
    )
    .map_err(|e| e.to_string())?;

    append_student_artifact_kind(
        &conn,
        student_id.as_str(),
        student_email.as_str(),
        StudentArtifactKind::DatasetExported,
        "Training Manager: данные обучения подготовлены",
        &format!("Подготовлено {} строк для обучения.", total_rows),
    )?;

    Ok(ExportStudentTrainingDatasetResponse {
        student_id,
        student_email,
        dataset_snapshot_id,
        export_dir: export_dir.to_string_lossy().to_string(),
        dataset_jsonl_path: dataset_jsonl_path.to_string_lossy().to_string(),
        metadata_json_path: metadata_json_path.to_string_lossy().to_string(),
        total_rows,
        dataset_example_rows,
        prompt_experiment_rows,
        chat_training_rows,
    })
}

fn command_output_text(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "Команда не вернула подробностей.".to_string()
    }
}

fn validate_ollama_model_alias(alias: &str) -> Result<(), String> {
    if alias.chars().any(char::is_whitespace) {
        return Err("Имя модели Ollama не должно содержать пробелы. Используйте, например, student-name-qwen3-lora.".to_string());
    }
    let allowed = alias
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':' | '/'));
    if !allowed {
        return Err("Имя модели Ollama может содержать только латинские буквы, цифры и символы - _ . : /.".to_string());
    }
    Ok(())
}

pub fn register_student_ollama_model(
    req: RegisterStudentOllamaModelRequest,
) -> Result<RegisterStudentOllamaModelResponse, String> {
    let base_model = req.base_model.trim();
    if base_model.is_empty() {
        return Err("Укажите базовую модель Ollama, например qwen3:8b.".to_string());
    }
    let adapter_path_raw = req.adapter_path.trim();
    if adapter_path_raw.is_empty() {
        return Err("Укажите путь к адаптеру или папке с обученной версией модели.".to_string());
    }
    let alias = req.ollama_model_alias.trim();
    if alias.is_empty() {
        return Err("Укажите имя модели, которое будет создано в Ollama.".to_string());
    }
    validate_ollama_model_alias(alias)?;

    let adapter_path = PathBuf::from(adapter_path_raw);
    if !adapter_path.exists() {
        return Err(format!(
            "Адаптер не найден: {}. Проверьте путь после обучения модели.",
            adapter_path.display()
        ));
    }

    let ollama_check = Command::new("ollama").arg("--version").output().map_err(|e| {
        format!("Не удалось запустить Ollama. Проверьте, что Ollama установлена и доступна в PATH. Подробности: {e}")
    })?;
    if !ollama_check.status.success() {
        return Err(format!(
            "Ollama не отвечает на проверочный запуск: {}",
            command_output_text(&ollama_check)
        ));
    }

    let base_check = Command::new("ollama")
        .arg("show")
        .arg(base_model)
        .output()
        .map_err(|e| format!("Не удалось проверить базовую модель `{base_model}`: {e}"))?;
    if !base_check.status.success() {
        return Err(format!(
            "Базовая модель `{base_model}` не найдена в Ollama. Сначала загрузите её командой `ollama pull {base_model}`. Подробности: {}",
            command_output_text(&base_check)
        ));
    }

    let conn = open_read_write()?;
    let (student_id, student_email) =
        resolve_student_selector(&conn, req.student_email, req.student_id)?;
    ensure_student_ollama_model_ref_table(&conn)?;
    ensure_student_model_version_table(&conn)?;
    ensure_student_dataset_snapshot_table(&conn)?;

    if let Some((_other_student_id, other_student_email)) =
        find_student_by_ollama_alias(&conn, alias, Some(&student_id))?
    {
        return Err(format!(
            "Имя модели `{alias}` уже привязано к другому ученику ({other_student_email}). Выберите уникальное имя для честного Compare и Arena."
        ));
    }

    let work_dir = ollama_model_base_dir().join(sanitize_filename_token(&student_email));
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    let modelfile_path = work_dir.join(format!(
        "Modelfile-{}.txt",
        sanitize_filename_token(alias)
    ));
    let mut modelfile = String::new();
    modelfile.push_str(&format!("FROM {}\n", base_model));
    let adapter_for_modelfile = adapter_path.display().to_string().replace('\\', "/");
    modelfile.push_str(&format!(
        "ADAPTER \"{}\"\n",
        adapter_for_modelfile.replace('"', "\\\"")
    ));
    if let Some(system_text) = req.system_prompt {
        let system_trimmed = system_text.trim();
        if !system_trimmed.is_empty() {
            let escaped = system_trimmed.replace("\"\"\"", "\\\"\\\"\\\"");
            modelfile.push_str("\nSYSTEM \"\"\"\n");
            modelfile.push_str(&escaped);
            modelfile.push_str("\n\"\"\"\n");
        }
    }
    std::fs::write(&modelfile_path, modelfile).map_err(|e| e.to_string())?;

    let output = Command::new("ollama")
        .arg("create")
        .arg(alias)
        .arg("-f")
        .arg(&modelfile_path)
        .output()
        .map_err(|e| format!("Не удалось запустить `ollama create`: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "`ollama create` не смог зарегистрировать модель `{alias}`. Проверьте базовую модель и путь к адаптеру. Подробности: {}",
            command_output_text(&output)
        ));
    }

    let training_summary_path = req
        .training_summary_path
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());

    conn.execute(
        r#"INSERT INTO "StudentOllamaModelRef"
           ("id", "studentId", "studentEmail", "baseModel", "adapterPath", "ollamaModelAlias", "modelfilePath", "trainingSummaryPath", "createdAt", "updatedAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))
           ON CONFLICT("studentId") DO UPDATE SET
             "studentEmail" = excluded."studentEmail",
             "baseModel" = excluded."baseModel",
             "adapterPath" = excluded."adapterPath",
             "ollamaModelAlias" = excluded."ollamaModelAlias",
             "modelfilePath" = excluded."modelfilePath",
             "trainingSummaryPath" = excluded."trainingSummaryPath",
             "updatedAt" = datetime('now')"#,
        params![
            format!("{}", Uuid::new_v4()),
            student_id,
            student_email,
            base_model,
            adapter_path.display().to_string(),
            alias,
            modelfile_path.display().to_string(),
            training_summary_path.as_deref(),
        ],
    )
    .map_err(|e| e.to_string())?;

    let model_version_id = format!("{}", Uuid::new_v4());
    let dataset_snapshot_id = latest_dataset_snapshot_id(&conn, &student_id)?;
    conn.execute(
        r#"INSERT INTO "StudentModelVersion"
           ("id", "studentId", "studentEmail", "datasetSnapshotId", "baseModel", "adapterPath", "ollamaModelAlias", "modelfilePath", "trainingSummaryPath", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))"#,
        params![
            model_version_id.as_str(),
            student_id.as_str(),
            student_email.as_str(),
            dataset_snapshot_id.as_deref(),
            base_model,
            adapter_path.display().to_string(),
            alias,
            modelfile_path.display().to_string(),
            training_summary_path.as_deref(),
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        r#"INSERT INTO "ModelProfile"
           (id, "studentId", "modelType", "datasetSize", accuracy, "lastTrainedAt")
           VALUES (?1, ?2, ?3, 0, 0.0, datetime('now'))
           ON CONFLICT("studentId") DO UPDATE SET
             "modelType" = excluded."modelType",
             "lastTrainedAt" = COALESCE("ModelProfile"."lastTrainedAt", datetime('now'))"#,
        params![format!("{}", Uuid::new_v4()), student_id, alias],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &conn,
        &student_id,
        &student_email,
        StudentArtifactKind::LoraAdapterRegistered,
        "Training Manager: модель подключена",
        &format!("Подключена Ollama-модель {}.", alias),
    )?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt"
               FROM "StudentOllamaModelRef"
               WHERE "studentId" = ?1"#,
            params![student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(RegisterStudentOllamaModelResponse {
        student_id,
        student_email,
        model_version_id,
        dataset_snapshot_id,
        base_model: base_model.to_string(),
        adapter_path: adapter_path.display().to_string(),
        ollama_model_alias: alias.to_string(),
        modelfile_path: modelfile_path.display().to_string(),
        training_summary_path,
        created_at,
    })
}

pub fn set_student_trained_model_usage(
    student_email: String,
    use_trained_model: bool,
) -> Result<(), String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    ensure_student_model_usage_table(&conn)?;
    conn.execute(
        r#"INSERT INTO "StudentModelUsagePreference"
           ("id", "studentId", "useTrainedModel", "updatedAt")
           VALUES (?1, ?2, ?3, datetime('now'))
           ON CONFLICT("studentId") DO UPDATE SET
             "useTrainedModel" = excluded."useTrainedModel",
             "updatedAt" = datetime('now')"#,
        params![
            format!("{}", Uuid::new_v4()),
            student_id,
            if use_trained_model { 1 } else { 0 }
        ],
    )
    .map_err(|e| e.to_string())?;
    if use_trained_model {
        append_student_artifact_kind(
            &conn,
            &student_id,
            email,
            StudentArtifactKind::TrainedModelActivated,
            "Training Manager: обученная модель активирована",
            "Студент переключил приложение на обученную модель.",
        )?;
    }
    Ok(())
}

pub fn get_student_training_pipeline_status(
    student_email: String,
) -> Result<StudentTrainingPipelineStatusView, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    ensure_student_training_export_ref_table(&conn)?;
    ensure_student_ollama_model_ref_table(&conn)?;
    ensure_student_dataset_snapshot_table(&conn)?;
    ensure_student_model_version_table(&conn)?;
    ensure_student_model_usage_table(&conn)?;
    ensure_chat_training_authoring_columns(&conn)?;
    let dataset_snapshot_id = latest_dataset_snapshot_id(&conn, &student_id)?;
    let model_version_id = latest_model_version_id(&conn, &student_id)?;

    let dataset_example_count: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "DatasetExample" WHERE "studentId" = ?1"#,
            params![student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let prompt_experiment_count: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "PromptExperiment" WHERE "studentId" = ?1"#,
            params![student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let chat_training_interaction_count: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "ChatTrainingInteraction" WHERE "studentId" = ?1"#,
            params![student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let chat_training_strong_example_count: i32 = conn
        .query_row(
            r#"
            SELECT COUNT(*)
            FROM "ChatTrainingInteraction"
            WHERE "studentId" = ?1
              AND LENGTH(TRIM(COALESCE("studentMessage", ''))) >= 24
              AND LENGTH(TRIM(COALESCE("aiAnswer", ''))) >= 32
              AND LENGTH(TRIM(COALESCE("studentCritique", ''))) >= 24
              AND LENGTH(TRIM(COALESCE("failureCategory", ''))) > 0
              AND LENGTH(TRIM(COALESCE("minimalEdit", ''))) >= 12
              AND LENGTH(TRIM(COALESCE("revisedTargetAnswer", ''))) >= 40
              AND COALESCE("answerQuality", 0) >= 4
            "#,
            params![student_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let export_ref = conn.query_row(
        r#"SELECT "datasetJsonlPath", "metadataJsonPath", "totalRows", "datasetExampleRows", "promptExperimentRows", "chatTrainingRows", "createdAt"
           FROM "StudentTrainingExportRef"
           WHERE "studentId" = ?1"#,
        params![student_id.as_str()],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, String>(6)?,
            ))
        },
    );
    let (
        exported_dataset_path,
        export_metadata_path,
        export_total_rows,
        export_dataset_example_rows,
        export_prompt_experiment_rows,
        export_chat_training_rows,
        export_created_at,
    ) = match export_ref {
        Ok((a, b, total, dataset_rows, prompt_rows, chat_rows, created_at)) => (
            Some(a),
            Some(b),
            total,
            dataset_rows,
            prompt_rows,
            chat_rows,
            Some(created_at),
        ),
        Err(rusqlite::Error::QueryReturnedNoRows) => (None, None, 0, 0, 0, 0, None),
        Err(e) => return Err(e.to_string()),
    };
    let export_available = exported_dataset_path
        .as_deref()
        .map(PathBuf::from)
        .map(|p| p.exists())
        .unwrap_or(false);

    let model_ref = conn.query_row(
        r#"SELECT "baseModel", "adapterPath", "ollamaModelAlias", "trainingSummaryPath"
           FROM "StudentOllamaModelRef"
           WHERE "studentId" = ?1"#,
        params![student_id.as_str()],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        },
    );
    let (base_model_name, adapter_path, active_student_model_alias, training_summary_path, model_registered_at) = match model_ref {
        Ok((base, adapter, alias, summary)) => {
            let created_at = conn
                .query_row(
                    r#"SELECT "createdAt"
                       FROM "StudentOllamaModelRef"
                       WHERE "studentId" = ?1"#,
                    params![student_id.as_str()],
                    |row| row.get::<_, String>(0),
                )
                .ok();
            let alias_clean = alias.trim().to_string();
            (
                if base.trim().is_empty() {
                    OLLAMA_BASE_MODEL_DEFAULT.to_string()
                } else {
                    base
                },
                Some(adapter),
                if alias_clean.is_empty() { None } else { Some(alias_clean) },
                summary.and_then(|x| {
                    let t = x.trim().to_string();
                    if t.is_empty() { None } else { Some(t) }
                }),
                created_at,
            )
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => (
            OLLAMA_BASE_MODEL_DEFAULT.to_string(),
            None,
            None,
            None,
            None,
        ),
        Err(e) => return Err(e.to_string()),
    };

    let adapter_available = adapter_path
        .as_deref()
        .map(PathBuf::from)
        .map(|p| p.exists())
        .unwrap_or(false);
    let ollama_model_registered = active_student_model_alias.is_some();
    let use_trained_pref = student_prefers_trained_model(&conn, &student_id)?;
    let using_trained_model = use_trained_pref && ollama_model_registered;
    let dataset_size =
        dataset_example_count + prompt_experiment_count + chat_training_interaction_count;

    let suggested_next_step = if !export_available {
        "Подготовьте данные для обучения.".to_string()
    } else if !adapter_available {
        "Запустите обучение модели по подготовленным данным.".to_string()
    } else if !ollama_model_registered {
        "Подключите обученную версию модели.".to_string()
    } else if !using_trained_model {
        "Включите использование обученной модели для чата.".to_string()
    } else {
        "Модель активна. Продолжайте тренировать данные и сравнивайте ответы.".to_string()
    };

    Ok(StudentTrainingPipelineStatusView {
        student_id,
        student_email: email.to_string(),
        dataset_snapshot_id,
        model_version_id,
        base_model_name,
        active_student_model_alias,
        using_trained_model,
        dataset_size,
        dataset_example_count,
        prompt_experiment_count,
        chat_training_interaction_count,
        chat_training_strong_example_count,
        export_available,
        exported_dataset_path,
        export_metadata_path,
        export_created_at,
        export_total_rows,
        export_dataset_example_rows,
        export_prompt_experiment_rows,
        export_chat_training_rows,
        adapter_available,
        adapter_path,
        ollama_model_registered,
        model_registered_at,
        training_summary_path,
        suggested_next_step,
    })
}

fn split_words_count(s: &str) -> usize {
    s.split_whitespace().count()
}

fn has_structure_markers(s: &str) -> bool {
    let t = s.to_lowercase();
    t.contains("1.")
        || t.contains("2.")
        || t.contains("- ")
        || t.contains("шаг")
        || t.contains("во-первых")
        || t.contains("сначала")
}

fn has_supportive_markers(s: &str) -> bool {
    let t = s.to_lowercase();
    ["давай", "можешь", "попробуй", "не страшно", "поддерж", "вместе"]
        .iter()
        .any(|k| t.contains(k))
}

pub async fn compare_student_models(
    req: CompareStudentModelsRequest,
) -> Result<CompareStudentModelsResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let prompt = req.prompt.trim();
    if prompt.is_empty() {
        return Err("Введите промпт для сравнения.".into());
    }
    let category_tag = req
        .category_tag
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());

    let ctx = get_chat_training_context(email.to_string())?;
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    let base_model = OLLAMA_BASE_MODEL_DEFAULT.to_string();
    let trained_alias = get_active_student_ollama_model_alias(&conn, &student_id)?;
    let trained_available = trained_alias.is_some();
    let system_prompt = chat_training_ollama_system_prompt(&ctx);

    let base_response = match ollama::generate_with_ollama(
        &base_model,
        system_prompt.clone(),
        prompt.to_string(),
    )
    .await
    {
        Ok(x) => {
            let t = x.trim();
            if t.is_empty() {
                "Пустой ответ базовой модели.".to_string()
            } else {
                t.to_string()
            }
        }
        Err(_) => "ИИ временно недоступен. Проверь Ollama.".to_string(),
    };

    let trained_response = if let Some(alias) = trained_alias.as_deref() {
        match ollama::generate_with_ollama(alias, system_prompt, prompt.to_string()).await {
            Ok(x) => {
                let t = x.trim();
                if t.is_empty() {
                    Some("Пустой ответ обученной модели.".to_string())
                } else {
                    Some(t.to_string())
                }
            }
            Err(_) => Some("ИИ временно недоступен. Проверь Ollama.".to_string()),
        }
    } else {
        None
    };

    let mut indicators: Vec<String> = Vec::new();
    if let Some(trained) = trained_response.as_deref() {
        let base_len = split_words_count(&base_response);
        let trained_len = split_words_count(trained);
        if has_structure_markers(trained) && !has_structure_markers(&base_response) {
            indicators.push("более структурно".to_string());
        }
        if trained_len > base_len + 8 {
            indicators.push("ближе к обучению ученика".to_string());
        }
        if has_supportive_markers(trained) && !has_supportive_markers(&base_response) {
            indicators.push("более подходяще по тону".to_string());
        }
        if indicators.is_empty() && trained_len >= base_len {
            indicators.push("более уверенно / более подходяще".to_string());
        }
    }

    let explanation = if trained_available {
        "Обе модели получили один и тот же промпт. Разница возникает из-за student-specific LoRA адаптера и накопленных учебных данных."
            .to_string()
    } else {
        "Обученная модель пока не зарегистрирована. Сначала зарегистрируйте alias в разделе управления тренировкой."
            .to_string()
    };

    let (compare_run_id, created_at) = save_compare_run_record(
        &conn,
        &student_id,
        email,
        prompt,
        &base_model,
        trained_alias.as_deref(),
        trained_available,
        &base_response,
        trained_response.as_deref(),
        &indicators,
        &explanation,
        category_tag.as_deref(),
    )?;

    append_student_artifact_kind(
        &conn,
        &student_id,
        email,
        StudentArtifactKind::CompareRunCompleted,
        "Compare: доказательное сравнение сохранено",
        if trained_available {
            "Сравнение базовой и обученной модели сохранено в истории результатов."
        } else {
            "Compare сохранён в истории, но обученная модель пока недоступна."
        },
    )?;

    Ok(CompareStudentModelsResponse {
        compare_run_id,
        base_model,
        trained_model_alias: trained_alias,
        trained_available,
        prompt: prompt.to_string(),
        base_response,
        trained_response,
        indicators,
        explanation,
        category_tag,
        created_at,
    })
}

pub fn list_compare_run_history(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<CompareRunHistoryItemView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    ensure_compare_run_table(&conn)?;
    let student_id = student_id_for_email(&conn, email)?;
    let mut stmt = conn
        .prepare(
            r#"SELECT "id", "prompt", "baseModel", "trainedModelName", "trainedAvailable", "baseOutput", "trainedOutput", "indicatorsJson", "explanation", "categoryTag", "createdAt"
               FROM "StudentCompareRun"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id, limit.unwrap_or(12)], |row| {
            let indicators_json: String = row.get(7)?;
            let indicators = serde_json::from_str::<Vec<String>>(&indicators_json).unwrap_or_default();
            let trained_available_raw: i32 = row.get(4)?;
            Ok(CompareRunHistoryItemView {
                compare_run_id: row.get(0)?,
                prompt: row.get(1)?,
                base_model: row.get(2)?,
                trained_model_name: row.get(3)?,
                trained_available: trained_available_raw > 0,
                base_output: row.get(5)?,
                trained_output: row.get(6)?,
                indicators,
                explanation: row.get(8)?,
                category_tag: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn save_pairwise_preference(
    req: SavePairwisePreferenceRequest,
) -> Result<PairwisePreferenceHistoryItemView, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let prompt = req.prompt.trim();
    if prompt.is_empty() {
        return Err("Укажите запрос для выбора лучшего ответа.".into());
    }
    let left_model_name = req.left_model_name.trim();
    let right_model_name = req.right_model_name.trim();
    let left_output = req.left_output.trim();
    let right_output = req.right_output.trim();
    if left_model_name.is_empty() || right_model_name.is_empty() {
        return Err("Нужно указать обе модели для сравнения.".into());
    }
    if left_output.is_empty() || right_output.is_empty() {
        return Err("Для выбора лучшего ответа нужны два непустых ответа.".into());
    }
    let chosen_winner = req.chosen_winner.trim().to_lowercase();
    if chosen_winner != "left" && chosen_winner != "right" && chosen_winner != "draw" {
        return Err("Выберите левый ответ, правый ответ или ничью.".into());
    }
    let rationale = req.rationale.trim();
    if rationale.is_empty() {
        return Err("Добавьте короткое объяснение выбора.".into());
    }

    let mut conn = open_read_write()?;
    ensure_pairwise_preference_table(&conn)?;
    let student_id = student_id_for_email(&conn, email)?;
    let preference_id = format!("{}", Uuid::new_v4());
    let source_surface = if req.source_surface.trim().is_empty() {
        "compare".to_string()
    } else {
        req.source_surface.trim().to_string()
    };
    let compare_run_id = req
        .compare_run_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "StudentPairwisePreference"
           ("id", "studentId", "studentEmail", "prompt", "leftModelName", "rightModelName", "leftOutput", "rightOutput", "chosenWinner", "rationale", "sourceSurface", "compareRunId", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))"#,
        params![
            preference_id,
            student_id,
            email,
            prompt,
            left_model_name,
            right_model_name,
            left_output,
            right_output,
            chosen_winner,
            rationale,
            source_surface,
            compare_run_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    append_student_artifact_kind(
        &tx,
        &student_id,
        email,
        StudentArtifactKind::PairwisePreferenceSaved,
        "Сохранён выбор лучшего ответа",
        rationale,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "StudentPairwisePreference" WHERE id = ?1"#,
            params![preference_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(PairwisePreferenceHistoryItemView {
        preference_id,
        prompt: prompt.to_string(),
        left_model_name: left_model_name.to_string(),
        right_model_name: right_model_name.to_string(),
        left_output: left_output.to_string(),
        right_output: right_output.to_string(),
        chosen_winner,
        rationale: rationale.to_string(),
        source_surface,
        compare_run_id,
        created_at,
    })
}

pub fn list_pairwise_preferences(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<PairwisePreferenceHistoryItemView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_read_write()?;
    ensure_pairwise_preference_table(&conn)?;
    let student_id = student_id_for_email(&conn, email)?;
    let mut stmt = conn
        .prepare(
            r#"SELECT "id", "prompt", "leftModelName", "rightModelName", "leftOutput", "rightOutput", "chosenWinner", "rationale", "sourceSurface", "compareRunId", "createdAt"
               FROM "StudentPairwisePreference"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id, limit.unwrap_or(8)], |row| {
            Ok(PairwisePreferenceHistoryItemView {
                preference_id: row.get(0)?,
                prompt: row.get(1)?,
                left_model_name: row.get(2)?,
                right_model_name: row.get(3)?,
                left_output: row.get(4)?,
                right_output: row.get(5)?,
                chosen_winner: row.get(6)?,
                rationale: row.get(7)?,
                source_surface: row.get(8)?,
                compare_run_id: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn save_benchmark_run(
    req: SaveBenchmarkRunRequest,
) -> Result<BenchmarkRunHistoryItemView, String> {
    let email = req.student_email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let mode = req.mode.trim().to_string();
    let mission_id = req.benchmark_mission_id.trim().to_string();
    let benchmark_title = req.benchmark_title.trim().to_string();
    let benchmark_category = req.benchmark_category.trim().to_string();
    let prompt = req.prompt.trim().to_string();
    let primary_model_name = req.primary_model_name.trim().to_string();
    let primary_output = req.primary_output.trim().to_string();
    let result_winner = req.result_winner.trim().to_string();
    let explanation = req.explanation.trim().to_string();
    if mode.is_empty()
        || mission_id.is_empty()
        || benchmark_title.is_empty()
        || benchmark_category.is_empty()
        || prompt.is_empty()
        || primary_model_name.is_empty()
        || primary_output.is_empty()
        || result_winner.is_empty()
    {
        return Err("Недостаточно данных для сохранения проверки Arena.".into());
    }

    let mut conn = open_read_write()?;
    ensure_benchmark_run_table(&conn)?;
    let student_id = student_id_for_email(&conn, &email)?;
    let benchmark_run_id = format!("{}", Uuid::new_v4());
    let indicators_json = serde_json::to_string(&req.indicators).map_err(|e| e.to_string())?;
    let secondary_model_name = req
        .secondary_model_name
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());
    let secondary_output = req
        .secondary_output
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());
    let opponent_student_email = req
        .opponent_student_email
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "StudentBenchmarkRun"
           ("id", "studentId", "studentEmail", "mode", "benchmarkMissionId", "benchmarkTitle", "benchmarkCategory", "prompt", "primaryModelName", "secondaryModelName", "primaryOutput", "secondaryOutput", "resultWinner", "indicatorsJson", "explanation", "opponentStudentEmail", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'))"#,
        params![
            benchmark_run_id.as_str(),
            &student_id,
            &email,
            &mode,
            &mission_id,
            &benchmark_title,
            &benchmark_category,
            &prompt,
            &primary_model_name,
            &secondary_model_name,
            &primary_output,
            &secondary_output,
            &result_winner,
            indicators_json.as_str(),
            &explanation,
            opponent_student_email.as_deref(),
        ],
    )
    .map_err(|e| e.to_string())?;
    let arena_created_at: String = tx
        .query_row(
            r#"SELECT "createdAt" FROM "StudentBenchmarkRun" WHERE id = ?1"#,
            params![benchmark_run_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let evaluation_type = if mode == "pvp" {
        "arena_pvp"
    } else {
        "arena_benchmark"
    };
    let arena_metadata = serde_json::json!({
        "evaluationType": evaluation_type,
        "studentId": student_id,
        "studentEmail": email,
        "mode": mode,
        "benchmarkMissionId": mission_id,
        "benchmarkTitle": benchmark_title,
        "benchmarkCategory": benchmark_category,
        "prompt": prompt,
        "primaryModelName": primary_model_name,
        "secondaryModelName": secondary_model_name,
        "primaryOutput": primary_output,
        "secondaryOutput": secondary_output,
        "resultWinner": result_winner,
        "indicators": req.indicators,
        "explanation": explanation,
        "opponentStudentEmail": opponent_student_email,
        "createdAt": arena_created_at,
    });
    append_student_evaluation_run(
        &tx,
        &student_id,
        &email,
        evaluation_type,
        benchmark_run_id.as_str(),
        &truncate_for_chat_prompt(&benchmark_title, 200),
        &result_winner,
        &arena_metadata,
    )?;
    append_student_artifact_kind(
        &tx,
        &student_id,
        &email,
        StudentArtifactKind::BenchmarkEvalCompleted,
        "Arena: проверка на задачах сохранена",
        &format!("{} · {} · итог={}", benchmark_title, benchmark_category, result_winner),
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "StudentBenchmarkRun" WHERE id = ?1"#,
            params![benchmark_run_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(BenchmarkRunHistoryItemView {
        benchmark_run_id,
        mode,
        benchmark_mission_id: mission_id,
        benchmark_title,
        benchmark_category,
        prompt,
        primary_model_name,
        secondary_model_name,
        primary_output,
        secondary_output,
        result_winner,
        indicators: req.indicators,
        explanation,
        opponent_student_email,
        created_at,
    })
}

pub fn list_benchmark_run_history(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<BenchmarkRunHistoryItemView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    ensure_benchmark_run_table(&conn)?;
    let student_id = student_id_for_email(&conn, email)?;
    let mut stmt = conn
        .prepare(
            r#"SELECT "id", "mode", "benchmarkMissionId", "benchmarkTitle", "benchmarkCategory", "prompt", "primaryModelName", "secondaryModelName", "primaryOutput", "secondaryOutput", "resultWinner", "indicatorsJson", "explanation", "opponentStudentEmail", "createdAt"
               FROM "StudentBenchmarkRun"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id, limit.unwrap_or(12)], |row| {
            let indicators_json: String = row.get(11)?;
            let indicators = serde_json::from_str::<Vec<String>>(&indicators_json).unwrap_or_default();
            Ok(BenchmarkRunHistoryItemView {
                benchmark_run_id: row.get(0)?,
                mode: row.get(1)?,
                benchmark_mission_id: row.get(2)?,
                benchmark_title: row.get(3)?,
                benchmark_category: row.get(4)?,
                prompt: row.get(5)?,
                primary_model_name: row.get(6)?,
                secondary_model_name: row.get(7)?,
                primary_output: row.get(8)?,
                secondary_output: row.get(9)?,
                result_winner: row.get(10)?,
                indicators,
                explanation: row.get(12)?,
                opponent_student_email: row.get(13)?,
                created_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub async fn generate_ai_studio_project(
    req: GenerateAiStudioProjectRequest,
) -> Result<AiStudioGenerationResponse, String> {
    let email = req.student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let project_type = req.project_type.trim();
    if ai_studio_project_type_label(project_type).is_none() {
        return Err("Выберите тип проекта AI Studio.".into());
    }
    let goal = req.goal.trim();
    if goal.is_empty() {
        return Err("Опишите цель проекта.".into());
    }
    let constraints = req
        .constraints
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .unwrap_or("Без дополнительных ограничений.");
    let generation_request = ai_studio_generation_request(
        project_type,
        goal,
        constraints,
        req.improvement_request.as_deref(),
    );

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    let (model_name, using_trained_model) = prompt_lab_selected_model(&conn, &student_id)?;
    let system_prompt = ai_studio_system_prompt(project_type)?;
    let user_prompt = ai_studio_user_prompt(&req, constraints, &generation_request);
    let raw = ollama::generate_with_ollama(&model_name, system_prompt, user_prompt)
        .await
        .map_err(|_| PROMPT_LAB_AI_UNAVAILABLE.to_string())?;
    let (html_code, css_code, js_code) = ai_studio_parse_generation_payload(&raw)?;

    Ok(AiStudioGenerationResponse {
        project_type: project_type.to_string(),
        goal: goal.to_string(),
        constraints: constraints.to_string(),
        generation_request,
        html_code,
        css_code,
        js_code,
        model_name,
        using_trained_model,
    })
}

pub fn save_ai_studio_project_version(
    req: SaveAiStudioProjectVersionRequest,
) -> Result<AiStudioProjectVersionView, String> {
    let email = req.student_email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let project_type = req.project_type.trim().to_string();
    if ai_studio_project_type_label(&project_type).is_none() {
        return Err("Выберите тип проекта AI Studio.".into());
    }
    let goal = req.goal.trim().to_string();
    if goal.is_empty() {
        return Err("Опишите цель проекта.".into());
    }
    let generation_request = req.generation_request.trim().to_string();
    if generation_request.is_empty() {
        return Err("Нечего сохранять: отсутствует запрос генерации.".into());
    }
    let html_code = req.html_code.trim().to_string();
    if html_code.is_empty() {
        return Err("Нечего сохранять: отсутствует HTML проекта.".into());
    }
    let css_code = req.css_code.trim().to_string();
    let js_code = req.js_code.trim().to_string();
    let constraints = req
        .constraints
        .unwrap_or_default()
        .trim()
        .to_string();
    let model_name = req
        .model_name
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string());

    let mut conn = open_read_write()?;
    ensure_ai_studio_project_versions_table(&conn)?;
    let student_id = student_id_for_email(&conn, &email)?;
    let project_id = req
        .project_id
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string())
        .unwrap_or_else(|| format!("{}", Uuid::new_v4()));
    let version_id = format!("{}", Uuid::new_v4());
    let existing_versions: i32 = conn
        .query_row(
            r#"SELECT COUNT(*) FROM "StudentAiStudioProjectVersion" WHERE "studentId" = ?1 AND "projectId" = ?2"#,
            params![student_id.as_str(), project_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let is_new_project = existing_versions == 0;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO "StudentAiStudioProjectVersion"
           ("id", "projectId", "studentId", "studentEmail", "projectType", "goal", "constraintsText", "generationRequest", "htmlCode", "cssCode", "jsCode", "modelName", "createdAt")
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))"#,
        params![
            version_id,
            project_id,
            student_id,
            email,
            project_type,
            goal,
            constraints,
            generation_request,
            html_code,
            css_code,
            js_code,
            model_name,
        ],
    )
    .map_err(|e| e.to_string())?;
    if is_new_project {
        append_student_artifact_kind(
            &tx,
            &student_id,
            &email,
            StudentArtifactKind::AiStudioProjectCreated,
            "AI Studio: проект создан",
            "Студент создал новый build-проект в AI Studio.",
        )?;
    }
    append_student_artifact_kind(
        &tx,
        &student_id,
        &email,
        StudentArtifactKind::AiStudioVersionSaved,
        "AI Studio: версия сохранена",
        &format!("{} · {}", ai_studio_project_type_label(&project_type).unwrap_or("проект"), goal),
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    let created_at: String = conn
        .query_row(
            r#"SELECT "createdAt" FROM "StudentAiStudioProjectVersion" WHERE "id" = ?1"#,
            params![version_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(AiStudioProjectVersionView {
        version_id,
        project_id,
        project_type,
        goal,
        constraints,
        generation_request,
        html_code,
        css_code,
        js_code,
        model_name,
        created_at,
    })
}

fn ai_studio_project_export_root() -> Result<PathBuf, String> {
    let paths = database_runtime_paths()?;
    let class_root = paths
        .data_dir
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.data_dir.clone());
    let root = class_root.join("projects");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn student_ai_package_export_root() -> Result<PathBuf, String> {
    let paths = database_runtime_paths()?;
    let class_root = paths
        .data_dir
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.data_dir.clone());
    let root = class_root.join("my-ai-packages");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn student_training_jobs_root() -> Result<PathBuf, String> {
    let paths = database_runtime_paths()?;
    let class_root = paths
        .data_dir
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.data_dir.clone());
    let root = class_root.join("training-jobs");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn copy_file_if_exists(src: &str, dest: &PathBuf) -> Result<bool, String> {
    let src_path = PathBuf::from(src.trim());
    if !src_path.exists() || !src_path.is_file() {
        return Ok(false);
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src_path, dest).map_err(|e| {
        format!(
            "Не удалось скопировать `{}` в `{}`: {e}",
            src_path.display(),
            dest.display()
        )
    })?;
    Ok(true)
}

fn copy_dir_recursive(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    if !src.exists() || !src.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if src_path.is_file() {
            std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn write_json_pretty(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        path,
        serde_json::to_string_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn build_exported_index_html(goal: &str, html_code: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{}</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
{}
    <script src="./script.js"></script>
  </body>
</html>
"#,
        goal.replace('<', "&lt;").replace('>', "&gt;"),
        html_code
    )
}

pub fn export_ai_studio_project(
    req: ExportAiStudioProjectRequest,
) -> Result<ExportAiStudioProjectResponse, String> {
    let email = req.student_email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email ученика.".into());
    }
    let project_type = req.project_type.trim().to_string();
    if ai_studio_project_type_label(&project_type).is_none() {
        return Err("Выберите тип проекта AI Studio.".into());
    }
    let goal = req.goal.trim().to_string();
    if goal.is_empty() {
        return Err("Опишите цель проекта перед экспортом.".into());
    }
    let html_code = req.html_code.trim().to_string();
    if html_code.is_empty() {
        return Err("Для экспорта нужен HTML проекта.".into());
    }

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, &email)?;
    let root = ai_studio_project_export_root()?;
    let stamp = timestamp_unix_secs_local()?;
    let project_token = req
        .project_id
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(sanitize_filename_token)
        .unwrap_or_else(|| "project".to_string());
    let export_dir = root.join(format!(
        "{}-{}-{}",
        sanitize_filename_token(&email),
        project_token,
        stamp
    ));
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let index_html_path = export_dir.join("index.html");
    let style_css_path = export_dir.join("style.css");
    let script_js_path = export_dir.join("script.js");
    let readme_path = export_dir.join("README.txt");

    std::fs::write(&index_html_path, build_exported_index_html(&goal, &html_code))
        .map_err(|e| e.to_string())?;
    std::fs::write(&style_css_path, req.css_code).map_err(|e| e.to_string())?;
    std::fs::write(&script_js_path, req.js_code).map_err(|e| e.to_string())?;

    let model_name = req
        .model_name
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .unwrap_or("не указана");
    let constraints = req
        .constraints
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .unwrap_or("без дополнительных ограничений");
    let readme = format!(
        "AI Studio project\n\nУченик: {email}\nЦель: {goal}\nТип проекта: {project_type}\nМодель: {model_name}\nОграничения: {constraints}\n\nКак открыть проект:\n1. Открой файл index.html в браузере.\n2. Файлы style.css и script.js должны лежать рядом с index.html.\n\nЗапрос, по которому собран проект:\n{}\n",
        req.generation_request.trim()
    );
    std::fs::write(&readme_path, readme).map_err(|e| e.to_string())?;

    append_student_artifact_kind(
        &conn,
        &student_id,
        &email,
        StudentArtifactKind::AiStudioVersionSaved,
        "AI Studio: проект экспортирован",
        &format!("Проект сохранён в папку {}.", export_dir.display()),
    )?;

    Ok(ExportAiStudioProjectResponse {
        export_dir: export_dir.to_string_lossy().to_string(),
        index_html_path: index_html_path.to_string_lossy().to_string(),
        style_css_path: style_css_path.to_string_lossy().to_string(),
        script_js_path: script_js_path.to_string_lossy().to_string(),
        readme_path: readme_path.to_string_lossy().to_string(),
    })
}

pub fn prepare_student_training_job(
    student_email: String,
    base_hf_model: Option<String>,
    ollama_base_model: Option<String>,
    launch_now: bool,
) -> Result<PrepareStudentTrainingJobResponse, String> {
    let email = student_email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email ученика.".into());
    }

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, &email)?;
    drop(conn);

    let dataset_export = export_student_training_dataset(ExportStudentTrainingDatasetRequest {
        student_email: Some(email.clone()),
        student_id: None,
    })?;

    let stamp = timestamp_unix_secs_local()?;
    let token = sanitize_filename_token(&email);
    let job_dir = student_training_jobs_root()?.join(format!("{token}-{stamp}"));
    let scripts_dir = job_dir.join("scripts");
    let data_dir = job_dir.join("data");
    let output_dir = job_dir.join("output");
    let adapter_path = output_dir.join("adapter");
    let training_summary_path = output_dir.join("training_summary.json");
    std::fs::create_dir_all(&scripts_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let dataset_dest = data_dir.join("training_dataset.jsonl");
    std::fs::copy(&dataset_export.dataset_jsonl_path, &dataset_dest).map_err(|e| {
        format!(
            "Не удалось скопировать набор данных `{}`: {e}",
            dataset_export.dataset_jsonl_path
        )
    })?;
    let metadata_dest = data_dir.join("metadata.json");
    let _ = copy_file_if_exists(&dataset_export.metadata_json_path, &metadata_dest)?;

    std::fs::write(scripts_dir.join("train_lora_student.py"), TRAIN_LORA_STUDENT_SCRIPT)
        .map_err(|e| e.to_string())?;
    std::fs::write(
        scripts_dir.join("register_ollama_adapter.py"),
        REGISTER_OLLAMA_ADAPTER_SCRIPT,
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(scripts_dir.join("requirements.txt"), TRAINING_REQUIREMENTS)
        .map_err(|e| e.to_string())?;

    let hf_model = base_hf_model
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .unwrap_or_else(|| "Qwen/Qwen2.5-1.5B-Instruct".to_string());
    let ollama_model = ollama_base_model
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .unwrap_or_else(|| "qwen3:8b".to_string());
    let ollama_alias = format!("student-{}-my-ai", sanitize_filename_token(&email).replace('.', "_"));
    let run_training_script_path = job_dir.join("run_training.ps1");
    let run_register_script_path = job_dir.join("run_register.ps1");
    let readme_path = job_dir.join("README.txt");

    let run_training = format!(
        r#"$ErrorActionPreference = "Stop"
Set-Location -LiteralPath "{job_dir}"
if (-not (Test-Path ".venv")) {{
  python -m venv .venv
}}
& ".\.venv\Scripts\python.exe" -m pip install -r ".\scripts\requirements.txt"
& ".\.venv\Scripts\python.exe" ".\scripts\train_lora_student.py" `
  --dataset-path "{dataset_path}" `
  --base-model "{hf_model}" `
  --output-dir "{output_dir}" `
  --epochs 1 `
  --max-steps 80 `
  --batch-size 1 `
  --grad-accum 4 `
  --max-seq-len 768
"TRAINING_DONE" | Out-File -FilePath ".\TRAINING_DONE.txt" -Encoding utf8
"#,
        job_dir = job_dir.display(),
        dataset_path = dataset_dest.display(),
        hf_model = hf_model,
        output_dir = output_dir.display(),
    );
    std::fs::write(&run_training_script_path, run_training).map_err(|e| e.to_string())?;

    let run_register = format!(
        r#"$ErrorActionPreference = "Stop"
Set-Location -LiteralPath "{job_dir}"
& ".\.venv\Scripts\python.exe" ".\scripts\register_ollama_adapter.py" `
  --base-model "{ollama_model}" `
  --adapter-path "{adapter_path}" `
  --student-id "{student_id}" `
  --student-email "{email}" `
  --alias "{ollama_alias}" `
  --output-dir "{registration_dir}" `
  --training-summary-path "{summary_path}"
"REGISTER_DONE" | Out-File -FilePath ".\REGISTER_DONE.txt" -Encoding utf8
"#,
        job_dir = job_dir.display(),
        ollama_model = ollama_model,
        adapter_path = adapter_path.display(),
        student_id = student_id,
        email = email,
        ollama_alias = ollama_alias,
        registration_dir = output_dir.join("ollama-registration").display(),
        summary_path = training_summary_path.display(),
    );
    std::fs::write(&run_register_script_path, run_register).map_err(|e| e.to_string())?;

    let readme = format!(
        "Training job: Мой ИИ\n\nУченик: {email}\n\nЧто делать:\n1. Запусти run_training.ps1.\n2. Дождись папки output/adapter и файла output/training_summary.json.\n3. Если нужно создать Ollama-модель вручную, запусти run_register.ps1.\n4. Вернись в приложение и подключи путь:\n   {adapter_path}\n\nДанные обучения:\n{dataset_path}\n\nВажно: первая установка Python-пакетов и загрузка base model могут занять время. Если интернет плохой, подготовь .venv и модель заранее.\n",
        email = email,
        adapter_path = adapter_path.display(),
        dataset_path = dataset_dest.display(),
    );
    std::fs::write(&readme_path, readme).map_err(|e| e.to_string())?;

    let metadata = json!({
        "studentEmail": email,
        "studentId": student_id,
        "datasetJsonlPath": dataset_dest,
        "datasetRows": dataset_export.total_rows,
        "outputDir": output_dir,
        "adapterPath": adapter_path,
        "trainingSummaryPath": training_summary_path,
        "baseHfModel": hf_model,
        "ollamaBaseModel": ollama_model,
        "ollamaAlias": ollama_alias,
        "createdAtUnix": stamp,
    });
    write_json_pretty(&job_dir.join("job_metadata.json"), &metadata)?;

    let mut warnings = Vec::new();
    let mut launched = false;
    if launch_now {
        #[cfg(target_os = "windows")]
        {
            match Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    &run_training_script_path.to_string_lossy(),
                ])
                .current_dir(&job_dir)
                .spawn()
            {
                Ok(_) => {
                    launched = true;
                }
                Err(e) => warnings.push(format!(
                    "Job подготовлен, но автоматический запуск не удался: {e}"
                )),
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            warnings.push("Автоматический запуск сейчас поддержан только для Windows. Запустите run_training.ps1 вручную.".to_string());
        }
    }

    Ok(PrepareStudentTrainingJobResponse {
        job_dir: job_dir.to_string_lossy().to_string(),
        dataset_jsonl_path: dataset_dest.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        adapter_path: adapter_path.to_string_lossy().to_string(),
        training_summary_path: training_summary_path.to_string_lossy().to_string(),
        run_training_script_path: run_training_script_path.to_string_lossy().to_string(),
        run_register_script_path: run_register_script_path.to_string_lossy().to_string(),
        readme_path: readme_path.to_string_lossy().to_string(),
        base_hf_model: hf_model,
        ollama_base_model: ollama_model,
        ollama_alias,
        launched,
        warnings,
    })
}

pub fn export_student_ai_package(
    student_email: String,
) -> Result<ExportStudentAiPackageResponse, String> {
    let email = student_email.trim().to_string();
    if email.is_empty() {
        return Err("Укажите email ученика.".into());
    }

    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, &email)?;
    drop(conn);

    let stamp = timestamp_unix_secs_local()?;
    let export_root = student_ai_package_export_root()?;
    let export_dir = export_root.join(format!(
        "{}-my-ai-{}",
        sanitize_filename_token(&email),
        stamp
    ));
    let data_dir = export_dir.join("data");
    let model_dir = export_dir.join("model");
    let project_dir = export_dir.join("project");
    let checks_dir = export_dir.join("checks");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&model_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&checks_dir).map_err(|e| e.to_string())?;

    let mut warnings: Vec<String> = Vec::new();

    let dataset_export = match export_student_training_dataset(ExportStudentTrainingDatasetRequest {
        student_email: Some(email.clone()),
        student_id: None,
    }) {
        Ok(x) => Some(x),
        Err(e) => {
            warnings.push(format!("Данные обучения не экспортированы: {e}"));
            None
        }
    };

    let mut dataset_jsonl_path: Option<String> = None;
    let mut dataset_metadata_path: Option<String> = None;
    if let Some(exported) = dataset_export.as_ref() {
        let dataset_dest = data_dir.join("training_dataset.jsonl");
        let metadata_dest = data_dir.join("metadata.json");
        if copy_file_if_exists(&exported.dataset_jsonl_path, &dataset_dest)? {
            dataset_jsonl_path = Some(dataset_dest.to_string_lossy().to_string());
        } else {
            warnings.push("Файл training_dataset.jsonl не найден после подготовки данных.".to_string());
        }
        if copy_file_if_exists(&exported.metadata_json_path, &metadata_dest)? {
            dataset_metadata_path = Some(metadata_dest.to_string_lossy().to_string());
        } else {
            warnings.push("Файл metadata.json не найден после подготовки данных.".to_string());
        }
    }

    let status = get_student_training_pipeline_status(email.clone()).ok();
    let compare_history = list_compare_run_history(email.clone(), Some(40)).unwrap_or_default();
    let benchmark_history = list_benchmark_run_history(email.clone(), Some(40)).unwrap_or_default();
    let project_history = list_ai_studio_project_versions(email.clone(), Some(1)).unwrap_or_default();

    write_json_pretty(
        &checks_dir.join("compare_history.json"),
        &serde_json::to_value(&compare_history).map_err(|e| e.to_string())?,
    )?;
    write_json_pretty(
        &checks_dir.join("arena_history.json"),
        &serde_json::to_value(&benchmark_history).map_err(|e| e.to_string())?,
    )?;

    let latest_project = project_history.first();
    let mut project_index_html_path: Option<String> = None;
    if let Some(project) = latest_project {
        let index_path = project_dir.join("index.html");
        std::fs::write(
            &index_path,
            build_exported_index_html(&project.goal, &project.html_code),
        )
        .map_err(|e| e.to_string())?;
        std::fs::write(project_dir.join("style.css"), &project.css_code).map_err(|e| e.to_string())?;
        std::fs::write(project_dir.join("script.js"), &project.js_code).map_err(|e| e.to_string())?;
        std::fs::write(
            project_dir.join("README.txt"),
            format!(
                "AI Studio project\n\nОткрой index.html в браузере.\n\nЦель: {}\nМодель: {}\n",
                project.goal,
                project.model_name.as_deref().unwrap_or("не указана")
            ),
        )
        .map_err(|e| e.to_string())?;
        project_index_html_path = Some(index_path.to_string_lossy().to_string());
    } else {
        warnings.push("В AI Studio пока нет сохранённого проекта.".to_string());
    }

    let conn = open_read_write()?;
    ensure_student_ollama_model_ref_table(&conn)?;
    let model_ref = conn
        .query_row(
            r#"SELECT "baseModel", "adapterPath", "ollamaModelAlias", "modelfilePath", "trainingSummaryPath"
               FROM "StudentOllamaModelRef"
               WHERE "studentId" = ?1"#,
            params![student_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .ok();

    let mut copied_modelfile = false;
    let mut copied_adapter = false;
    let mut copied_summary = false;
    if let Some((_, adapter_path, _, modelfile_path, summary_path)) = model_ref.as_ref() {
        copied_modelfile = copy_file_if_exists(modelfile_path, &model_dir.join("Modelfile"))?;
        let adapter_src = PathBuf::from(adapter_path);
        if adapter_src.is_file() {
            let file_name = adapter_src
                .file_name()
                .map(|x| x.to_string_lossy().to_string())
                .unwrap_or_else(|| "adapter.bin".to_string());
            copied_adapter = copy_file_if_exists(adapter_path, &model_dir.join("adapter").join(file_name))?;
        } else if adapter_src.is_dir() {
            copy_dir_recursive(&adapter_src, &model_dir.join("adapter"))?;
            copied_adapter = true;
        }
        if let Some(summary) = summary_path.as_deref() {
            copied_summary = copy_file_if_exists(summary, &model_dir.join("training_summary.json"))?;
        }
    }
    if model_ref.is_none() {
        warnings.push("Обученная модель пока не подключена: в пакете будут данные и проверки, но не adapter.".to_string());
    } else {
        if !copied_modelfile {
            warnings.push("Modelfile модели не найден или ещё не создан.".to_string());
        }
        if !copied_adapter {
            warnings.push("Adapter/файлы обученной модели не найдены в указанном пути.".to_string());
        }
        if !copied_summary {
            warnings.push("training_summary.json не найден. Это не мешает открыть проект, но модельный отчёт неполный.".to_string());
        }
    }

    let model_card_path = model_dir.join("model_card.json");
    let model_card = json!({
        "studentEmail": email,
        "studentId": student_id,
        "status": status,
        "registeredModel": model_ref.as_ref().map(|(base_model, adapter_path, alias, modelfile_path, summary_path)| {
            json!({
                "baseModel": base_model,
                "adapterPath": adapter_path,
                "ollamaModelAlias": alias,
                "modelfilePath": modelfile_path,
                "trainingSummaryPath": summary_path,
            })
        }),
        "exportedAtUnix": stamp,
    });
    write_json_pretty(&model_card_path, &model_card)?;

    let package_metadata_path = export_dir.join("package_metadata.json");
    let package_metadata = json!({
        "studentEmail": email,
        "exportedAtUnix": stamp,
        "dataset": {
            "trainingDatasetJsonl": dataset_jsonl_path.clone(),
            "metadataJson": dataset_metadata_path.clone(),
        },
        "checks": {
            "compareHistory": checks_dir.join("compare_history.json").to_string_lossy(),
            "arenaHistory": checks_dir.join("arena_history.json").to_string_lossy(),
            "compareCount": compare_history.len(),
            "arenaCount": benchmark_history.len(),
        },
        "project": {
            "indexHtml": project_index_html_path.clone(),
        },
        "warnings": warnings.clone(),
    });
    write_json_pretty(&package_metadata_path, &package_metadata)?;

    let readme_path = export_dir.join("README.txt");
    let model_alias = model_ref
        .as_ref()
        .map(|(_, _, alias, _, _)| alias.as_str())
        .unwrap_or("my-ai-model");
    let readme = format!(
        "Мой ИИ пакет\n\nУченик: {email}\n\nЧто внутри:\n- data/training_dataset.jsonl — примеры обучения\n- model/ — файлы модели, если она уже обучена и подключена\n- checks/ — история Compare и Arena\n- project/index.html — проект из AI Studio, если он сохранён\n\nКак открыть проект:\nОткрой project/index.html в браузере.\n\nКак подключить модель дома, если в папке model есть Modelfile и adapter:\n1. Установи Ollama.\n2. Открой терминал в этой папке.\n3. Выполни: ollama create {model_alias} -f model/Modelfile\n4. Выполни: ollama run {model_alias}\n\nЕсли adapter отсутствует, значит в этом пакете сохранены данные и проверки, но финальная обученная модель ещё не была создана на этом компьютере.\n"
    );
    std::fs::write(&readme_path, readme).map_err(|e| e.to_string())?;

    Ok(ExportStudentAiPackageResponse {
        export_dir: export_dir.to_string_lossy().to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        model_dir: model_dir.to_string_lossy().to_string(),
        project_dir: project_dir.to_string_lossy().to_string(),
        checks_dir: checks_dir.to_string_lossy().to_string(),
        readme_path: readme_path.to_string_lossy().to_string(),
        package_metadata_path: package_metadata_path.to_string_lossy().to_string(),
        dataset_jsonl_path,
        dataset_metadata_path,
        project_index_html_path,
        model_card_path: model_card_path.to_string_lossy().to_string(),
        warnings,
    })
}

pub fn list_ai_studio_project_versions(
    student_email: String,
    limit: Option<i64>,
) -> Result<Vec<AiStudioProjectVersionView>, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    ensure_ai_studio_project_versions_table(&conn)?;
    let student_id = student_id_for_email(&conn, email)?;
    let take = limit.unwrap_or(12).clamp(1, 40);

    let mut stmt = conn
        .prepare(
            r#"SELECT "id", "projectId", "projectType", "goal", "constraintsText", "generationRequest", "htmlCode", "cssCode", "jsCode", "modelName", "createdAt"
               FROM "StudentAiStudioProjectVersion"
               WHERE "studentId" = ?1
               ORDER BY "createdAt" DESC, "id" DESC
               LIMIT ?2"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![student_id.as_str(), take], |row| {
            Ok(AiStudioProjectVersionView {
                version_id: row.get(0)?,
                project_id: row.get(1)?,
                project_type: row.get(2)?,
                goal: row.get(3)?,
                constraints: row.get(4)?,
                generation_request: row.get(5)?,
                html_code: row.get(6)?,
                css_code: row.get(7)?,
                js_code: row.get(8)?,
                model_name: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Список других учеников с зарегистрированным Ollama-alias (локальная БД).
pub fn list_arena_student_opponents(student_email: String) -> Result<Vec<ArenaStudentOpponentRow>, String> {
    let email = student_email.trim().to_lowercase();
    if email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    let conn = open_read_write()?;
    ensure_student_ollama_model_ref_table(&conn)?;
    ensure_student_model_usage_table(&conn)?;
    let mut stmt = conn
        .prepare(
            r#"SELECT "studentEmail", "ollamaModelAlias"
               FROM "StudentOllamaModelRef" ref
               LEFT JOIN "StudentModelUsagePreference" pref
                 ON pref."studentId" = ref."studentId"
               WHERE LOWER(TRIM(ref."studentEmail")) != ?1
                 AND COALESCE(pref."useTrainedModel", 1) != 0
               ORDER BY "updatedAt" DESC"#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![email], |row| {
            Ok(ArenaStudentOpponentRow {
                student_email: row.get::<_, String>(0)?,
                ollama_model_alias: row.get::<_, String>(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<ArenaStudentOpponentRow> = Vec::new();
    for r in rows {
        let row = r.map_err(|e| e.to_string())?;
        let em = row.student_email.trim().to_string();
        let al = row.ollama_model_alias.trim().to_string();
        if em.is_empty() || al.is_empty() {
            continue;
        }
        out.push(ArenaStudentOpponentRow {
            student_email: em,
            ollama_model_alias: al,
        });
    }
    Ok(out)
}

enum PvpStudentModelReadiness {
    Ready { alias: String, system_prompt: String },
    MissingRegisteredModel,
    TrainedModelDisabled,
}

/// Alias + полный system prompt для честного PvP-матча trained-vs-trained.
fn student_pvp_ready_ollama_bundle(student_email: &str) -> Result<PvpStudentModelReadiness, String> {
    let email = student_email.trim();
    if email.is_empty() {
        return Err("Укажите email ученика.".into());
    }
    let conn = open_read_write()?;
    let student_id = student_id_for_email(&conn, email)?;
    let alias = match get_active_student_ollama_model_alias(&conn, &student_id)? {
        Some(a) if !a.trim().is_empty() => a.trim().to_string(),
        _ => return Ok(PvpStudentModelReadiness::MissingRegisteredModel),
    };
    if !student_prefers_trained_model(&conn, &student_id)? {
        return Ok(PvpStudentModelReadiness::TrainedModelDisabled);
    }

    let ctx = get_chat_training_context(email.to_string())?;
    let training_block = build_student_training_context_for_ollama(&conn, &student_id)?;
    let system_prompt = if !training_block.trim().is_empty() {
        format!(
            "{}\n\n{}",
            chat_training_ollama_system_prompt(&ctx),
            training_block
        )
    } else {
        chat_training_ollama_system_prompt(&ctx)
    };
    Ok(PvpStudentModelReadiness::Ready { alias, system_prompt })
}

fn pvp_indicators(self_text: &str, opp_text: &str) -> Vec<String> {
    let mut indicators: Vec<String> = Vec::new();
    let self_w = split_words_count(self_text);
    let opp_w = split_words_count(opp_text);
    if has_structure_markers(self_text) && !has_structure_markers(opp_text) {
        indicators.push("твой ответ структурнее".to_string());
    } else if has_structure_markers(opp_text) && !has_structure_markers(self_text) {
        indicators.push("ответ соперника структурнее".to_string());
    }
    if self_w > opp_w + 8 {
        indicators.push("твой ответ развёрнутее".to_string());
    } else if opp_w > self_w + 8 {
        indicators.push("ответ соперника развёрнутее".to_string());
    }
    if has_supportive_markers(self_text) && !has_supportive_markers(opp_text) {
        indicators.push("твой тон мягче / поддерживающее".to_string());
    } else if has_supportive_markers(opp_text) && !has_supportive_markers(self_text) {
        indicators.push("тон соперника мягче".to_string());
    }
    if indicators.is_empty() {
        indicators.push("оба ответа близки по стилю — решают детали миссии".to_string());
    }
    indicators
}

pub async fn compare_student_trained_vs_student(
    req: CompareStudentVsStudentRequest,
) -> Result<StudentVsStudentDuelResponse, String> {
    let self_email = req.self_student_email.trim().to_string();
    let opp_email = req.opponent_student_email.trim().to_string();
    let prompt = req.prompt.trim().to_string();
    if self_email.is_empty() {
        return Err("Укажите email ученика (войдите в аккаунт)".into());
    }
    if opp_email.is_empty() {
        return Err("Выберите соперника.".into());
    }
    if self_email.to_lowercase() == opp_email.to_lowercase() {
        return Err("Нельзя драться сам с собой — выбери другого ученика.".into());
    }
    if prompt.is_empty() {
        return Err("Введите промпт миссии.".into());
    }

    let self_bundle = student_pvp_ready_ollama_bundle(&self_email)?;
    let opp_bundle = student_pvp_ready_ollama_bundle(&opp_email)?;

    let self_available = matches!(self_bundle, PvpStudentModelReadiness::Ready { .. });
    let opponent_available = matches!(opp_bundle, PvpStudentModelReadiness::Ready { .. });

    if !self_available || !opponent_available {
        let explanation = match (&self_bundle, &opp_bundle) {
            (
                PvpStudentModelReadiness::MissingRegisteredModel,
                PvpStudentModelReadiness::MissingRegisteredModel,
            ) => "У тебя и у соперника нет зарегистрированной обученной модели в Ollama. Зарегистрируйте alias в управлении тренировкой.".to_string(),
            (
                PvpStudentModelReadiness::TrainedModelDisabled,
                PvpStudentModelReadiness::TrainedModelDisabled,
            ) => "У тебя и у соперника обученная модель выключена в Training Manager. Для честного PvP оба студента должны явно включить trained model.".to_string(),
            (PvpStudentModelReadiness::MissingRegisteredModel, _) => {
                "У тебя нет зарегистрированной обученной модели — PvP недоступен без реальной trained-model.".to_string()
            }
            (PvpStudentModelReadiness::TrainedModelDisabled, _) => {
                "У тебя обученная модель выключена в Training Manager. Включи trained model, чтобы выйти на Arena PvP.".to_string()
            }
            (_, PvpStudentModelReadiness::MissingRegisteredModel) => {
                "У соперника нет зарегистрированной обученной модели — выбери другого или дождись регистрации.".to_string()
            }
            (_, PvpStudentModelReadiness::TrainedModelDisabled) => {
                "У соперника обученная модель выключена в Training Manager. Для PvP нужен соперник с явно активной trained model.".to_string()
            }
            _ => "Не удалось собрать честный trained-vs-trained матч.".to_string(),
        };
        return Ok(StudentVsStudentDuelResponse {
            prompt: prompt.clone(),
            self_student_email: self_email.clone(),
            opponent_student_email: opp_email.clone(),
            self_model_alias: None,
            opponent_model_alias: None,
            self_available,
            opponent_available,
            self_response: None,
            opponent_response: None,
            indicators: Vec::new(),
            explanation,
        });
    }

    let (self_alias, self_system) = match self_bundle {
        PvpStudentModelReadiness::Ready { alias, system_prompt } => (alias, system_prompt),
        _ => return Err("Внутренняя ошибка: нет PvP-ready bundle для твоей модели.".to_string()),
    };
    let (opp_alias, opp_system) = match opp_bundle {
        PvpStudentModelReadiness::Ready { alias, system_prompt } => (alias, system_prompt),
        _ => return Err("Внутренняя ошибка: нет PvP-ready bundle для соперника.".to_string()),
    };

    if normalize_ollama_alias(&self_alias) == normalize_ollama_alias(&opp_alias) {
        return Ok(StudentVsStudentDuelResponse {
            prompt,
            self_student_email: self_email,
            opponent_student_email: opp_email,
            self_model_alias: Some(self_alias),
            opponent_model_alias: Some(opp_alias),
            self_available: false,
            opponent_available: false,
            self_response: None,
            opponent_response: None,
            indicators: Vec::new(),
            explanation: "Подозрительный матч: у двух студентов указан один и тот же Ollama alias. Arena PvP остановлена, пока модели не будут разведены по уникальным alias.".to_string(),
        });
    }

    let self_gen = ollama::generate_with_ollama(&self_alias, self_system, prompt.clone()).await;
    let opp_gen = ollama::generate_with_ollama(&opp_alias, opp_system, prompt.clone()).await;

    let self_response = Some(match self_gen {
        Ok(x) => {
            let t = x.trim();
            if t.is_empty() {
                "Пустой ответ твоей модели.".to_string()
            } else {
                t.to_string()
            }
        }
        Err(_) => "ИИ временно недоступен. Проверь Ollama.".to_string(),
    });
    let opponent_response = Some(match opp_gen {
        Ok(x) => {
            let t = x.trim();
            if t.is_empty() {
                "Пустой ответ модели соперника.".to_string()
            } else {
                t.to_string()
            }
        }
        Err(_) => "ИИ соперника временно недоступен. Проверь Ollama.".to_string(),
    });

    let indicators = pvp_indicators(
        self_response.as_deref().unwrap_or(""),
        opponent_response.as_deref().unwrap_or(""),
    );

    let explanation =
        "Две обученные student-модели получили один промпт миссии; каждая — со своим контекстом тренировки и LoRA."
            .to_string();

    Ok(StudentVsStudentDuelResponse {
        prompt,
        self_student_email: self_email,
        opponent_student_email: opp_email,
        self_model_alias: Some(self_alias),
        opponent_model_alias: Some(opp_alias),
        self_available: true,
        opponent_available: true,
        self_response,
        opponent_response,
        indicators,
        explanation,
    })
}
