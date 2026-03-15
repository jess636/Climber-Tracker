/**
 * Diff engine for detecting score/rank changes between polling intervals.
 */

export interface ResultSnapshot {
  climberId: string;
  climberName: string;
  rank?: number;
  scores: Record<string, string | number | null>;
}

export interface ResultChange {
  climberId: string;
  climberName: string;
  field: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
}

/**
 * Compare two snapshots of results and return the changes.
 */
export function diffResults(
  previous: ResultSnapshot[],
  current: ResultSnapshot[]
): ResultChange[] {
  const changes: ResultChange[] = [];
  const prevMap = new Map(previous.map((r) => [r.climberId, r]));

  for (const curr of current) {
    const prev = prevMap.get(curr.climberId);
    if (!prev) {
      // New climber appeared in results
      changes.push({
        climberId: curr.climberId,
        climberName: curr.climberName,
        field: "appeared",
        oldValue: null,
        newValue: curr.rank ?? "new",
      });
      continue;
    }

    // Check rank change
    if (prev.rank !== curr.rank) {
      changes.push({
        climberId: curr.climberId,
        climberName: curr.climberName,
        field: "rank",
        oldValue: prev.rank,
        newValue: curr.rank,
      });
    }

    // Check score changes
    const allScoreKeys = new Set([
      ...Object.keys(prev.scores),
      ...Object.keys(curr.scores),
    ]);
    for (const key of allScoreKeys) {
      if (prev.scores[key] !== curr.scores[key]) {
        changes.push({
          climberId: curr.climberId,
          climberName: curr.climberName,
          field: `score.${key}`,
          oldValue: prev.scores[key],
          newValue: curr.scores[key],
        });
      }
    }
  }

  return changes;
}
