#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vendorRoot = path.join(repoRoot, "third_party", "anthropic-cybersecurity-skills");
const sourceRoot = path.join(vendorRoot, "source");

const upstream = {
  repository: "https://github.com/mukul975/Anthropic-Cybersecurity-Skills",
  release: "v1.3.0",
  commit: "101ca0bd887a295e39cc20a100efa571937ca969",
  reviewDate: "2026-06-24",
};

const allowlistedSkills = [
  "auditing-mcp-servers-for-tool-poisoning",
  "detecting-ai-model-prompt-injection-attacks",
  "implementing-llm-guardrails-for-security",
  "implementing-secret-scanning-with-gitleaks",
  "performing-threat-modeling-with-owasp-threat-dragon",
  "analyzing-sbom-for-supply-chain-vulnerabilities",
  "implementing-sigstore-for-software-signing",
  "implementing-supply-chain-security-with-in-toto",
].map((id) => ({ id, upstreamPath: `skills/${id}` }));

const excludedFilePatterns = [
  "**/scripts/**",
  "**/.*/**",
  "**/*.py",
  "**/*.sh",
  "**/*.zip",
  "**/*.tar",
  "**/*.gz",
  "**/*.bin",
  "**/*.exe",
  "**/*.wasm",
  "**/node_modules/**",
  "**/.venv/**",
];

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    args.set(arg, process.argv[index + 1]?.startsWith("--") ? true : process.argv[index + 1] ?? true);
  }
}

const sourceArg = args.get("--source");
const sourceCheckout = sourceArg ? path.resolve(String(sourceArg)) : checkoutSource();
verifyCheckout(sourceCheckout);
writeVendor(sourceCheckout);

function checkoutSource() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-surface-security-pack-"));
  execFileSync("git", ["clone", "--no-checkout", upstream.repository, tempDir], { stdio: "inherit" });
  execFileSync("git", ["-C", tempDir, "checkout", upstream.commit], { stdio: "inherit" });
  return tempDir;
}

function verifyCheckout(sourcePath) {
  const commit = execFileSync("git", ["-C", sourcePath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (commit !== upstream.commit) {
    throw new Error(`Unexpected upstream commit: ${commit}`);
  }

  const tags = execFileSync("git", ["-C", sourcePath, "tag", "--points-at", "HEAD"], { encoding: "utf8" })
    .split(/\s+/)
    .filter(Boolean);
  if (!tags.includes(upstream.release)) {
    throw new Error(`Expected tag ${upstream.release} at ${upstream.commit}`);
  }
}

function writeVendor(sourcePath) {
  rmSync(vendorRoot, { recursive: true, force: true });

  cpRequiredFile(path.join(sourcePath, "LICENSE"), path.join(vendorRoot, "LICENSE"));
  writeFileSync(
    path.join(vendorRoot, "NOTICE.md"),
    [
      "# Anthropic Cybersecurity Skills Attribution",
      "",
      "Adaptive Surface vendors a reviewed, reference-only subset of `mukul975/Anthropic-Cybersecurity-Skills`.",
      "",
      `- Repository: ${upstream.repository}`,
      `- Release: ${upstream.release}`,
      `- Commit: ${upstream.commit}`,
      `- Review date: ${upstream.reviewDate}`,
      "- License: Apache-2.0",
      "",
      "Only the eight allowlisted source directories are retained. Raw upstream Markdown is treated as untrusted reference material and is not parsed on the runtime hot path.",
      "",
    ].join("\n"),
  );

  for (const skill of allowlistedSkills) {
    const upstreamSkillRoot = path.join(sourcePath, skill.upstreamPath);
    const retainedFiles = listRetainedFiles(upstreamSkillRoot);
    if (!retainedFiles.includes("SKILL.md")) {
      throw new Error(`Missing SKILL.md for ${skill.id}`);
    }

    for (const relativeFile of retainedFiles) {
      cpRequiredFile(
        path.join(upstreamSkillRoot, relativeFile),
        path.join(sourceRoot, skill.upstreamPath, relativeFile),
      );
    }
  }

  const retainedSourceFileHashes = Object.fromEntries(
    listAllFiles(sourceRoot).map((absoluteFile) => {
      const relativePath = normalizePath(path.relative(vendorRoot, absoluteFile));
      return [relativePath, sha256File(absoluteFile)];
    }).sort(([left], [right]) => left.localeCompare(right)),
  );

  const aggregateSourceSha256 = sha256Text(
    Object.entries(retainedSourceFileHashes)
      .map(([filePath, hash]) => `${hash}  ${filePath}`)
      .join("\n") + "\n",
  );

  const skills = allowlistedSkills.map((skill) => {
    const retainedFiles = Object.keys(retainedSourceFileHashes)
      .filter((filePath) => filePath.startsWith(`source/${skill.upstreamPath}/`))
      .map((filePath) => filePath.replace(`source/${skill.upstreamPath}/`, ""));
    const sourceFile = `source/${skill.upstreamPath}/SKILL.md`;
    return {
      id: skill.id,
      upstreamPath: skill.upstreamPath,
      retainedFiles,
      sourceSha256: retainedSourceFileHashes[sourceFile],
    };
  });

  const lock = {
    schemaVersion: 1,
    ...upstream,
    allowlistedSkillIds: allowlistedSkills.map((skill) => skill.id),
    skills,
    retainedSourceFileHashes,
    aggregateSourceSha256,
    excludedFilePatterns,
  };

  writeFileSync(path.join(vendorRoot, "UPSTREAM.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  stripExecutableBits(vendorRoot);
  console.log(`Vendored ${allowlistedSkills.length} security skills to ${path.relative(repoRoot, vendorRoot)}`);
  console.log(`Aggregate source SHA-256: ${aggregateSourceSha256}`);
}

function listRetainedFiles(skillRoot) {
  return listAllFiles(skillRoot)
    .map((absoluteFile) => normalizePath(path.relative(skillRoot, absoluteFile)))
    .filter((relativeFile) => {
      const basename = path.basename(relativeFile);
      if (basename === "SKILL.md" || basename === "LICENSE") return true;
      if (relativeFile.startsWith("references/") && relativeFile.endsWith(".md")) return true;
      if (relativeFile.startsWith("assets/") && relativeFile.endsWith(".md")) return true;
      return false;
    })
    .sort();
}

function listAllFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!existsSync(current)) continue;
    const currentStat = statSync(current);
    if (currentStat.isFile()) {
      files.push(current);
      continue;
    }
    if (!currentStat.isDirectory()) continue;
    for (const entry of readdirSyncSorted(current)) {
      if (entry.startsWith(".")) continue;
      stack.push(path.join(current, entry));
    }
  }
  return files.sort();
}

function readdirSyncSorted(dir) {
  return execFileSync("find", [dir, "-maxdepth", "1", "-mindepth", "1", "-print"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((entry) => path.basename(entry))
    .sort();
}

function cpRequiredFile(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing required upstream file: ${from}`);
  }
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: false, force: true });
  chmodSync(to, 0o644);
}

function stripExecutableBits(root) {
  for (const filePath of listAllFiles(root)) {
    chmodSync(filePath, 0o644);
  }
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
