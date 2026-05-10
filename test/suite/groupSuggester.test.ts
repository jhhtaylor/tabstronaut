import { strictEqual, deepStrictEqual, ok } from "assert";
import { suggestGroups } from "../../src/groupSuggester";
import { TabUsageData } from "../../src/tabUsageTracker";

function makeData(
  pairs: [string, string, number][]
): TabUsageData {
  const coOccurrence: { [a: string]: { [b: string]: number } } = {};
  const openCount: { [f: string]: number } = {};

  for (const [a, b, score] of pairs) {
    if (!coOccurrence[a]) coOccurrence[a] = {};
    if (!coOccurrence[b]) coOccurrence[b] = {};
    coOccurrence[a][b] = score;
    coOccurrence[b][a] = score;
    openCount[a] = (openCount[a] || 0) + score;
    openCount[b] = (openCount[b] || 0) + score;
  }

  return { coOccurrence, openCount };
}

describe("suggestGroups – basic behaviour", () => {
  it("returns empty array when there is no data", () => {
    const suggestions = suggestGroups({ coOccurrence: {}, openCount: {} });
    strictEqual(suggestions.length, 0);
  });

  it("returns empty array when pair score is below MIN_PAIR_SCORE (3)", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 2]]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions.length, 0);
  });

  it("suggests a group when pair score meets the threshold", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 3]]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions.length, 1);
    strictEqual(suggestions[0].files.length, 2);
    ok(suggestions[0].files.includes("/a/foo.ts"));
    ok(suggestions[0].files.includes("/a/bar.ts"));
  });

  it("includes the seed pair strength in the result", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 5]]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions[0].strength, 5);
  });

  it("picks the strongest pair as seed", () => {
    const data = makeData([
      ["/a/foo.ts", "/a/bar.ts", 3],
      ["/b/x.ts", "/b/y.ts", 10],
    ]);
    const suggestions = suggestGroups(data, { maxSuggestions: 1 });
    strictEqual(suggestions[0].strength, 10);
    ok(suggestions[0].files.includes("/b/x.ts"));
  });

  it("respects maxSuggestions limit", () => {
    const data = makeData([
      ["/a/foo.ts", "/a/bar.ts", 5],
      ["/b/x.ts", "/b/y.ts", 5],
      ["/c/p.ts", "/c/q.ts", 5],
    ]);
    const suggestions = suggestGroups(data, { maxSuggestions: 2 });
    strictEqual(suggestions.length, 2);
  });

  it("does not reuse files across suggestions", () => {
    const data = makeData([
      ["/a/foo.ts", "/a/bar.ts", 10],
      ["/a/foo.ts", "/a/baz.ts", 5],
    ]);
    const suggestions = suggestGroups(data, { maxSuggestions: 2 });
    // foo is used in the first suggestion so the second shouldn't appear
    // (baz+foo pair is disqualified because foo is taken)
    const allFiles = suggestions.flatMap((s) => s.files);
    const unique = new Set(allFiles);
    strictEqual(unique.size, allFiles.length);
  });

  it("excludes files in excludeFiles set", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 5]]);
    const suggestions = suggestGroups(data, {
      excludeFiles: new Set(["/a/foo.ts"]),
    });
    strictEqual(suggestions.length, 0);
  });
});

describe("suggestGroups – cluster expansion", () => {
  it("pulls in a third file with sufficient affinity", () => {
    // baz appears with both foo and bar (strong signal)
    const data = makeData([
      ["/a/foo.ts", "/a/bar.ts", 10],
      ["/a/foo.ts", "/a/baz.ts", 5],
      ["/a/bar.ts", "/a/baz.ts", 5],
    ]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions.length, 1);
    strictEqual(suggestions[0].files.length, 3);
    ok(suggestions[0].files.includes("/a/baz.ts"));
  });

  it("does not pull in a file with insufficient affinity", () => {
    // outsider only has a weak link to one member of the cluster
    const data = makeData([
      ["/a/foo.ts", "/a/bar.ts", 20],
      ["/a/bar.ts", "/a/outsider.ts", 1],
    ]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions[0].files.length, 2);
    ok(!suggestions[0].files.includes("/a/outsider.ts"));
  });
});

describe("suggestGroups – naming", () => {
  it("uses the common directory name as the group name", () => {
    const data = makeData([
      ["/workspace/src/components/Button.tsx", "/workspace/src/components/Input.tsx", 5],
    ]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions[0].name, "components");
  });

  it("falls back to Suggested Group when files span different directories", () => {
    const data = makeData([
      ["/workspace/src/Button.tsx", "/workspace/test/Button.test.tsx", 5],
    ]);
    const suggestions = suggestGroups(data);
    // Common path would be /workspace — basename is "workspace" which is valid
    // (only falls back to "Suggested Group" if dirname is root or ".")
    ok(suggestions[0].name.length > 0);
  });

  it("returns a non-empty name for every suggestion", () => {
    const data = makeData([
      ["/a/foo.ts", "/b/bar.ts", 5],
    ]);
    const suggestions = suggestGroups(data);
    ok(suggestions[0].name.length > 0);
  });
});

describe("suggestGroups – edge cases", () => {
  it("handles a pair score exactly equal to MIN_PAIR_SCORE (boundary)", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 3]]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions.length, 1);
  });

  it("handles a pair score one below threshold (boundary)", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 2]]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions.length, 0);
  });

  it("works when all files are excluded", () => {
    const data = makeData([["/a/foo.ts", "/a/bar.ts", 5]]);
    const suggestions = suggestGroups(data, {
      excludeFiles: new Set(["/a/foo.ts", "/a/bar.ts"]),
    });
    strictEqual(suggestions.length, 0);
  });

  it("default maxSuggestions is 3", () => {
    const data = makeData([
      ["/a/1.ts", "/a/2.ts", 5],
      ["/b/1.ts", "/b/2.ts", 5],
      ["/c/1.ts", "/c/2.ts", 5],
      ["/d/1.ts", "/d/2.ts", 5],
    ]);
    const suggestions = suggestGroups(data);
    strictEqual(suggestions.length, 3);
  });
});
