import fs from "node:fs";
import path from "node:path";

const SUBDIRS = ["methodology", "rubric", "schema"] as const;

export function loadSkill(): string {
  // SKILL_PATH wins in local dev (where the skill is iterated outside
  // the repo). In production / Railway, the env var is unset and we
  // fall through to the bundled skill/ directory checked into the
  // repo root. The bundled copy is the source of truth for deploys.
  const root = process.env.SKILL_PATH ?? path.join(process.cwd(), "skill");
  if (!fs.existsSync(root)) {
    throw new Error(
      `Skill directory does not exist: ${root}. Set SKILL_PATH or ensure the bundled skill/ folder is present at the repo root.`,
    );
  }

  const sections: string[] = [];

  const skillMd = path.join(root, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    throw new Error(`Required file missing: ${skillMd}`);
  }
  sections.push(`# SKILL.md\n\n${fs.readFileSync(skillMd, "utf8")}`);

  for (const dir of SUBDIRS) {
    const dirPath = path.join(root, dir);
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Required subdirectory missing: ${dirPath}`);
    }
    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".md") || f.endsWith(".json"))
      .sort();
    if (files.length === 0) {
      throw new Error(`No .md or .json files found in: ${dirPath}`);
    }
    for (const f of files) {
      const filePath = path.join(dirPath, f);
      sections.push(`# ${dir}/${f}\n\n${fs.readFileSync(filePath, "utf8")}`);
    }
  }

  return sections.join("\n\n---\n\n");
}
