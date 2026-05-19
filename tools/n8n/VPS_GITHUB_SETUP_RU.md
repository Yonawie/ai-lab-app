# GitHub + VPS + n8n для AI Lab

Цель: хранить проект в GitHub, клонировать его на VPS и дать n8n возможность запускать проверки проекта.

## 0. Что важно понимать

n8n не хранит проект “внутри себя”. Проект должен лежать на VPS как обычная папка:

```bash
/opt/ai-lab-app
```

n8n будет запускать команды в этой папке:

```bash
git pull
pnpm install
pnpm build
```

Для desktop/Tauri важно: Linux VPS хорошо подходит для проверки TypeScript/Rust и анализа ошибок, но Windows `.exe` лучше собирать на Windows-компьютере или в Windows CI.

## 1. Создать GitHub-репозиторий

На GitHub:

1. New repository.
2. Name: `ai-lab-app`.
3. Private лучше для текущего проекта.
4. Не добавляй README/gitignore/license через GitHub, если будешь заливать текущую папку.

## 2. Загрузить проект в GitHub

В PowerShell из папки проекта:

```powershell
cd C:\Users\Dasha\OneDrive\Desktop\ai-lab-app
git init
git branch -M main
git status
```

Перед `git add` проверь, что не попадут базы и секреты:

```powershell
git status --ignored
```

Добавить файлы:

```powershell
git add .
git status
git commit -m "Initial AI Lab app"
git remote add origin https://github.com/USERNAME/ai-lab-app.git
git push -u origin main
```

Если GitHub попросит пароль, используй Personal Access Token, а не пароль аккаунта.

## 3. Подготовить VPS

Для Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git curl build-essential pkg-config libssl-dev
```

Node + pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

Tauri/Linux-зависимости для проверки/сборки:

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

## 4. Клонировать проект на VPS

```bash
cd /opt
sudo git clone https://github.com/USERNAME/ai-lab-app.git ai-lab-app
sudo chown -R $USER:$USER /opt/ai-lab-app
cd /opt/ai-lab-app
pnpm install
```

Проверка:

```bash
pnpm --filter @ai-lab/desktop build
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 5. Команды для n8n Execute Command

### Git pull

```bash
cd /opt/ai-lab-app && git pull --ff-only
```

### Install dependencies

```bash
cd /opt/ai-lab-app && pnpm install --frozen-lockfile
```

### TypeScript check

```bash
cd /opt/ai-lab-app && npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false
```

### Rust check

```bash
cd /opt/ai-lab-app && cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

### Frontend build

```bash
cd /opt/ai-lab-app && pnpm --filter @ai-lab/desktop build
```

### Full check

```bash
cd /opt/ai-lab-app && git pull --ff-only && pnpm install --frozen-lockfile && cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml && npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false && pnpm --filter @ai-lab/desktop build
```

## 6. n8n workflow

Минимальная схема:

```text
Manual Trigger
→ Execute Command: git pull --ff-only
→ Execute Command: pnpm install --frozen-lockfile
→ Execute Command: cargo check
→ Execute Command: TypeScript check
→ Execute Command: desktop build
→ AI Agent: объяснить ошибку или подтвердить успех
```

Для AI Agent дай системный prompt из:

```text
tools/n8n/AI_AGENT_SYSTEM_PROMPT_RU.md
```

## 7. Что НЕ заливать в GitHub

Не должны попадать:

- `.env`
- `.env.*`
- `node_modules`
- `apps/desktop/src-tauri/target`
- `*.sqlite`
- `*.sqlite-wal`
- `*.sqlite-shm`
- `C:\AI-Lab-Class`
- `training-jobs`
- `my-ai-packages`
- ученические экспорты
- ключи OpenRouter/OpenAI/GitHub

## 8. Как будет выглядеть рабочий процесс

1. Ты делаешь изменения в Cursor/Codex.
2. Коммитишь и пушишь в GitHub.
3. На VPS n8n запускает `git pull`.
4. n8n запускает проверки.
5. AI Agent читает stdout/stderr и объясняет, что сломалось.
6. Исправления всё равно лучше делать в Cursor/Codex, затем снова push.

Это безопаснее, чем давать агенту на сервере полный доступ на автоматическое редактирование кода.
