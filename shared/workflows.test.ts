/** The GitHub workflows parse and keep their safety properties (deploy on main only; routine gets only a number). */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../.github/workflows/", import.meta.url);
const load = (f: string) => ({ raw: readFileSync(new URL(f, dir), "utf8"), doc: Bun.YAML.parse(readFileSync(new URL(f, dir), "utf8")) as any });

describe("workflows", () => {
  test("every workflow parses and none uses claude-code-action", () => {
    const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    expect(files).toContain("deploy.yml");
    expect(files).toContain("feedback-routine.yml");
    for (const f of files) {
      const { raw, doc } = load(f);
      expect(doc.jobs).toBeTruthy();
      expect(raw).not.toContain("anthropics/claude-code-action");
    }
  });

  test("deploy runs on main only and pipes secrets via stdin", () => {
    const { raw, doc } = load("deploy.yml");
    expect(doc.on.push.branches).toEqual(["main"]);
    expect(raw).toContain('bunx wrangler secret put "$1"');
    expect(raw).toContain("GITHUB_FEEDBACK_TOKEN");
  });

  test("feedback routine: owner-only, debounced, payload names only the issue number", () => {
    const { raw, doc } = load("feedback-routine.yml");
    expect(doc.on.issues.types).toEqual(["opened", "labeled"]);
    expect(doc.concurrency).toEqual({ group: "feedback-routine", "cancel-in-progress": true });
    const job = doc.jobs.fire;
    expect(job.if).toContain("'feedback'");
    expect(job.if).toContain("github.event.issue.user.login == github.repository_owner");
    expect(raw).toContain("sleep 300");
    expect(raw).toContain("github.event.issue.number");
    expect(raw).not.toMatch(/github\.event\.issue\.(title|body)/);
  });
});
