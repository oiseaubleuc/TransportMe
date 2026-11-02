import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const script = fileURLToPath(new URL("./vercel-deploy.sh", import.meta.url));

function run(args, env) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
}

test("weigeren zonder GitHub Secrets", () => {
  const uit = run(["preview"], {});
  assert.equal(uit.status, 1);
  assert.match(uit.stdout + uit.stderr, /VERCEL_TOKEN/);
  assert.match(uit.stdout + uit.stderr, /VERCEL_ORG_ID/);
  assert.match(uit.stdout + uit.stderr, /VERCEL_PROJECT_ID/);
});

test("weigeren als één secret ontbreekt", () => {
  const uit = run(["production"], {
    VERCEL_TOKEN: "x",
    VERCEL_ORG_ID: "team_x",
  });
  assert.equal(uit.status, 1);
  assert.match(uit.stdout + uit.stderr, /VERCEL_PROJECT_ID/);
});

test("weigeren bij onbekende omgeving", () => {
  const uit = run(["staging"], {
    VERCEL_TOKEN: "x",
    VERCEL_ORG_ID: "team_x",
    VERCEL_PROJECT_ID: "prj_x",
  });
  assert.equal(uit.status, 2);
});

test("één pipeline, oude ci/cd-workflows weg, secrets verplicht", () => {
  const root = join(dirname(script), "..");
  const yml = readFileSync(join(root, ".github/workflows/pipeline.yml"), "utf8");
  assert.equal(existsSync(join(root, ".github/workflows/ci.yml")), false);
  assert.equal(existsSync(join(root, ".github/workflows/cd.yml")), false);
  assert.match(yml, /secrets\.VERCEL_TOKEN/);
  assert.match(yml, /secrets\.VERCEL_ORG_ID/);
  assert.match(yml, /secrets\.VERCEL_PROJECT_ID/);
  assert.match(yml, /bash scripts\/vercel-deploy\.sh preview/);
  assert.match(yml, /bash scripts\/vercel-deploy\.sh production/);
  assert.doesNotMatch(yml, /exit 0/);
});
