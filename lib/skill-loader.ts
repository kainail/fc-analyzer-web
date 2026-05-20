import fs from "node:fs";
import path from "node:path";

const SUBDIRS = ["methodology", "rubric", "schema"] as const;

// SKILL_PATH points at a skill ROOT in local dev — the dir containing
// SKILL.md plus methodology/ / rubric/ / schema/ directly. The roleplay
// skill files live alongside as a `roleplay/` sibling under the same
// root. In production / Railway the env var is unset and we fall back
// to the bundled skill/ directory at the repo cwd.
//
// resolveSkillPath is a per-file resolver: it tries SKILL_PATH first
// and falls back to the bundled copy when a given file/dir is missing
// from the override. That keeps the analyzer skill iterable outside
// the repo without forcing the dev's external skill dir to also carry
// roleplay assets — those can stay in the bundle.
function bundleRoot(): string {
  return path.join(process.cwd(), "skill");
}

export function resolveSkillPath(relativePath: string): string {
  const override = process.env.SKILL_PATH;
  if (override) {
    const fromOverride = path.join(override, relativePath);
    if (fs.existsSync(fromOverride)) return fromOverride;
  }
  const fromBundle = path.join(bundleRoot(), relativePath);
  if (fs.existsSync(fromBundle)) return fromBundle;
  throw new Error(
    `Skill file not found: ${relativePath} (looked in ${
      override ? `${path.join(override, relativePath)} and ` : ""
    }${fromBundle})`,
  );
}

export function loadSkill(): string {
  const sections: string[] = [];

  const skillMd = resolveSkillPath("SKILL.md");
  sections.push(`# SKILL.md\n\n${fs.readFileSync(skillMd, "utf8")}`);

  for (const dir of SUBDIRS) {
    const dirPath = resolveSkillPath(dir);
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
