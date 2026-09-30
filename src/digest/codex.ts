import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ask } from "./pipeline";

// Runs `codex exec` with the machine's ChatGPT login: empty working dir, read-only sandbox, schema-bound answer.
export async function codexAsk(
  log: (line: string) => void = () => {},
  timeout = 20 * 60000,
) {
  const dir = await mkdtemp(join(tmpdir(), "myzilla-digest-"));
  const ask: Ask = async (step, model, effort, prompt, schema) => {
    const schemaFile = join(dir, step + ".schema.json"),
      answerFile = join(dir, step + ".json");
    await writeFile(schemaFile, JSON.stringify(schema));
    const started = Date.now();
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        process.env.CODEX_BIN ?? "codex",
        [
          "exec",
          "--skip-git-repo-check",
          "--ephemeral",
          "-s",
          "read-only",
          "-C",
          dir,
          "-m",
          model,
          "-c",
          `model_reasoning_effort="${effort}"`,
          "--output-schema",
          schemaFile,
          "-o",
          answerFile,
          "-",
        ],
        { timeout, maxBuffer: 1 << 26 },
        (error, _stdout, stderr) =>
          error
            ? reject(
                new Error(
                  `${step} (${model}) failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`,
                ),
              )
            : resolve(),
      );
      child.stdin!.end(prompt);
    });
    log(
      `${step}: ${model}, ${prompt.length} chars, ${Math.round((Date.now() - started) / 1000)}s`,
    );
    return JSON.parse(await readFile(answerFile, "utf8"));
  };
  return { ask, close: () => rm(dir, { recursive: true, force: true }) };
}
