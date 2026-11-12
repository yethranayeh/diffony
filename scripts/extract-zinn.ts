// Collects Zinn's git history, three test runs and one timing record into the showcase's compact JSON.
// Usage: bun scripts/extract-zinn.ts --repo <zinn checkout> --full <run dir> --red <run dir> --rerun <run dir> --timings <record dir> --out <file>
// A run dir holds a test run's junit.xml and summary.txt. A record dir holds hyperfine 2.x exports named startup.json and t<size>.json.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const inputNames = ["repo", "full", "red", "rerun", "timings", "out"] as const;
const { values } = parseArgs({ options: Object.fromEntries(inputNames.map((name) => [name, { type: "string" }])) });
const missing = inputNames.filter((name) => !values[name]);
if (missing.length > 0) {
  console.error(`extract-zinn: missing ${missing.map((name) => "--" + name).join(", ")}`);
  process.exit(2);
}
const { repo, full, red, rerun, timings, out } = values as Record<(typeof inputNames)[number], string>;

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(` ${name}="([^"]*)"`));
  return m?.[1];
}

function unescape(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function pkgOf(file: string): string {
  if (file.startsWith("packages/core")) return "core";
  if (file.startsWith("packages/cli")) return "cli";
  if (file.startsWith("packages/tui")) return "tui";
  if (file.startsWith("integrations/")) return "integrations";
  if (file.startsWith("docs/")) return "docs";
  return "scripts";
}

// Files run one after another (suite times add up to the wall time), so each file starts where the previous ended.
// Tests inside a file are laid out in order and scaled to fit the file's time.
function readRun(dir: string) {
  const id = dir.replace(/\/+$/, "").split("/").pop()!;
  const xml = readFileSync(`${dir}/junit.xml`, "utf8");
  const summary = readFileSync(`${dir}/summary.txt`, "utf8").split("\n").slice(0, 3).join("\n");
  const lines = xml.split("\n");
  const files: any[] = [];
  let current: any = null;
  let depth = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("<testsuite ")) {
      depth++;
      if (depth === 1) {
        const file = attr(t, "file") ?? attr(t, "name")!;
        current = { file, pkg: pkgOf(file), dur: Number(attr(t, "time")), cases: [] as any[] };
        files.push(current);
      }
      if (t.endsWith("/>")) depth--;
    } else if (t.startsWith("</testsuite>")) {
      depth--;
    } else if (t.startsWith("<testcase ") && current) {
      const failed = !t.endsWith("/>") ? /<failure/.test(lines[lines.indexOf(line) + 1] ?? "") : false;
      current.cases.push({
        name: unescape(attr(t, "name") ?? ""),
        dur: Number(attr(t, "time")),
        asserts: Number(attr(t, "assertions") ?? 0),
        failed,
      });
    }
  }
  // Mark failures robustly: any testcase element that is not self-closing and contains <failure.
  const failedNames = new Set<string>();
  for (const m of xml.matchAll(/<testcase ([^>]*[^/])>([\s\S]*?)<\/testcase>/g)) {
    if (m[2].includes("<failure")) {
      failedNames.add(unescape(attr(" " + m[1], "name") ?? ""));
    }
  }
  let clock = 0;
  for (const f of files) {
    f.t0 = clock;
    const caseSum = f.cases.reduce((s: number, c: any) => s + c.dur, 0);
    const scale = caseSum > f.dur && caseSum > 0 ? f.dur / caseSum : 1;
    const gap = caseSum < f.dur && f.cases.length > 0 ? (f.dur - caseSum) / (f.cases.length + 1) : 0;
    let c0 = clock + gap;
    for (const c of f.cases) {
      c.t0 = +c0.toFixed(4);
      c.dur = +(c.dur * scale).toFixed(5);
      c.failed = c.failed || failedNames.has(c.name);
      c0 += c.dur + gap;
    }
    f.t0 = +f.t0.toFixed(4);
    clock += f.dur;
  }
  return { id, summary, total: +clock.toFixed(3), files };
}

function readTimes(file: string, size: string) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  return j.results.map((r: any) => ({
    name: r.name,
    size,
    wall: r.measurements.map((m: any) => +m.time_wall_clock.value.toFixed(5)),
    memMB: Math.round(
      r.measurements.map((m: any) => m.memory_peak_resident.value).sort((a: number, b: number) => a - b)[r.measurements.length >> 1] / 1e6,
    ),
  }));
}

const commands = [
  ...readTimes(`${timings}/startup.json`, "startup"),
  ...readTimes(`${timings}/t100.json`, "100"),
  ...readTimes(`${timings}/t1000.json`, "1000"),
  ...readTimes(`${timings}/t10000.json`, "10000"),
];

const log = execFileSync("git", ["-C", repo, "log", "--reverse", "--format=@%at %s", "--shortstat"], { encoding: "utf8" });
const commits: any[] = [];
for (const line of log.split("\n")) {
  if (line.startsWith("@")) {
    const [ts, ...rest] = line.slice(1).split(" ");
    const subject = rest.join(" ");
    const m = subject.match(/^([a-z]+)(\([a-z-]+\))?:/);
    let area = m ? m[1] : "none";
    if (!["core", "cli", "docs", "scripts", "test", "integrations", "build"].includes(area)) {
      area = area === "none" ? "none" : "build";
    }
    commits.push({ t: Number(ts), area, lines: 0 });
  } else if (line.includes("changed") && commits.length) {
    const ins = Number(line.match(/(\d+) insertion/)?.[1] ?? 0);
    const del = Number(line.match(/(\d+) deletion/)?.[1] ?? 0);
    commits[commits.length - 1].lines = ins + del;
  }
}

const data = {
  green: readRun(full),
  codexRed: readRun(red),
  codexGreen: readRun(rerun),
  commands,
  commits,
};
writeFileSync(out, JSON.stringify(data));
console.log(
  "green", data.green.total, data.green.files.length,
  "red fails", data.codexRed.files.flatMap((f: any) => f.cases).filter((c: any) => c.failed).length,
  "commits", commits.length, "bytes", JSON.stringify(data).length,
);
