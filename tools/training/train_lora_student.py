#!/usr/bin/env python3
"""
Phase 2B: Minimal local LoRA training for one student export.

This script trains a LoRA adapter from Phase 2A `training_dataset.jsonl`.
It does not integrate with Tauri or Ollama automatically.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    TrainingArguments,
)
from trl import SFTTrainer


SUPPORTED_TYPES = {"dataset_example", "prompt_experiment", "chat_training"}


@dataclass
class RowStats:
    total_rows: int = 0
    used_rows: int = 0
    dataset_example_rows: int = 0
    prompt_experiment_rows: int = 0
    chat_training_rows: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a minimal LoRA adapter from one student training_dataset.jsonl",
    )
    parser.add_argument(
        "--dataset-path",
        required=True,
        help="Path to Phase 2A training_dataset.jsonl",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory where adapter + summary are written",
    )
    parser.add_argument(
        "--base-model",
        required=True,
        help="Base HF model id/path (e.g. Qwen/Qwen2.5-1.5B-Instruct)",
    )
    parser.add_argument("--epochs", type=float, default=1.0, help="Training epochs")
    parser.add_argument(
        "--max-steps",
        type=int,
        default=-1,
        help="Optional max steps override (-1 means no override)",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=2e-4,
        help="Learning rate for LoRA fine-tuning",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2,
        help="Per-device train batch size",
    )
    parser.add_argument(
        "--grad-accum",
        type=int,
        default=4,
        help="Gradient accumulation steps",
    )
    parser.add_argument(
        "--max-seq-len",
        type=int,
        default=1024,
        help="Maximum sequence length",
    )
    parser.add_argument(
        "--lora-r",
        type=int,
        default=16,
        help="LoRA rank",
    )
    parser.add_argument(
        "--lora-alpha",
        type=int,
        default=32,
        help="LoRA alpha",
    )
    parser.add_argument(
        "--lora-dropout",
        type=float,
        default=0.05,
        help="LoRA dropout",
    )
    return parser.parse_args()


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def normalize_row(row: dict[str, Any]) -> str | None:
    row_type = _as_text(row.get("type"))
    if row_type not in SUPPORTED_TYPES:
        return None

    instruction = _as_text(row.get("instruction"))
    prompt_input = _as_text(row.get("input"))
    target = _as_text(row.get("target"))

    if not prompt_input or not target:
        return None

    if row_type == "dataset_example":
        if not instruction:
            instruction = "Use the student training example and provide the correct answer."
    elif row_type == "prompt_experiment":
        if not instruction:
            instruction = "Improve the weak prompt response using the student's better pattern."
    elif row_type == "chat_training":
        if not instruction:
            instruction = "Answer as a beginner AI and improve from feedback."

    return (
        f"### Instruction:\n{instruction}\n\n"
        f"### Input:\n{prompt_input}\n\n"
        f"### Response:\n{target}"
    )


def load_training_texts(dataset_path: Path) -> tuple[list[str], RowStats]:
    stats = RowStats()
    texts: list[str] = []

    with dataset_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            stats.total_rows += 1
            row = json.loads(line)
            row_type = _as_text(row.get("type"))
            if row_type == "dataset_example":
                stats.dataset_example_rows += 1
            elif row_type == "prompt_experiment":
                stats.prompt_experiment_rows += 1
            elif row_type == "chat_training":
                stats.chat_training_rows += 1

            normalized = normalize_row(row)
            if normalized is not None:
                texts.append(normalized)
                stats.used_rows += 1

    return texts, stats


def main() -> None:
    args = parse_args()
    dataset_path = Path(args.dataset_path).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    adapter_dir = output_dir / "adapter"
    output_dir.mkdir(parents=True, exist_ok=True)
    adapter_dir.mkdir(parents=True, exist_ok=True)

    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset file not found: {dataset_path}")

    texts, stats = load_training_texts(dataset_path)
    if not texts:
        raise RuntimeError("No valid training rows found in dataset JSONL.")

    dataset = Dataset.from_dict({"text": texts})

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(args.base_model)
    model.config.use_cache = False

    peft_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        target_modules="all-linear",
    )
    model = get_peft_model(model, peft_config)

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.learning_rate,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        logging_steps=10,
        save_steps=100,
        save_total_limit=2,
        bf16=False,
        fp16=False,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False),
        peft_config=peft_config,
        max_seq_length=args.max_seq_len,
        dataset_text_field="text",
    )
    train_result = trainer.train()
    trainer.model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))

    summary = {
        "phase": "2B-lora-local",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "base_model": args.base_model,
        "dataset_path": str(dataset_path),
        "dataset_rows_total": stats.total_rows,
        "dataset_rows_used": stats.used_rows,
        "rows_by_type": {
            "dataset_example": stats.dataset_example_rows,
            "prompt_experiment": stats.prompt_experiment_rows,
            "chat_training": stats.chat_training_rows,
        },
        "training": {
            "epochs": args.epochs,
            "max_steps": args.max_steps,
            "learning_rate": args.learning_rate,
            "batch_size": args.batch_size,
            "gradient_accumulation_steps": args.grad_accum,
            "max_seq_len": args.max_seq_len,
            "lora_r": args.lora_r,
            "lora_alpha": args.lora_alpha,
            "lora_dropout": args.lora_dropout,
        },
        "output": {
            "output_dir": str(output_dir),
            "adapter_dir": str(adapter_dir),
            "summary_file": str(output_dir / "training_summary.json"),
        },
        "train_runtime_seconds": train_result.metrics.get("train_runtime"),
        "train_steps_per_second": train_result.metrics.get("train_steps_per_second"),
        "train_loss": train_result.metrics.get("train_loss"),
        "note": "This script only trains/saves a local LoRA adapter. It does not auto-wire Ollama.",
    }
    summary_path = output_dir / "training_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Training complete. Adapter saved to: {adapter_dir}")
    print(f"Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
