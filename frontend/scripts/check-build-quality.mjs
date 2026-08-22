import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const buildRoot = resolve(".next");
const homeHtmlPath = resolve(buildRoot, "server", "app", "index.html");
const html = readFileSync(homeHtmlPath, "utf8");
const scriptSources = [
  ...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js)[^"]*"/g)].map((match) => match[1]))
];
const initialScripts = scriptSources.map((source) => {
  const physicalPath = resolve(buildRoot, source.replace(/^\/_next\//, ""));
  const content = readFileSync(physicalPath);
  return {
    source,
    bytes: content.length,
    gzipBytes: gzipSync(content).length
  };
});

const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
const description = html.match(/<meta name="description" content="([^"]*)/)?.[1] ?? "";
const h1Count = (html.match(/<h1\b/g) ?? []).length;
const initialJsGzipBytes = initialScripts.reduce((sum, script) => sum + script.gzipBytes, 0);
const MAX_INITIAL_JS_GZIP_BYTES = 210 * 1024;

const failures = [];
if (h1Count !== 1) failures.push(`Homepage must contain exactly one prerendered H1; received ${h1Count}.`);
if (title.length < 30 || title.length > 60) failures.push(`Title length must be 30-60; received ${title.length}.`);
if (description.length < 120 || description.length > 170) {
  failures.push(`Meta description length must be 120-170; received ${description.length}.`);
}
if (!/<link rel="canonical" href="https:\/\//.test(html)) failures.push("Homepage canonical HTTPS URL is missing.");
if (!html.includes('type="application/ld+json"') || !html.includes("Organization")) {
  failures.push("Organization/WebSite JSON-LD is missing from prerendered HTML.");
}
for (const unsupportedClaim of ["45%", "350+", "50.000+"]) {
  if (html.includes(unsupportedClaim)) failures.push(`Unsupported marketing claim remains: ${unsupportedClaim}`);
}
if (initialJsGzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
  failures.push(
    `Homepage initial JS exceeds ${MAX_INITIAL_JS_GZIP_BYTES} gzip bytes; received ${initialJsGzipBytes}.`
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`BUILD_QUALITY_ERROR=${failure}`);
  process.exit(1);
}

console.log(`BUILD_QUALITY_H1=${h1Count}`);
console.log(`BUILD_QUALITY_TITLE_LENGTH=${title.length}`);
console.log(`BUILD_QUALITY_DESCRIPTION_LENGTH=${description.length}`);
console.log(`BUILD_QUALITY_INITIAL_JS_GZIP_BYTES=${initialJsGzipBytes}`);
console.log(`BUILD_QUALITY_INITIAL_SCRIPT_COUNT=${initialScripts.length}`);
