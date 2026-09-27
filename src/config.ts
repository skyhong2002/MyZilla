export function readConfig(
  env: NodeJS.ProcessEnv,
  mode: "combined" | "ingest" = "combined",
) {
  const token = env.MYZILLA_TOKEN ?? "";
  if (token.length < 32)
    throw new Error("MYZILLA_TOKEN must contain at least 32 characters");
  const port = Number(
    mode === "ingest" ? (env.INGEST_PORT ?? 18141) : (env.PORT ?? 18140),
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid service port");
  return {
    token,
    port,
    host: env.HOST ?? "127.0.0.1",
    database: env.MYZILLA_DB ?? "./data/myzilla.sqlite",
  };
}
