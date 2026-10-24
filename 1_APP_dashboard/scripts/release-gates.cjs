#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const evidencePath = join(__dirname, "..", "docs", "upgrade", "STAGING_EVIDENCE.json");
const fields = [
  "cleanInstall", "typecheck", "lint", "productionBuild", "stagingDatabaseMigrations",
  "crossUserAuthorization", "queueCronReplay", "modelBacktest", "desktopMobileE2E",
  "realStagingSmoke", "backupRestoreVerified", "termsDataLicensingReviewed",
];
const evidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, "utf8")) : null;
const verified = evidence && typeof evidence === "object" && evidence.results && typeof evidence.results === "object";
const failures = fields.filter((field) => {
  const result = verified ? evidence.results[field] : null;
  return !result || result.status !== "passed" || typeof result.evidence !== "string" || result.evidence.length < 10;
});
if (failures.length) {
  process.stderr.write(`RELEASE BLOCKED: ${failures.join(", ")}\n`);
  process.stderr.write("Provide independently collected staging evidence, not guessed pass flags.\n");
  process.exit(1);
}
console.log("Release evidence file contains each required gate; verify URLs and signed approvals before deployment.");
