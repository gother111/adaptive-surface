#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vendorRoot = path.join(repoRoot, "third_party", "anthropic-cybersecurity-skills");
const sourceRoot = path.join(vendorRoot, "source");
const lockPath = path.join(vendorRoot, "UPSTREAM.lock.json");

const expected = {
  repository: "https://github.com/mukul975/Anthropic-Cybersecurity-Skills",
  release: "v1.3.0",
  commit: "101ca0bd887a295e39cc20a100efa571937ca969",
  reviewDate: "2026-06-24",
  allowlistedSkillIds: [
    "auditing-mcp-servers-for-tool-poisoning",
    "detecting-ai-model-prompt-injection-attacks",
    "implementing-llm-guardrails-for-security",
    "implementing-secret-scanning-with-gitleaks",
    "performing-threat-modeling-with-owasp-threat-dragon",
    "analyzing-sbom-for-supply-chain-vulnerabilities",
    "implementing-sigstore-for-software-signing",
    "implementing-supply-chain-security-with-in-toto",
  ],
};

const lock = readJson(lockPath);
assertEqual(lock.repository, expected.repository, "repository");
assertEqual(lock.release, expected.release, "release");
assertEqual(lock.commit, expected.commit, "commit");
assertEqual(lock.reviewDate, expected.reviewDate, "reviewDate");
assertArrayEqual(lock.allowlistedSkillIds, expected.allowlistedSkillIds, "allowlistedSkillIds");

if (!existsSync(path.join(vendorRoot, "LICENSE"))) {
  fail("Missing Apache-2.0 LICENSE");
}
if (!existsSync(path.join(vendorRoot, "NOTICE.md"))) {
  fail("Missing NOTICE.md attribution");
}

const actualFiles = listAllFiles(sourceRoot).map((absoluteFile) => normalizePath(path.relative(vendorRoot, absoluteFile))).sort();
const expectedFiles = Object.keys(lock.retainedSourceFileHashes).sort();
assertArrayEqual(actualFiles, expectedFiles, "retained source file list");

const skillDirs = listDirectories(path.join(sourceRoot, "skills")).map((entryPath) => path.basename(entryPath)).sort();
assertArrayEqual(skillDirs, expected.allowlistedSkillIds.slice().sort(), "source skill directories");

for (const filePath of actualFiles) {
  if (filePath.includes("/scripts/")) fail(`Executable script retained: ${filePath}`);
  const absoluteFile = path.join(vendorRoot, filePath);
  const mode = statSync(absoluteFile).mode;
  if ((mode & 0o111) !== 0) fail(`Executable bit present on ${filePath}`);
  assertEqual(sha256File(absoluteFile), lock.retainedSourceFileHashes[filePath], `hash for ${filePath}`);
}

const aggregate = sha256Text(
  Object.entries(lock.retainedSourceFileHashes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, hash]) => `${hash}  ${filePath}`)
    .join("\n") + "\n",
);
assertEqual(aggregate, lock.aggregateSourceSha256, "aggregateSourceSha256");

console.log(`Verified ${expected.allowlistedSkillIds.length} vendored Security Pack skills.`);
console.log(`Aggregate source SHA-256: ${lock.aggregateSourceSha256}`);

function readJson(filePath) {
  if (!existsSync(filePath)) fail(`Missing ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function listAllFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!existsSync(current)) continue;
    const stat = statSync(current);
    if (stat.isFile()) {
      files.push(current);
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of listEntries(current)) stack.push(path.join(current, entry));
    }
  }
  return files;
}

function listDirectories(root) {
  return listEntries(root)
    .map((entry) => path.join(root, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory());
}

function listEntries(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((entry) => !entry.startsWith(".")).sort();
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function assertEqual(actual, expectedValue, label) {
  if (actual !== expectedValue) {
    fail(`${label}: expected ${expectedValue}, got ${actual}`);
  }
}

function assertArrayEqual(actual, expectedValue, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expectedValue);
  if (actualJson !== expectedJson) {
    fail(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function fail(message) {
  console.error(`security:verify-vendor failed: ${message}`);
  process.exit(1);
}
