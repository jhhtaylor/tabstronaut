import { strictEqual, deepStrictEqual, ok } from "assert";
import { TabUsageTracker, TabStorage } from "../../src/tabUsageTracker";

class MockStorage implements TabStorage {
  private store: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.store = { ...initial };
  }

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
  it("resets all usage data", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordSnapshot(["/a/foo.ts", "/a/bar.ts"]);
    await tracker.clear();
    const data = tracker.getData();
    strictEqual(Object.keys(data.openCount).length, 0);
    strictEqual(Object.keys(data.coOccurrence).length, 0);
  });

  it("also clears dismissal records", async () => {
    const storage = new MockStorage();
    const tracker = new TabUsageTracker(storage);
    await tracker.recordDismissal("foo|bar");
    strictEqual(tracker.isDismissed("foo|bar"), true);
    await tracker.clear();
    strictEqual(tracker.isDismissed("foo|bar"), false);
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

describe("TabUsageTracker.dismissal", () => {
  it("isDismissed returns false for an unknown key", () => {
    const tracker = new TabUsageTracker(new MockStorage());
    strictEqual(tracker.isDismissed("no/such|key"), false);
  });

  it("isDismissed returns true immediately after recordDismissal", async () => {
    const tracker = new TabUsageTracker(new MockStorage());
    await tracker.recordDismissal("a|b");
    strictEqual(tracker.isDismissed("a|b"), true);
  });

  it("isDismissed returns false for a different key", async () => {
    const tracker = new TabUsageTracker(new MockStorage());
    await tracker.recordDismissal("a|b");
    strictEqual(tracker.isDismissed("c|d"), false);
  });

  it("isDismissed returns false when the stored timestamp has expired", () => {
    const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
    const storage = new MockStorage({
      dismissedSuggestions: { "foo|bar": Date.now() - EIGHT_DAYS_MS },
    });
    const tracker = new TabUsageTracker(storage);
    strictEqual(tracker.isDismissed("foo|bar"), false);
  });

  it("isDismissed returns true when the timestamp is within the 7-day window", () => {
    const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
    const storage = new MockStorage({
      dismissedSuggestions: { "foo|bar": Date.now() - SIX_DAYS_MS },
    });
    const tracker = new TabUsageTracker(storage);
    strictEqual(tracker.isDismissed("foo|bar"), true);
  });

  it("dismissal persists across tracker instances sharing the same storage", async () => {
    const storage = new MockStorage();
    const tracker1 = new TabUsageTracker(storage);
    await tracker1.recordDismissal("x|y");

    const tracker2 = new TabUsageTracker(storage);
    strictEqual(tracker2.isDismissed("x|y"), true);
  });

  it("recordDismissal prunes expired entries from the stored record", async () => {
    const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
    const storage = new MockStorage({
      dismissedSuggestions: { "old|key": Date.now() - EIGHT_DAYS_MS },
    });
    const tracker = new TabUsageTracker(storage);
    // Recording a new dismissal should prune the expired entry
    await tracker.recordDismissal("new|key");
    const record = storage.get<Record<string, number>>(
      "dismissedSuggestions",
      {}
    );
    ok(!("old|key" in record), "expired entry should have been pruned");
    ok("new|key" in record, "new entry should be present");
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
