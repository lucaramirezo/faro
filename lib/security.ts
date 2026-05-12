import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";

/**
 * Resolve ``p`` and assert it's strictly under ``parent``. Refuses traversal
 * escapes (``..`` segments, absolute paths outside the parent tree) and
 * refuses operating on the parent dir itself.
 *
 * Byte-for-byte semantic port of ``slack_agent/pipeline_approvals.py:_assert_under``.
 */
export function assertUnder(p: string, parent: string): string {
  const resolved = resolvePath(p);
  const parentResolved = resolvePath(parent);
  if (resolved === parentResolved) {
    throw new Error(`Refusing to operate on parent dir itself: ${resolved}`);
  }
  const sep = parentResolved.endsWith("/") ? parentResolved : `${parentResolved}/`;
  if (!resolved.startsWith(sep)) {
    throw new Error(`Refusing to operate outside ${parentResolved}: ${resolved}`);
  }
  return resolved;
}

type SpawnResult = { code: number; stdout: string; stderr: string };

function runGit(args: string[], cwd: string, timeoutMs = 30_000): Promise<SpawnResult> {
  return new Promise((resolveP) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);
    proc.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    proc.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ code: code ?? 1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolveP({ code: 1, stdout, stderr: stderr + (err.message ?? "") });
    });
  });
}

/**
 * Stage given paths, commit with ``Automated-By: pipeline_approvals`` trailer,
 * pull --rebase, push. Returns true on success-or-no-op. Returns false only on
 * hard errors (``git add`` failure). Push and rebase failures are logged and
 * return true — the local commit is safe and a future operation will reconcile.
 *
 * Byte-for-byte semantic port of ``slack_agent/pipeline_approvals.py:_git_commit_state_change``.
 */
export async function gitCommitStateChange({
  paths,
  message,
  cwd,
}: {
  paths: string[];
  message: string;
  cwd: string;
}): Promise<boolean> {
  const add = await runGit(["add", ...paths], cwd);
  if (add.code !== 0) {
    console.error(`[faro] git add failed: ${add.stderr.trim()}`);
    return false;
  }
  const status = await runGit(["diff", "--cached", "--quiet"], cwd);
  if (status.code === 0) {
    console.log(`[faro] commit: nothing to commit (${message.split("\n")[0]})`);
    return true;
  }
  const fullMsg = `${message}\n\nAutomated-By: pipeline_approvals`;
  const commit = await runGit(["commit", "-m", fullMsg], cwd);
  if (commit.code !== 0) {
    console.error(`[faro] git commit failed: ${commit.stderr.trim()}`);
    return false;
  }
  console.log(`[faro] commit: ${message.split("\n")[0]}`);

  const pull = await runGit(["pull", "--rebase"], cwd);
  if (pull.code !== 0) {
    console.warn(`[faro] git pull --rebase failed, aborting rebase: ${pull.stderr.trim()}`);
    await runGit(["rebase", "--abort"], cwd, 10_000);
    return true;
  }
  const push = await runGit(["push"], cwd);
  if (push.code !== 0) {
    console.warn(`[faro] git push failed (will retry later): ${push.stderr.trim()}`);
  } else {
    console.log("[faro] git push: ok");
  }
  return true;
}
