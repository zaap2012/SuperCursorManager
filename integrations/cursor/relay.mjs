import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = path.join(os.homedir(), ".pulse");
const spool = path.join(home, "spool.jsonl");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString("utf8").trim() || "{}";

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  payload = { raw };
}

const envelope = {
  schemaVersion: 1,
  source: { kind: "ide.cursor" },
  receivedAt: Date.now(),
  payload,
};

try {
  fs.mkdirSync(home, { recursive: true });
  fs.appendFileSync(spool, `${JSON.stringify(envelope)}\n`);
} catch {
  // never block the agent
}

process.stdout.write("{}\n");
