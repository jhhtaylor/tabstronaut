import { strictEqual, ok } from "assert";
import { aiEnhanceSuggestion } from "../../src/aiGroupSuggester";
import { SuggestedGroup } from "../../src/groupSuggester";

function makeSuggestion(overrides: Partial<SuggestedGroup> = {}): SuggestedGroup {
  return {
    name: "components",
    files: ["/src/Button.tsx", "/src/Input.tsx"],
    strength: 5,
    source: "heuristic",
    ...overrides,
  };
}

describe("aiEnhanceSuggestion – fallback behaviour", () => {
  // In the extension test environment there is no AI provider installed,
  // so selectChatModels() returns []. These tests verify the graceful fallback
  // path: the original suggestion is always returned unchanged.

  it("returns the original suggestion when no AI models are available", async () => {
    const original = makeSuggestion();
    const result = await aiEnhanceSuggestion(original);
    strictEqual(result.files, original.files);
    strictEqual(result.strength, original.strength);
  });

  it("never throws regardless of input", async () => {
    const cases: SuggestedGroup[] = [
      makeSuggestion(),
      makeSuggestion({ files: [] }),
      makeSuggestion({ name: "" }),
      makeSuggestion({ files: ["/a/very/deeply/nested/path/to/File.ts"] }),
    ];
    for (const s of cases) {
      let threw = false;
      try {
        await aiEnhanceSuggestion(s);
      } catch {
        threw = true;
      }
      strictEqual(threw, false, `should not throw for input: ${JSON.stringify(s)}`);
    }
  });

  it("returns a SuggestedGroup with all required fields", async () => {
    const result = await aiEnhanceSuggestion(makeSuggestion());
    ok("name" in result);
    ok("files" in result);
    ok("strength" in result);
    ok("source" in result);
  });

  it("result source is either 'ai' or 'heuristic'", async () => {
    const result = await aiEnhanceSuggestion(makeSuggestion());
    ok(result.source === "ai" || result.source === "heuristic");
  });

  it("falls back gracefully when given a suggestion with no files", async () => {
    const original = makeSuggestion({ files: [] });
    const result = await aiEnhanceSuggestion(original);
    strictEqual(result.files.length, 0);
  });
});
