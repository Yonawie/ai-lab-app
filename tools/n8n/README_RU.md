# Перенос работы над AI Lab в n8n

Эта папка добавляет безопасный контур для n8n: агент сможет не только отвечать в чате, но и запускать проверки проекта через локальный runner.

Важно: n8n на сервере сам по себе не видит файлы на твоём компьютере. Чтобы он реально проверял проект, нужен один из вариантов:

1. **Локальный runner на компьютере с проектом** — лучший вариант для завтра и плохого интернета.
2. GitHub + CI — хороший вариант позже, когда проект будет в репозитории.
3. Полный перенос проекта на сервер — мощно, но дольше и сложнее, особенно для Tauri/Desktop.

Сейчас подготовлен вариант 1.

## Что уже готово

- `ai-lab-runner.js` — локальный HTTP-runner с безопасным списком команд.
- `AI_AGENT_SYSTEM_PROMPT_RU.md` — системный prompt для n8n AI Agent.
- `workflow-outline.json` — схема, какие nodes добавить в n8n.

Runner не выполняет произвольные команды. Он разрешает только:

- `health`
- `rust-check`
- `desktop-typecheck`
- `desktop-build`
- `all-checks`

## Как запустить runner

В PowerShell из корня проекта:

```powershell
$env:AI_LAB_RUNNER_TOKEN="придумай-секретный-токен"
node tools/n8n/ai-lab-runner.js
```

Проверка локально:

```powershell
$headers = @{ Authorization = "Bearer придумай-секретный-токен" }
$body = @{ task = "health" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/run" -Headers $headers -Body $body -ContentType "application/json"
```

Если n8n стоит на другом сервере, ему нужен доступ к runner. Для локального класса лучше держать n8n и проект на одном компьютере или использовать безопасный tunnel/VPN. Не открывай runner в интернет без токена и firewall.

## Как подключить в n8n

В твоём workflow уже есть:

- `When chat message received`
- `AI Agent`
- `OpenRouter Chat Model`

Нужно добавить tool к `AI Agent`.

### Node 1: HTTP Request Tool

Добавь к AI Agent инструмент HTTP Request.

Настройки:

- Name: `ai_lab_runner`
- Method: `POST`
- URL: `http://127.0.0.1:8787/run`
- Authentication/Header:
  - Header name: `Authorization`
  - Header value: `Bearer твой-токен`
- Body Content Type: JSON
- Body:

```json
{
  "task": "{{ $fromAI('task', 'Validation task to run: health, rust-check, desktop-typecheck, desktop-build, all-checks') }}"
}
```

### AI Agent system prompt

Скопируй содержимое файла:

```text
tools/n8n/AI_AGENT_SYSTEM_PROMPT_RU.md
```

и вставь в System Message / Instructions у AI Agent.

## Как пользоваться

В n8n Chat можно писать:

```text
Проверь проект полностью.
```

Агент должен вызвать:

```json
{ "task": "all-checks" }
```

Можно отдельно:

```text
Проверь только TypeScript.
```

Агент должен вызвать:

```json
{ "task": "desktop-typecheck" }
```

## Что n8n пока НЕ делает

Сейчас n8n не редактирует код автоматически. Это специально: завтра перед классом безопаснее иметь агента-проверяющего, а не агента, который может случайно переписать приложение.

Следующий уровень, если захочешь:

- добавить GitHub connector;
- сделать workflow “создать issue / PR”;
- добавить отдельный patch-review шаг;
- разрешить runner только на подготовленные patch-файлы, а не на произвольный shell.

## Рекомендуемый режим на завтра

1. Ты работаешь в Cursor/Codex.
2. n8n Agent проверяет сборку и помогает с отчётами.
3. Перед классом запускаешь `all-checks`.
4. Для класса используешь локальную базу `C:\AI-Lab-Class\data\ai-lab.sqlite`.
5. После занятия экспортируешь `my-ai-packages` для учеников.
