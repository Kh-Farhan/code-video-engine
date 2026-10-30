import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScriptYaml, slugFromPath } from "../src/cli/loadScript";
import { parseScript, sceneTypes, type Script } from "../src/schema/script";

const examplePath = join(__dirname, "..", "scripts", "example-usememo.yaml");

const validScript = (): Script => ({
  title: "Test",
  scenes: [
    { type: "title", heading: "Hello", narration: "Hello there." },
    {
      type: "code",
      language: "typescript",
      code: "const a = 1;\nconst b = 2;\n",
      highlight: [{ from: 1, to: 2 }],
      narration: "Some code.",
    },
  ],
});

/** Parses and returns the error lines, failing the test if parsing succeeded. */
const errorsFor = (input: unknown): string[] => {
  const result = parseScript(input);
  if (result.success) throw new Error("expected script to be invalid");
  return result.errors;
};

describe("example-usememo.yaml", () => {
  const result = parseScriptYaml(readFileSync(examplePath, "utf8"));

  it("passes validation", () => {
    expect(result.success ? [] : result.errors).toEqual([]);
  });

  it("has 5 to 7 scenes and uses every scene type", () => {
    if (!result.success) throw new Error("invalid");
    const { scenes } = result.data;
    expect(scenes.length).toBeGreaterThanOrEqual(5);
    expect(scenes.length).toBeLessThanOrEqual(7);
    expect(new Set(scenes.map((s) => s.type))).toEqual(new Set(sceneTypes));
  });

  it("derives the slug from the file name", () => {
    expect(slugFromPath(examplePath)).toBe("example-usememo");
  });
});

describe("every script in scripts/", () => {
  const dir = join(__dirname, "..", "scripts");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));

  it("includes the examples", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "example-usememo.yaml",
        "nextjs-server-vs-client-components.yaml",
        "shopify-storefront-cart-resets.yaml",
      ]),
    );
  });

  it.each(files)("%s is valid with a kebab-case name", (file) => {
    const result = parseScriptYaml(readFileSync(join(dir, file), "utf8"));
    expect(result.success ? [] : result.errors).toEqual([]);
    expect(slugFromPath(file)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("invalid scripts fail with useful errors", () => {
  it("accepts a minimal valid script", () => {
    expect(parseScript(validScript())).toMatchObject({ success: true });
  });

  it("reports unknown languages with the scene path", () => {
    const script = validScript();
    const errors = errorsFor({
      ...script,
      scenes: [script.scenes[0], { ...script.scenes[1], language: "ts" }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^scenes\[1\]\.language: /);
  });

  it("reports a missing narration", () => {
    expect(errorsFor({ title: "T", scenes: [{ type: "title", heading: "H" }] })).toEqual([
      expect.stringMatching(/^scenes\[0\]\.narration: /),
    ]);
  });

  it("reports an unknown scene type", () => {
    const errors = errorsFor({
      title: "T",
      scenes: [{ type: "video", narration: "Hi." }],
    });
    expect(errors[0]).toMatch(/^scenes\[0\]\.type: /);
  });

  it("rejects misspelled fields instead of ignoring them", () => {
    const errors = errorsFor({
      title: "T",
      scenes: [
        {
          type: "code",
          language: "tsx",
          code: "x",
          hightlight: [{ from: 1, to: 1 }],
          narration: "Hi.",
        },
      ],
    });
    expect(errors.join("\n")).toContain("hightlight");
  });

  it("rejects highlight ranges outside the code", () => {
    const errors = errorsFor({
      title: "T",
      scenes: [
        {
          type: "code",
          language: "tsx",
          code: "a\nb\nc\n",
          highlight: [{ from: 2, to: 9 }],
          narration: "Hi.",
        },
      ],
    });
    expect(errors).toEqual([
      "scenes[0].highlight[0]: lines 2-9 are outside the code (3 lines)",
    ]);
  });

  it("rejects backwards highlight ranges", () => {
    const errors = errorsFor({
      title: "T",
      scenes: [
        {
          type: "code",
          language: "tsx",
          code: "a\nb\nc",
          highlight: [{ from: 3, to: 1 }],
          narration: "Hi.",
        },
      ],
    });
    expect(errors[0]).toMatch(/^scenes\[0\]\.highlight\[0\]: `to` must be/);
  });

  it("rejects lists with more than 4 items", () => {
    const errors = errorsFor({
      title: "T",
      scenes: [
        { type: "list", items: ["a", "b", "c", "d", "e"], narration: "Hi." },
      ],
    });
    expect(errors).toEqual(["scenes[0].items: a list has at most 4 items"]);
  });

  it("rejects em dashes in user-facing text", () => {
    const errors = errorsFor({
      title: "T",
      scenes: [{ type: "text", text: "Fast — but wrong", narration: "Hi." }],
    });
    expect(errors).toEqual([
      "scenes[0].text: must not contain em dashes (use a comma, colon, or period)",
    ]);
  });

  it("rejects an empty scene list", () => {
    expect(errorsFor({ title: "T", scenes: [] })).toEqual([
      "scenes: a script needs at least one scene",
    ]);
  });

  it("reports YAML syntax errors", () => {
    const result = parseScriptYaml("title: [unclosed");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/^\(yaml\): /);
  });
});
