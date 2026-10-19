import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const api = path.join(root, "src/app/api");
const stash = path.join("/tmp", "kamaik-api-stash");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

let moved = false;
try {
  run("node", ["--experimental-strip-types", "scripts/snapshot.ts"]);
  fs.rmSync(stash, { recursive: true, force: true });
  fs.renameSync(api, stash);
  moved = true;
  run("npx", ["next", "build"], {
    env: { ...process.env, STATIC_EXPORT: "1", NEXT_PUBLIC_STATIC: "1" },
  });
} finally {
  if (moved && !fs.existsSync(api) && fs.existsSync(stash)) {
    fs.renameSync(stash, api);
  }
}

if (!fs.existsSync(path.join(root, "out", "index.html"))) {
  console.error("static export did not write out/index.html");
  process.exit(1);
}
console.log(`static site written to ${path.join(root, "out")}`);
