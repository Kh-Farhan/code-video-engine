import { stripEmDashes } from "./sanitize";
import type { UploadField, UploadPackage } from "./platforms";

/** out/<slug>/upload.md and upload.html, both rendered from one UploadPackage. */

const EM_DASH = "—";

/** A fence longer than any run of backticks in the value, so code with backticks stays intact. */
const fenceFor = (value: string): string => {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
};

const fieldMarkdown = (field: UploadField): string[] => {
  const fence = fenceFor(field.value);
  return [
    `### ${field.label}${field.count ? ` (${field.count})` : ""}`,
    "",
    ...(field.note ? [field.note, ""] : []),
    `${fence}text`,
    field.value,
    fence,
    "",
  ];
};

export const renderUploadMarkdown = (pkg: UploadPackage): string => {
  const md = [
    `# Upload: ${pkg.title}`,
    "",
    "Every field sits in its own code block: copy it as is. `upload.html` next to this file has a Copy button for each one.",
    "",
    ...(pkg.warnings.length > 0 ? ["**Before uploading:**", "", ...pkg.warnings.map((w) => `- ${w}`), ""] : []),
    ...pkg.sections.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...(section.intro ? [section.intro, ""] : []),
      ...(section.fields.length > 0 ? section.fields.flatMap(fieldMarkdown) : ["No fix code for this video.", ""]),
      ...(section.checklist.length > 0
        ? ["### Checklist", "", ...section.checklist.map((item) => `- [ ] ${item}`), ""]
        : []),
    ]),
    "## Transcript",
    "",
    pkg.transcript.join("\n\n"),
    "",
  ].join("\n");
  // Belt and braces: the schema already rejects em dashes in the script.
  return md.split(EM_DASH).join(",");
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const styles = `
:root {
  --bg: #f6f7f9; --panel: #ffffff; --text: #16181d; --muted: #5b6270; --border: #dde1e7;
  --code-bg: #f0f2f5; --accent: #2457d6; --accent-text: #ffffff; --warn-bg: #fff6e0; --warn-border: #e8c56a;
  --ok: #1f8a4c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #111317; --panel: #1a1d23; --text: #e8eaee; --muted: #9aa1ad; --border: #2c313a;
    --code-bg: #12151a; --accent: #6b93ff; --accent-text: #0b0d10; --warn-bg: #2d2615; --warn-border: #6b5622;
    --ok: #4cc27f;
  }
}
:root[data-theme="dark"] {
  --bg: #111317; --panel: #1a1d23; --text: #e8eaee; --muted: #9aa1ad; --border: #2c313a;
  --code-bg: #12151a; --accent: #6b93ff; --accent-text: #0b0d10; --warn-bg: #2d2615; --warn-border: #6b5622;
  --ok: #4cc27f;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 820px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 20px; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
nav a { color: var(--accent); text-decoration: none; border: 1px solid var(--border); background: var(--panel); padding: 4px 12px; border-radius: 999px; font-size: 0.9rem; }
section { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; }
h2 { font-size: 1.2rem; margin: 0 0 8px; }
.intro, .note { color: var(--muted); font-size: 0.9rem; margin: 0 0 8px; }
.field { margin: 16px 0; }
.field-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.field-head h3 { font-size: 1rem; margin: 0; }
.count { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
button.copy { margin-left: auto; background: var(--accent); color: var(--accent-text); border: 0; border-radius: 8px; padding: 6px 14px; font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer; min-width: 84px; }
button.copy.done { background: var(--ok); }
pre { margin: 0; background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; white-space: pre-wrap; word-break: break-word; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.warn { background: var(--warn-bg); border: 1px solid var(--warn-border); border-radius: 12px; padding: 12px 20px; margin-bottom: 20px; }
.warn ul { margin: 4px 0 0; padding-left: 20px; }
ul.check { list-style: none; padding: 0; margin: 8px 0 0; }
ul.check li { margin: 6px 0; }
ul.check label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
ul.check input { margin-top: 5px; }
details summary { cursor: pointer; font-weight: 600; }
details p { margin: 8px 0; }
`;

const script = `
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
};
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button.copy");
  if (!button) return;
  const pre = document.getElementById(button.dataset.target);
  const ok = await copyText(pre.textContent);
  button.textContent = ok ? "Copied" : "Select and copy";
  button.classList.toggle("done", ok);
  setTimeout(() => { button.textContent = "Copy"; button.classList.remove("done"); }, 1500);
});
`;

export const renderUploadHtml = (pkg: UploadPackage): string => {
  let n = 0;
  const field = (f: UploadField): string => {
    const id = `field-${++n}`;
    return `<div class="field">
  <div class="field-head"><h3>${escapeHtml(f.label)}</h3>${f.count ? `<span class="count">${escapeHtml(f.count)}</span>` : ""}<button class="copy" type="button" data-target="${id}">Copy</button></div>
  ${f.note ? `<p class="note">${escapeHtml(f.note)}</p>` : ""}
  <pre id="${id}">${escapeHtml(f.value)}</pre>
</div>`;
  };
  const sections = pkg.sections
    .map(
      (s) => `<section id="${s.id}">
<h2>${escapeHtml(s.heading)}</h2>
${s.intro ? `<p class="intro">${escapeHtml(s.intro)}</p>` : ""}
${s.fields.length > 0 ? s.fields.map(field).join("\n") : `<p class="note">No fix code for this video.</p>`}
${
  s.checklist.length > 0
    ? `<h3>Checklist</h3><ul class="check">${s.checklist
        .map((item) => `<li><label><input type="checkbox"> <span>${escapeHtml(item)}</span></label></li>`)
        .join("")}</ul>`
    : ""
}
</section>`,
    )
    .join("\n");
  const warnings =
    pkg.warnings.length > 0
      ? `<div class="warn"><strong>Before uploading</strong><ul>${pkg.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`
      : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload: ${escapeHtml(pkg.slug)}</title>
<style>${styles}</style>
</head>
<body>
<main>
<h1>${escapeHtml(pkg.title)}</h1>
<p class="sub">Upload kit for ${escapeHtml(pkg.slug)}. Click Copy next to a field, paste it into the upload form.</p>
<nav>${pkg.sections.map((s) => `<a href="#${s.id}">${escapeHtml(s.heading)}</a>`).join("")}</nav>
${warnings}
${sections}
<section>
<details><summary>Transcript</summary>${pkg.transcript.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</details>
</section>
</main>
<script>${script}</script>
</body>
</html>
`;
  return stripEmDashes(html);
};
