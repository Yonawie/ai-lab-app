# Серверный AI Agent как главный разработчик проекта

Цель: основную работу над AI Lab делает AI Agent в n8n на VPS, а Windows/Codex используется как контрольная станция для desktop-проверки, локальной модели, Ollama и classroom-сценария.

## Правильная архитектура

```text
GitHub repository
        ↓
VPS /opt/ai-lab-app
        ↓
n8n AI Agent
        ↓
создаёт branch → правит код → запускает проверки → делает commit/push
        ↓
Codex/Windows
        ↓
pull branch → desktop/Tauri/Ollama/classroom QA → merge или правки
```

## Почему так лучше

- n8n-agent может работать постоянно на сервере.
- Все изменения проходят через Git, их можно откатить.
- Codex на Windows проверяет то, что VPS нормально не проверит: desktop app, Tauri window, локальную базу, Ollama, обучение моделей.
- Teacher/admin flows защищены правилом и ревью.

## Что должен уметь n8n-agent

Минимальный набор:

1. Принять задачу в чате.
2. Сделать `git pull`.
3. Создать новую ветку.
4. Проанализировать файлы.
5. Внести изменения.
6. Запустить проверки.
7. Если проверки прошли — сделать commit и push.
8. Если проверки упали — объяснить ошибку и не пушить сломанный код в `main`.

## Важное правило

AI Agent не должен работать прямо в `main`.

Правильно:

```bash
git checkout -b ai-agent/my-task-name
```

Плохо:

```bash
git checkout main
# и сразу менять main
```

## Роли

### n8n AI Agent

Главная работа:

- student-side product improvements;
- тексты;
- UX polish;
- React/Tauri клиентские изменения;
- Rust backend changes только если понятен риск;
- подготовка экспортов, training jobs, read models;
- запуск Linux-проверок.

### Codex на Windows

Контроль:

- запуск desktop app;
- регистрация/логин глазами пользователя;
- проверка Tauri commands в реальном приложении;
- проверка Ollama;
- проверка локальной базы `C:\AI-Lab-Class`;
- финальная сборка/пилотная QA.

## Команды для серверного агента

Рабочая папка:

```bash
cd /opt/ai-lab-app
```

Обновить main:

```bash
git checkout main && git pull --ff-only
```

Создать ветку:

```bash
git checkout -b ai-agent/SHORT_TASK_NAME
```

Проверки:

```bash
pnpm install --frozen-lockfile
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false
pnpm --filter @ai-lab/desktop build
```

Коммит:

```bash
git status --short
git add .
git commit -m "Describe change"
git push -u origin ai-agent/SHORT_TASK_NAME
```

## Что нельзя давать агенту без контроля

Не разрешать автоматически:

- `git reset --hard`
- `git clean -fdx`
- `rm -rf`
- force push
- прямой push в `main`
- изменение `.env`
- удаление базы данных
- изменение teacher/admin flows без отдельного разрешения

## Рекомендуемый n8n workflow

```text
Chat Trigger
→ AI Agent: понять задачу и составить короткий план
→ Execute Command: git checkout main && git pull --ff-only
→ Execute Command: git checkout -b ai-agent/<task>
→ AI Agent: определить файлы для изменения
→ Execute Command / Code node: применить patch
→ Execute Command: cargo check
→ Execute Command: TypeScript check
→ Execute Command: desktop build
→ IF checks passed
    → Execute Command: git add . && git commit && git push
    → AI Agent: отчёт и ссылка на branch
→ IF checks failed
    → AI Agent: объяснить ошибку и предложить исправление
```

## Практичный режим

Для начала не давай агенту полный автоматический merge. Пусть он пушит branch.

Ты потом:

```powershell
git fetch
git checkout ai-agent/SHORT_TASK_NAME
pnpm --filter @ai-lab/desktop tauri:dev
```

Проверяешь приложение на Windows и только потом merge.

## Что добавить позже

- GitHub Pull Request node.
- Telegram/Email уведомление “ветка готова”.
- Автоматический changelog.
- Windows runner для Tauri build.
- Отдельный workflow “pilot release candidate”.
