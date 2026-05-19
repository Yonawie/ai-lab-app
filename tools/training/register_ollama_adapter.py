#!/usr/bin/env python3
"""
Phase 2C utility: register a trained LoRA adapter as an Ollama model.

This script generates a Modelfile and runs:
  ollama create <alias> -f <Modelfile>
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Register a LoRA adapter with Ollama")
    p.add_argument("--base-model", required=True, help="Base model name for FROM")
    p.add_argument("--adapter-path", required=True, help="Path to adapter folder")
    p.add_argument("--student-id", default="", help="Student id for metadata")
    p.add_argument("--student-email", default="", help="Student email for metadata")
    p.add_argument("--alias", required=True, help="Target Ollama model alias")
    p.add_argument("--output-dir", required=True, help="Directory for Modelfile + metadata")
    p.add_argument(
        "--training-summary-path",
        default="",
        help="Optional path to Phase 2B training_summary.json",
    )
    p.add_argument(
        "--system-text",
        default="",
        help="Optional SYSTEM text for Modelfile",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    adapter_path = Path(args.adapter_path).expanduser().resolve()
    if not adapter_path.exists():
        raise FileNotFoundError(f"Adapter path not found: {adapter_path}")

    modelfile_path = output_dir / f"Modelfile-{args.alias.replace(':', '_')}.txt"
    lines = [f"FROM {args.base_model}", f"ADAPTER {adapter_path}"]
    system = args.system_text.strip()
    if system:
        escaped = system.replace('"""', '\\"\\"\\"')
        lines.append("")
        lines.append('SYSTEM """')
        lines.append(escaped)
        lines.append('"""')
    modelfile_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    cmd = ["ollama", "create", args.alias, "-f", str(modelfile_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        raise RuntimeError(f"`{' '.join(cmd)}` failed: {detail}")

    metadata = {
        "phase": "2C-register-only",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "studentId": args.student_id.strip(),
        "studentEmail": args.student_email.strip(),
        "baseModel": args.base_model,
        "adapterPath": str(adapter_path),
        "ollamaModelAlias": args.alias,
        "modelfilePath": str(modelfile_path),
        "trainingSummaryPath": args.training_summary_path.strip() or None,
    }
    metadata_path = output_dir / "ollama_registration_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Registered Ollama model alias: {args.alias}")
    print(f"Modelfile: {modelfile_path}")
    print(f"Metadata: {metadata_path}")


if __name__ == "__main__":
    main()
