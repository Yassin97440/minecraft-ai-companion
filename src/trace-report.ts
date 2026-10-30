import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { readTrace, summarize } from "./trace.js";

// Usage : npm run trace-report [fichier.jsonl | --all]
const arg = process.argv[2];
const files = fs.existsSync(config.trace.dir)
  ? fs.readdirSync(config.trace.dir).filter((f) => f.endsWith(".jsonl")).sort()
  : [];

const picked = arg === "--all" ? files.map((f) => path.join(config.trace.dir, f)) : arg ? [arg] : files.slice(-1).map((f) => path.join(config.trace.dir, f));
if (!picked.length) {
  console.error(`Aucune trace dans ${config.trace.dir} (lance le bot d'abord, TRACE ne doit pas valoir false).`);
  process.exit(1);
}
console.log(`Traces : ${picked.join(", ")}\n`);
console.log(summarize(picked.flatMap(readTrace)));
