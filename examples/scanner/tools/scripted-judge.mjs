// The scripted judge: reads the one-line request JSON on stdin and prints the canned
// verdict for its `task` from `judge-fixtures.json`. Empty verdicts, because the example
// is written so nothing is unmentioned, unstated, contradictory, or duplicated.

import { readFileSync } from "node:fs";

const fixtures = JSON.parse(
  readFileSync(new URL("./judge-fixtures.json", import.meta.url), "utf8"),
);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const request = JSON.parse(input);
  const verdict = fixtures[request.task];
  if (verdict === undefined) {
    console.error(`scripted judge: no fixture for task ${JSON.stringify(request.task)}`);
    process.exit(4);
  }
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
});
