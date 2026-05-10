import * as path from "path";

export interface TabUsageData {
  coOccurrence: { [fileA: string]: { [fileB: string]: number } };
  openCount: { [filePath: string]: number };
}

export interface TabStorage {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const STORAGE_KEY = "tabUsageData";
const MAX_TRACKED_FILES = 500;

export class TabUsageTracker {
  private lastSnapshotHash: string | undefined;

  constructor(private storage: TabStorage) {}

  getData(): TabUsageData {
    return this.storage.get<TabUsageData>(STORAGE_KEY, {
      coOccurrence: {},
      openCount: {},
    });
  }

  async recordSnapshot(filePaths: string[]): Promise<void> {
    const unique = [...new Set(filePaths)].sort();
    const hash = unique.join("|");

    if (hash === this.lastSnapshotHash) {
      return;
    }
    this.lastSnapshotHash = hash;

    if (unique.length === 0) {
      return;
    }

    const data = this.getData();

    for (const file of unique) {
      data.openCount[file] = (data.openCount[file] || 0) + 1;
    }

    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i];
        const b = unique[j];
        if (!data.coOccurrence[a]) {
          data.coOccurrence[a] = {};
        }
        if (!data.coOccurrence[b]) {
          data.coOccurrence[b] = {};
        }
        data.coOccurrence[a][b] = (data.coOccurrence[a][b] || 0) + 1;
        data.coOccurrence[b][a] = (data.coOccurrence[b][a] || 0) + 1;
      }
    }

    this.pruneIfNeeded(data);
    await this.storage.update(STORAGE_KEY, data);
  }

  private pruneIfNeeded(data: TabUsageData): void {
    const files = Object.keys(data.openCount);
    if (files.length <= MAX_TRACKED_FILES) {
      return;
    }
    const sorted = [...files].sort(
      (a, b) => data.openCount[a] - data.openCount[b]
    );
    const toRemove = sorted.slice(0, files.length - MAX_TRACKED_FILES);
    for (const file of toRemove) {
      delete data.openCount[file];
      delete data.coOccurrence[file];
      for (const other of Object.keys(data.coOccurrence)) {
        delete data.coOccurrence[other][file];
      }
    }
  }

  async clear(): Promise<void> {
    this.lastSnapshotHash = undefined;
    await this.storage.update(STORAGE_KEY, { coOccurrence: {}, openCount: {} });
  }
}
