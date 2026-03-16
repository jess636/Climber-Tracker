/**
 * Mock API layer for testing without hitting USAC.
 *
 * Enable with MOCK_MODE=true
 *
 * Each round ID has its own fixture file with unique athletes per category.
 * Fixture states:
 *   11629 F-13    finished     11633 M/O-13  finished
 *   11630 F-15    finished     11634 M/O-15  just started
 *   11631 F-17    finished     11635 M/O-17  not started
 *   11632 F-19    active       11636 M/O-19  not started
 *                              11637 U-11    finished
 */

import eventFixture from "./fixtures/event.json";
import round11629 from "./fixtures/round-11629.json";
import round11630 from "./fixtures/round-11630.json";
import round11631 from "./fixtures/round-11631.json";
import round11632 from "./fixtures/round-11632.json";
import round11633 from "./fixtures/round-11633.json";
import round11634 from "./fixtures/round-11634.json";
import round11635 from "./fixtures/round-11635.json";
import round11636 from "./fixtures/round-11636.json";
import round11637 from "./fixtures/round-11637.json";

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

const roundFixtures: Record<number, unknown> = {
  11629: round11629,
  11630: round11630,
  11631: round11631,
  11632: round11632,
  11633: round11633,
  11634: round11634,
  11635: round11635,
  11636: round11636,
  11637: round11637,
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
  const fixture = roundFixtures[roundId];
  if (!fixture) {
    throw new Error(`No mock fixture for round ${roundId}`);
  }
  return structuredClone(fixture);
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
