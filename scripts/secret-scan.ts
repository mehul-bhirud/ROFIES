import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const excluded = new Set([
  ".git",
  ".next",
  "node_modules",
  "playwright-report",
  "test-results",
  "coverage",
  "supabase/.temp"
]);
const readableExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".sql",
  ".toml",
  ".yml",
  ".yaml",
  ".env",
  ".example",
  ".gitignore"
]);
const credentialPatterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  {
    name: "JWT credential",
    pattern: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/
  }
] as const;

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    const projectPath = relative(root, fullPath).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (![...excluded].some((item) => projectPath === item || projectPath.startsWith(`${item}/`)))
        files.push(...(await walk(fullPath)));
    } else if (readableExtensions.has(extname(entry.name)) || entry.name.startsWith(".env")) {
      files.push(fullPath);
    }
  }
  return files;
}

const findings: string[] = [];
const files = await walk(root);
for (const file of files) {
  const projectPath = relative(root, file).replaceAll("\\", "/");
  if (projectPath.startsWith(".env") && projectPath !== ".env.example")
    findings.push(`${projectPath}: environment file must not be committed`);
  const contents = await readFile(file, "utf8");
  for (const { name, pattern } of credentialPatterns) {
    if (pattern.test(contents)) findings.push(`${projectPath}: possible ${name}`);
  }
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (/NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)/.test(line)) {
      findings.push(`${projectPath}:${index + 1}: privileged value uses a browser-public prefix`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Secret scan passed: ${files.length} source/configuration files inspected; no credential patterns or public privileged variables found.`
  );
}
