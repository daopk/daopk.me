// Emit the set of first-party app packages that changed, as a JSON array for a
// GitHub Actions build matrix. Used by .github/workflows/apps.yml so a push
// only rebuilds + republishes the apps it actually touched.
//
// Inputs (env): EVENT_NAME, BEFORE_SHA, AFTER_SHA, DISPATCH_APP.
// Outputs (GITHUB_OUTPUT): `apps` (JSON array) and `has_changes` ("true"/"false").
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync } from "node:fs";

const APPS_DIR = "apps";
const ZERO_SHA = "0000000000000000000000000000000000000000";

const eventName = process.env.EVENT_NAME ?? "";
const beforeSha = (process.env.BEFORE_SHA ?? "").trim();
const afterSha = (process.env.AFTER_SHA ?? "HEAD").trim();
const dispatchApp = (process.env.DISPATCH_APP ?? "").trim();

/** Every `apps/<id>` directory that is a real package (has a package.json). */
function listAllApps() {
  if (!existsSync(APPS_DIR)) {
    return [];
  }
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`${APPS_DIR}/${entry.name}/package.json`))
    .map((entry) => entry.name);
}

/** App ids touched between BEFORE_SHA..AFTER_SHA; falls back to all apps. */
function changedFromGit() {
  let base = beforeSha;
  // First push to a branch reports an all-zero base; diff against the parent.
  if (base.length === 0 || base === ZERO_SHA) {
    base = `${afterSha}~1`;
  }

  let diff = "";
  try {
    diff = execSync(`git diff --name-only ${base} ${afterSha} -- ${APPS_DIR}`, {
      encoding: "utf8",
    });
  } catch {
    // Base commit unavailable (shallow clone / brand-new history): be safe and
    // rebuild every app rather than silently publishing nothing.
    return listAllApps();
  }

  const ids = new Set();
  for (const line of diff.split("\n")) {
    const match = /^apps\/([^/]+)\//.exec(line.trim());
    if (match !== null) {
      ids.add(match[1]);
    }
  }
  return [...ids].filter((id) => existsSync(`${APPS_DIR}/${id}/package.json`));
}

const apps =
  eventName === "workflow_dispatch"
    ? dispatchApp.length > 0
      ? [dispatchApp]
      : listAllApps()
    : changedFromGit();

const unique = [...new Set(apps)].sort();
const hasChanges = unique.length > 0;

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath !== undefined) {
  appendFileSync(outputPath, `apps=${JSON.stringify(unique)}\n`);
  appendFileSync(outputPath, `has_changes=${hasChanges}\n`);
}

console.log(`Changed apps: ${hasChanges ? unique.join(", ") : "(none)"}`);
