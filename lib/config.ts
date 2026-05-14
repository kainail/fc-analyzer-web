import fs from "node:fs";
import path from "node:path";

const CONFIG_DIR = path.join(process.cwd(), "config");

export function getReps(): string[] {
  const file = path.join(CONFIG_DIR, "staff.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { reps: string[] };
  return data.reps;
}

export function getGyms(): string[] {
  const file = path.join(CONFIG_DIR, "gyms.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { gyms: string[] };
  return data.gyms;
}
