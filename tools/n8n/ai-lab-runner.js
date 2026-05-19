#!/usr/bin/env node
/**
 * Local AI Lab runner for n8n.
 *
 * Purpose:
 * - let n8n ask the project machine to run safe validation commands;
 * - avoid exposing arbitrary shell execution;
 * - keep teacher/admin/product code untouched.
 *
 * Start:
 *   $env:AI_LAB_RUNNER_TOKEN="change-me"
 *   node tools/n8n/ai-lab-runner.js
 *
 * Request:
 *   POST http://localhost:8787/run
 *   Authorization: Bearer change-me
 *   { "task": "all-checks" }
 */

const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.AI_LAB_RUNNER_PORT || 8787);
const token = process.env.AI_LAB_RUNNER_TOKEN || "";

const TASKS = {
  health: {
    command: "node",
    args: ["-e", "console.log(JSON.stringify({ ok: true, service: 'ai-lab-runner' }))"],
    cwd: repoRoot,
  },
  "desktop-typecheck": {
    command: "npx.cmd",
    args: ["tsc", "--noEmit", "-p", "apps/desktop/tsconfig.json", "--pretty", "false"],
    cwd: repoRoot,
  },
  "desktop-build": {
    command: "pnpm.cmd",
    args: ["--filter", "@ai-lab/desktop", "build"],
    cwd: repoRoot,
  },
  "rust-check": {
    command: "cargo",
    args: ["check"],
    cwd: path.join(repoRoot, "apps/desktop/src-tauri"),
  },
  "all-checks": {
    sequence: ["rust-check", "desktop-typecheck", "desktop-build"],
  },
};

function sendJson(res, statusCode, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 64) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function runOne(taskName) {
  const task = TASKS[taskName];
  if (!task || task.sequence) {
    return Promise.reject(new Error(`Unknown runnable task: ${taskName}`));
  }

  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(task.command, task.args, {
      cwd: task.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        task: taskName,
        ok: false,
        exitCode: null,
        startedAt,
        finishedAt: new Date().toISOString(),
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({
        task: taskName,
        ok: code === 0,
        exitCode: code,
        startedAt,
        finishedAt: new Date().toISOString(),
        stdout: stdout.slice(-16000),
        stderr: stderr.slice(-16000),
      });
    });
  });
}

async function runTask(taskName) {
  const task = TASKS[taskName];
  if (!task) {
    const allowed = Object.keys(TASKS).sort();
    throw new Error(`Unknown task "${taskName}". Allowed: ${allowed.join(", ")}`);
  }
  if (task.sequence) {
    const results = [];
    for (const childTask of task.sequence) {
      const result = await runOne(childTask);
      results.push(result);
      if (!result.ok) break;
    }
    return {
      task: taskName,
      ok: results.every((result) => result.ok),
      results,
    };
  }
  return runOne(taskName);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "ai-lab-runner",
        repoRoot,
        tasks: Object.keys(TASKS).sort(),
      });
    }

    if (req.method !== "POST" || req.url !== "/run") {
      return sendJson(res, 404, { ok: false, error: "Use POST /run." });
    }

    if (token) {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${token}`) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized." });
      }
    }

    const body = await readJson(req);
    const task = String(body.task || "").trim();
    if (!task) {
      return sendJson(res, 400, {
        ok: false,
        error: "Missing task.",
        allowedTasks: Object.keys(TASKS).sort(),
      });
    }

    const result = await runTask(task);
    return sendJson(res, result.ok ? 200 : 500, result);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI Lab runner listening on http://127.0.0.1:${port}`);
  console.log(`Repo: ${repoRoot}`);
  console.log(`Tasks: ${Object.keys(TASKS).sort().join(", ")}`);
});
