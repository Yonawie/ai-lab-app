# Команды для n8n Execute Command

Скопируй эти команды в отдельные Execute Command nodes.

## 1. Git pull

```bash
cd /opt/ai-lab-app && git pull --ff-only
```

## 2. Install

```bash
cd /opt/ai-lab-app && pnpm install --frozen-lockfile
```

## 3. Rust check

```bash
cd /opt/ai-lab-app && cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 4. TypeScript check

```bash
cd /opt/ai-lab-app && npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false
```

## 5. Desktop frontend build

```bash
cd /opt/ai-lab-app && pnpm --filter @ai-lab/desktop build
```

## 6. Full check одним node

```bash
cd /opt/ai-lab-app && git pull --ff-only && pnpm install --frozen-lockfile && cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml && npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false && pnpm --filter @ai-lab/desktop build
```

## Prompt для AI Agent после Execute Command

Передай в AI Agent stdout/stderr предыдущих nodes и попроси:

```text
Проанализируй результат проверки AI Lab.
Если всё прошло — коротко подтверди.
Если есть ошибка — объясни простым русским языком:
1. где ошибка;
2. что она значит;
3. какой минимальный фикс нужен;
4. опасно ли это для завтрашнего пилота.
Не трогай teacher/admin flows.
```
