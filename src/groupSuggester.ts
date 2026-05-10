import * as path from "path";
import { TabUsageData } from "./tabUsageTracker";

export interface SuggestedGroup {
  name: string;
  files: string[];
  /** co-occurrence score of the seed pair that started this cluster */
  strength: number;
}

/** Minimum times two files must have been open together to form a seed pair */
const MIN_PAIR_SCORE = 3;

/**
 * A candidate file must have at least this fraction of the seed pair's score
 * in average affinity to the cluster in order to join it.
 */
const AFFINITY_RATIO = 0.25;

export interface SuggestOptions {
  excludeFiles?: Set<string>;
  maxSuggestions?: number;
}

/**
 * Returns suggested tab groups based on file co-occurrence data.
 * Groups are built by finding the strongest co-occurring pairs and
 * greedily expanding each cluster with files that have sufficient affinity.
 */
export function suggestGroups(
  data: TabUsageData,
  options: SuggestOptions = {}
): SuggestedGroup[] {
  const { excludeFiles = new Set(), maxSuggestions = 3 } = options;
  const { coOccurrence } = data;

  // Collect all pairs above the minimum threshold
  const pairs: { a: string; b: string; score: number }[] = [];
  for (const a of Object.keys(coOccurrence)) {
    if (excludeFiles.has(a)) {
      continue;
    }
    for (const b of Object.keys(coOccurrence[a])) {
      if (excludeFiles.has(b) || a >= b) {
        continue;
      }
      const score = coOccurrence[a][b];
      if (score >= MIN_PAIR_SCORE) {
        pairs.push({ a, b, score });
      }
    }
  }

  if (pairs.length === 0) {
    return [];
  }

  pairs.sort((x, y) => y.score - x.score);

  const suggestions: SuggestedGroup[] = [];
  const usedFiles = new Set<string>();

  for (const { a, b, score } of pairs) {
    if (suggestions.length >= maxSuggestions) {
      break;
    }
    if (usedFiles.has(a) || usedFiles.has(b)) {
      continue;
    }

    const cluster = new Set([a, b]);
    const threshold = score * AFFINITY_RATIO;

    // Seed the candidate pool from the neighbors of both seed files
    const candidates = new Set<string>();
    for (const seedFile of [a, b]) {
      for (const neighbor of Object.keys(coOccurrence[seedFile] || {})) {
        if (
          !cluster.has(neighbor) &&
          !excludeFiles.has(neighbor) &&
          !usedFiles.has(neighbor)
        ) {
          candidates.add(neighbor);
        }
      }
    }

    // Greedily expand: keep adding candidates with enough affinity to the cluster
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of Array.from(candidates)) {
        const affinity =
          Array.from(cluster).reduce(
            (sum, member) => sum + (coOccurrence[candidate]?.[member] || 0),
            0
          ) / cluster.size;

        if (affinity >= threshold) {
          cluster.add(candidate);
          candidates.delete(candidate);
          for (const neighbor of Object.keys(coOccurrence[candidate] || {})) {
            if (
              !cluster.has(neighbor) &&
              !excludeFiles.has(neighbor) &&
              !usedFiles.has(neighbor)
            ) {
              candidates.add(neighbor);
            }
          }
          changed = true;
        }
      }
    }

    const files = Array.from(cluster);
    for (const f of files) {
      usedFiles.add(f);
    }

    suggestions.push({ name: deriveGroupName(files), files, strength: score });
  }

  return suggestions;
}

function deriveGroupName(files: string[]): string {
  if (files.length === 0) {
    return "New Group";
  }

  const dirs = files.map((f) => path.dirname(f));
  const common = findCommonPath(dirs);

  if (common) {
    const name = path.basename(common);
    if (name && name !== "." && name !== "/") {
      return name;
    }
  }

  return "Suggested Group";
}

function findCommonPath(paths: string[]): string {
  if (paths.length === 0) {
    return "";
  }
  const sep = path.sep;
  const split = paths.map((p) => p.split(sep));
  const minLen = Math.min(...split.map((s) => s.length));

  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const segment = split[0][i];
    if (split.every((s) => s[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.join(sep);
}
