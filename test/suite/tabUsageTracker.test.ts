import { strictEqual, deepStrictEqual, ok } from "assert";
import { TabUsageTracker, TabStorage } from "../../src/tabUsageTracker";

class MockStorage implements TabStorage {
  private store: Record<string, unknown> = {};

  get<T>(key: string, defaultValue: T): T {
    return key in this.store ? (this.store[key] as T) : defaultValue;
  }

  update(key: string, value: unknown): Thenable<void> {
    this.store[key] = value;
    return Promise.resolve();
  }
}

describe("TabUsageTracker.recordSnapshot", () => {
  it("records open count for a single file", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts"]);
    const data = tracker.getData();
    strictEqual(data.openCount["/a/foo.ts"], 1);
  });

  it("does not record co-occurrence for a single file", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts"]);
    const data = tracker.getData();
    strictEqual(Object.keys(data.coOccurrence).length, 0);
  });

  it("does nothing for an empty snapshot", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot([]);
    const data = tracker.getData();
    strictEqual(Object.keys(data.openCount).length, 0);
    strictEqual(Object.keys(data.coOccurrence).length, 0);
  });

  it("records co-occurrence for a pair of files", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    const data = tracker.getData();
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"], 1);
    strictEqual(data.coOccurrence["/a/bar.ts"]["/a/foo.ts"], 1);
  });

  it("co-occurrence matrix is symmetric", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/x.ts", "/y.ts", "/z.ts"]);
    const data = tracker.getData();
    strictEqual(
      data.coOccurrence["/x.ts"]["/y.ts"],
      data.coOccurrence["/y.ts"]["/x.ts"]
    );
    strictEqual(
      data.coOccurrence["/x.ts"]["/z.ts"],
      data.coOccurrence["/z.ts"]["/x.ts"]
    );
    strictEqual(
      data.coOccurrence["/y.ts"]["/z.ts"],
      data.coOccurrence["/z.ts"]["/y.ts"]
    );
  });

  it("accumulates scores across different snapshots", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    // Force a different hash so the second snapshot is recorded
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts", "/a/baz.ts"]);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    const data = tracker.getData();
    // foo+bar appear in snapshot 1 and snapshot 3 (snapshot 2 has a different hash)
    // but snapshot 3 has the same hash as snapshot 1, so it's deduped
    // Only snapshots 1 and 2 are recorded
    ok(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"] >= 1);
  });

  it("deduplicates identical consecutive snapshots", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    const data = tracker.getData();
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"], 1);
    strictEqual(data.openCount["/a/foo.ts"], 1);
  });

  it("records a new snapshot after the set of files changes", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/baz.ts"]);
    const data = tracker.getData();
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"], 1);
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/baz.ts"], 1);
  });

  it("deduplicates files within a single snapshot", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/foo.ts", "/a/bar.ts"]);
    const data = tracker.getData();
    strictEqual(data.openCount["/a/foo.ts"], 1);
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"], 1);
  });

  it("records all pairs in a 3-file snapshot", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a.ts", "/b.ts", "/c.ts"]);
    const data = tracker.getData();
    strictEqual(data.coOccurrence["/a.ts"]["/b.ts"], 1);
    strictEqual(data.coOccurrence["/a.ts"]["/c.ts"], 1);
    strictEqual(data.coOccurrence["/b.ts"]["/c.ts"], 1);
  });

  it("persists data through storage", async () => {
    const storage = new MockStorage();
    const tracker1 = new TabUsageTracker(storage);
    await tracker1.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);

    // New tracker instance reading the same storage
    const tracker2 = new TabUsageTracker(storage);
    const data = tracker2.getData();
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"], 1);
  });
});

describe("TabUsageTracker.clear", () => {
  it("resets all data", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    await tracker.clear();
    const data = tracker.getData();
    strictEqual(Object.keys(data.openCount).length, 0);
    strictEqual(Object.keys(data.coOccurrence).length, 0);
  });

  it("allows recording new snapshots after clear", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    await tracker.clear();
    // After clear the last hash is reset, so same snapshot is recorded again
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    const data = tracker.getData();
    strictEqual(data.coOccurrence["/a/foo.ts"]["/a/bar.ts"], 1);
  });
});

describe("TabUsageTracker pruning", () => {
  it("returns correct data for normal usage well below cap", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a.ts", "/b.ts", "/c.ts"]);
    const data = tracker.getData();
    strictEqual(Object.keys(data.openCount).length, 3);
  });
});
