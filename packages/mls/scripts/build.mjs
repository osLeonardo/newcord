// Builds @newcord/mls: the crate for wasm32-unknown-unknown, then wasm-bindgen's Node.js module
// in pkg/ (09-m2-build Settings). `--if-missing` skips the build when pkg/ already holds one.
import { spawnSync } from "node:child_process";
import console from "node:console";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(packageRoot, "pkg");

if (
  process.argv.includes("--if-missing") &&
  existsSync(join(outputDir, "newcord_mls.js"))
) {
  process.exit(0);
}

run("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown"]);
run("wasm-bindgen", [
  "--target",
  "nodejs",
  "--out-dir",
  outputDir,
  join(
    packageRoot,
    "target",
    "wasm32-unknown-unknown",
    "release",
    "newcord_mls.wasm",
  ),
]);
// wasm-bindgen's Node.js output is CommonJS, inside a package that is otherwise ES modules.
writeFileSync(join(outputDir, "package.json"), '{ "type": "commonjs" }\n');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    console.error(
      `${command} could not start (${result.error.message}). Install the Rust toolchain, the wasm32-unknown-unknown target and wasm-bindgen-cli (#4), and put them on PATH.`,
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
