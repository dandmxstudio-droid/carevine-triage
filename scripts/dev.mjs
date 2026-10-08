import { spawn } from "node:child_process";
// Accept preview flags while preserving the standard Next.js development server.
const args = process.argv.slice(2).filter((x) => x !== "--strictPort");
for (let i = 0; i < args.length; i++)
  if (args[i] === "--host") args[i] = "--hostname";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", ...args],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
