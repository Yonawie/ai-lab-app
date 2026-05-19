# Execute Command nodes для n8n Code Agent

Эти команды нужны, если n8n-agent будет главным разработчиком на VPS.

## 1. Prepare branch

Вариант с переменной `BRANCH_NAME`, которую должен придумать AI Agent:

```bash
cd /opt/ai-lab-app && git checkout main && git pull --ff-only && git checkout -b "$BRANCH_NAME"
```

Пример:

```bash
cd /opt/ai-lab-app && git checkout main && git pull --ff-only && git checkout -b ai-agent/fix-registration
```

## 2. Inspect status

```bash
cd /opt/ai-lab-app && git status --short
```

## 3. Search files

```bash
cd /opt/ai-lab-app && rg -n "$SEARCH_QUERY" apps packages tools
```

## 4. TypeScript check

```bash
cd /opt/ai-lab-app && npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false
```

## 5. Rust check

```bash
cd /opt/ai-lab-app && cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 6. Desktop build

```bash
cd /opt/ai-lab-app && pnpm --filter @ai-lab/desktop build
```

## 7. Full validation

```bash
cd /opt/ai-lab-app && cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml && npx tsc --noEmit -p apps/desktop/tsconfig.json --pretty false && pnpm --filter @ai-lab/desktop build
```

## 8. Commit and push branch

```bash
cd /opt/ai-lab-app && git status --short && git add . && git commit -m "$COMMIT_MESSAGE" && git push -u origin "$(git branch --show-current)"
```

## Команды, которые не давать агенту

Не добавлять как Execute Command:

```bash
git reset --hard
git clean -fdx
rm -rf
git push --force
git push origin main
```

## Безопасный принцип

AI Agent может менять branch. `main` обновляется только через merge после проверки.
