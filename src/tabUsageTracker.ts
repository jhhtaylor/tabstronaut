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
const DISMISSED_KEY = "dismissedSuggestions";
const MAX_TRACKED_FILES = 500;
const DISMISSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface DismissalRecord {
  [fileKey: string]: number; // Unix timestamp of dismissal
}

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

  async handleFileRename(oldPath: string, newPath: string): Promise<void> {
    const data = this.getData();
    let changed = false;

    if (oldPath in data.openCount) {
      data.openCount[newPath] = data.openCount[oldPath];
      delete data.openCount[oldPath];
      changed = true;
    }

    if (oldPath in data.coOccurrence) {
      data.coOccurrence[newPath] = data.coOccurrence[oldPath];
      delete data.coOccurrence[oldPath];
      changed = true;
    }

    for (const key of Object.keys(data.coOccurrence)) {
      if (oldPath in data.coOccurrence[key]) {
        data.coOccurrence[key][newPath] = data.coOccurrence[key][oldPath];
        delete data.coOccurrence[key][oldPath];
        changed = true;
      }
    }

    if (changed) {
      // Invalidate the snapshot hash so the renamed path is recorded correctly
      this.lastSnapshotHash = undefined;
      await this.storage.update(STORAGE_KEY, data);
    }
  }

  async recordDismissal(fileKey: string): Promise<void> {
    const record = this.storage.get<DismissalRecord>(DISMISSED_KEY, {});
    record[fileKey] = Date.now();
    // Prune expired entries while we have the record open
    const cutoff = Date.now() - DISMISSAL_COOLDOWN_MS;
    for (const key of Object.keys(record)) {
      if (record[key] < cutoff) {
        delete record[key];
      }
    }
    await this.storage.update(DISMISSED_KEY, record);
  }

  isDismissed(fileKey: string): boolean {
    const record = this.storage.get<DismissalRecord>(DISMISSED_KEY, {});
    const ts = record[fileKey];
    return ts !== undefined && Date.now() - ts < DISMISSAL_COOLDOWN_MS;
  }

  async clear(): Promise<void> {
    this.lastSnapshotHash = undefined;
    await this.storage.update(STORAGE_KEY, { coOccurrence: {}, openCount: {} });
    await this.storage.update(DISMISSED_KEY, {});
  }
}
