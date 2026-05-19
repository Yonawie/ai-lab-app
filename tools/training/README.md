# Local LoRA Training (Phase 2B/2C)

This folder contains a minimal local training pipeline for one student dataset export.

It is intentionally standalone:
- no UI integration
- no teacher/admin changes
- no automatic Ollama reconnect

## Input dataset

Use the `training_dataset.jsonl` file exported in Phase 2A by the backend export command.

Expected rows include:
- `dataset_example`
- `prompt_experiment`
- `chat_training`

## Setup

```bash
cd tools/training
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Run training

```bash
python train_lora_student.py ^
  --dataset-path "C:\path\to\training_dataset.jsonl" ^
  --base-model "Qwen/Qwen2.5-1.5B-Instruct" ^
  --output-dir "C:\path\to\student-lora-output" ^
  --epochs 1
```

Optional:
- `--max-steps 200`
- `--batch-size 2`
- `--grad-accum 4`
- `--max-seq-len 1024`

## Output

The script writes:
- `adapter/` (LoRA adapter + tokenizer files)
- `training_summary.json`

Summary contains:
- base model
- dataset row counts
- epochs/steps and key hyperparameters
- timestamp
- output paths

## Phase 2C: Register adapter in Ollama

### Option A: standalone script

```bash
python register_ollama_adapter.py ^
  --base-model "qwen3:8b" ^
  --adapter-path "C:\path\to\student-lora-output\adapter" ^
  --student-id "student_user_id" ^
  --student-email "student@example.com" ^
  --alias "student-myname-qwen3-lora" ^
  --output-dir "C:\path\to\student-lora-output\ollama-registration" ^
  --training-summary-path "C:\path\to\student-lora-output\training_summary.json"
```

This generates:
- Modelfile with `FROM` + `ADAPTER` (+ optional `SYSTEM`)
- `ollama create <alias> -f <Modelfile>`
- `ollama_registration_metadata.json`

### Option B: backend command (Tauri)

Backend command name:
- `register_student_ollama_model_cmd`

Inputs:
- `student_email` or `student_id`
- `base_model`
- `adapter_path`
- `ollama_model_alias`
- optional `training_summary_path`
- optional `system_prompt`

The backend command:
- generates Modelfile
- runs `ollama create`
- saves metadata in local SQLite table `StudentOllamaModelRef`
- stores active alias for student-specific routing

### Runtime model selection

During student chat generation:
- if a student-specific Ollama alias exists in `StudentOllamaModelRef`, use it
- otherwise fallback to base model `qwen3:8b`

No retraining happens in Phase 2C.

## Notes

- Phase 2B trains and saves a local adapter.
- Phase 2C registers adapter aliases in Ollama and saves model reference metadata.
- Current app UI is unchanged; integration is backend/tooling-only.
