// Inlines a showcase's JSON into its page template and writes one self-contained HTML file.
// Usage: bun scripts/build.ts <template.html> <data.json> <out.html>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [templatePath, dataPath, outPath] = process.argv.slice(2);
if (!templatePath || !dataPath || !outPath) {
  console.error("usage: bun scripts/build.ts <template.html> <data.json> <out.html>");
  process.exit(2);
}

const template = readFileSync(templatePath, "utf8");
// Escaping < keeps "</script>" inside the data from closing the script element early.
const data = readFileSync(dataPath, "utf8").trim().replace(/</g, "\\u003c");
// A replacer function keeps "$" sequences in the data from being read as replacement patterns.
const page = template.replace("__DATA__", () => data);

const pageScript = page.split("<script>")[1]?.split("</script>")[0];
if (!pageScript) {
  console.error(`build: no inline <script> in ${templatePath}`);
  process.exit(1);
}
new Function(pageScript);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, page);
console.log(`wrote ${outPath} (${page.length} bytes)`);
