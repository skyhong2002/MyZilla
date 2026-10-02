import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ask } from "./pipeline";

// Fallback until the host sets MYZILLA_LLM_BASE_URL. Codex cannot resolve gateway aliases, so it keeps the
// models those aliases pointed to when this path was retired; the gateway's model-policy.json is authoritative.
const LEGACY: Record<string, string> = {
  "sky-fast": "gpt-6-luna",
  "sky-quality": "gpt-6.1-sol",
};

// Runs `codex exec` with the machine's ChatGPT login: empty working dir, read-only sandbox, schema-bound answer.
export async function codexAsk(
  log: (line: string) => void = () => {},
  timeout = 20 * 60000,
) {
  const dir = await mkdtemp(join(tmpdir(), "myzilla-digest-"));
  const ask: Ask = async (step, requested, effort, prompt, schema) => {
    const model = LEGACY[requested] ?? requested;
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
    return {
      answer: JSON.parse(await readFile(answerFile, "utf8")),
      model,
    };
  };
  return { ask, close: () => rm(dir, { recursive: true, force: true }) };
}
