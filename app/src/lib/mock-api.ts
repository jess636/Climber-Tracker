/**
 * Mock API layer for testing without hitting USAC.
 *
 * Enable with MOCK_MODE=true in .env.local
 *
 * Fixture files in src/lib/fixtures/ represent different comp states:
 *   event.json          — event overview with mixed round statuses
 *   round-not-started   — startlist only, no results
 *   round-just-started  — 3 climbers ranked, 1 actively climbing
 *   round-active        — mid-comp, some climbing, partial results
 *   round-finished      — complete results
 *
 * Round ID → fixture mapping:
 *   11635, 11636        → not-started
 *   11634               → just-started
 *   11632               → active
 *   everything else     → finished
 */

import eventFixture from "./fixtures/event.json";
import roundNotStarted from "./fixtures/round-not-started.json";
import roundJustStarted from "./fixtures/round-just-started.json";
import roundActive from "./fixtures/round-active.json";
import roundFinished from "./fixtures/round-finished.json";

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

const roundFixtureMap: Record<number, unknown> = {
  11635: roundNotStarted,
  11636: roundNotStarted,
  11634: roundJustStarted,
  11632: roundActive,
};

// Simulate network delay (50-200ms)
function delay(): Promise<void> {
  const ms = 50 + Math.random() * 150;
  return new Promise((r) => setTimeout(r, ms));
}

export async function mockGetEvent(): Promise<unknown> {
  await delay();
  return structuredClone(eventFixture);
}

export async function mockGetRoundResults(roundId: number): Promise<unknown> {
  await delay();
  const fixture = roundFixtureMap[roundId] ?? roundFinished;
  const data = structuredClone(fixture) as Record<string, unknown>;
  // Override the ID to match the requested round
  data.id = roundId;
  return data;
}

export async function mockGetSeasons(): Promise<unknown> {
  await delay();
  return {
    current: { id: 5, name: "2025-26" },
    seasons: [
      { id: 5, name: "2025-26" },
      { id: 4, name: "2024-25" },
    ],
  };
}

export async function mockGetLiveEvents(): Promise<unknown> {
  await delay();
  return {
    live: [
      {
        category_round_id: 11632,
        event_id: 503,
        discipline_kind: "boulder",
        category: "F-19",
        round_name: "Final",
        event_name: eventFixture.name,
        local_start_date: eventFixture.local_start_date,
        local_end_date: eventFixture.local_end_date,
        event_location: eventFixture.location,
      },
    ],
  };
}

export async function mockGetSeasonEvents(): Promise<unknown> {
  await delay();
  return {
    events: [
      {
        id: 503,
        name: eventFixture.name,
        local_start_date: eventFixture.local_start_date,
        local_end_date: eventFixture.local_end_date,
        location: eventFixture.location,
      },
    ],
  };
}
