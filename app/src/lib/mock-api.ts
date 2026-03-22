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

// --- Live simulation for round 11632 ---
// Progressively advances unranked athletes through boulder attempts.
// Each call to mockGetRoundResults(11632) advances the simulation by one step.

interface SimAscent {
  route_id: number;
  route_name: string;
  top: boolean;
  top_tries: number | null;
  zone: boolean;
  zone_tries: number | null;
  low_zone: boolean;
  low_zone_tries: number | null;
  points: number;
  modified: string;
  status: string;
}

interface SimAthlete {
  athlete_id: number;
  name: string;
  firstname: string;
  lastname: string;
  country: string;
  flag_url: null;
  federation_id: number | null;
  bib: string;
  rank: number;
  score: string;
  start_order: number;
  extra_advancement: boolean;
  ascents: SimAscent[];
  combined_stages: never[];
  active: boolean;
  under_appeal: boolean;
}

// Predetermined outcomes per athlete — modeled on real patterns from fixture data.
// Each entry is [top, zone, low_zone, tries] per route.
const SIM_OUTCOMES: [boolean, boolean, boolean, number][][] = [
  // Athlete 0: strong climber
  [[true, true, true, 1], [true, true, true, 2], [false, true, true, 4], [true, true, true, 1]],
  // Athlete 1: mid-range
  [[false, true, true, 3], [true, true, true, 1], [false, false, true, 5], [false, true, true, 2]],
  // Athlete 2: zones but few tops
  [[false, true, true, 2], [false, false, true, 3], [true, true, true, 3], [false, false, false, 5]],
  // Athlete 3: mostly low zones
  [[false, false, true, 4], [false, true, true, 2], [false, false, true, 3], [false, false, false, 5]],
  // Athlete 4: one top, rest struggle
  [[true, true, true, 2], [false, false, false, 5], [false, false, true, 4], [false, true, true, 3]],
  // Athlete 5: consistent zones
  [[false, true, true, 1], [false, true, true, 1], [false, true, true, 2], [false, true, true, 1]],
  // Athlete 6: flash one, struggle rest
  [[true, true, true, 1], [false, false, false, 5], [false, false, false, 5], [false, false, true, 4]],
  // Athlete 7: all low zones
  [[false, false, true, 3], [false, false, true, 2], [false, false, true, 4], [false, false, true, 3]],
  // Athlete 8: surprise top late
  [[false, false, false, 5], [false, false, true, 3], [false, true, true, 2], [true, true, true, 1]],
  // Athlete 9: nothing
  [[false, false, false, 5], [false, false, false, 5], [false, false, true, 4], [false, false, false, 5]],
  // Athlete 10: solid
  [[true, true, true, 2], [false, true, true, 1], [true, true, true, 4], [false, false, true, 3]],
];

// Points lookup matching real USAC scoring
function simPoints(top: boolean, zone: boolean, lowZone: boolean, tries: number): number {
  if (top) return 25 + Math.max(0, 10 - tries);
  if (zone) return 10 + Math.max(0, 5 - tries);
  if (lowZone) return 5 + Math.max(0, 3 - tries);
  return 0;
}

let simStep = 0;
const simStartTime = Date.now();

function simulateRound11632(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = structuredClone(round11632) as any;

  // Get unranked athletes from startlist
  const rankedIds = new Set(base.ranking.map((a: SimAthlete) => a.athlete_id));
  const unranked = base.startlist.filter((s: { athlete_id: number }) => !rankedIds.has(s.athlete_id));

  // Each step: one athlete completes one route attempt.
  // Total steps = unranked.length * routes.length = 11 * 4 = 44
  const routes = base.routes;
  const totalStepsPerAthlete = routes.length;
  const step = simStep++;

  for (let i = 0; i < unranked.length; i++) {
    const entry = unranked[i];
    const outcomes = SIM_OUTCOMES[i % SIM_OUTCOMES.length];
    const athleteStep = step - i * 2; // stagger: each athlete starts 2 steps after previous

    if (athleteStep < 0) continue; // hasn't started yet

    const completedRoutes = Math.min(Math.floor(athleteStep / 2), totalStepsPerAthlete);
    const onRoute = Math.min(Math.floor(athleteStep / 2), totalStepsPerAthlete - 1);
    const isActive = athleteStep >= 0 && completedRoutes < totalStepsPerAthlete && athleteStep % 2 === 0;

    if (completedRoutes === 0 && !isActive) continue;

    // Build ascents
    const ascents: SimAscent[] = [];
    let totalPoints = 0;

    for (let r = 0; r < totalStepsPerAthlete; r++) {
      const route = routes[r];
      const [top, zone, lowZone, tries] = outcomes[r];

      if (r < completedRoutes) {
        // Completed route
        const pts = simPoints(top, zone, lowZone, tries);
        totalPoints += pts;
        const modifiedMs = simStartTime + (i * 2 + r * 2 + 1) * 30_000;
        ascents.push({
          route_id: route.id,
          route_name: route.name,
          top, top_tries: tries,
          zone, zone_tries: zone ? Math.min(tries, 2) : null,
          low_zone: lowZone, low_zone_tries: lowZone ? 1 : null,
          points: pts,
          modified: new Date(modifiedMs).toISOString().replace("T", " ").replace("Z", " +00:00"),
          status: "confirmed",
        });
      } else if (r === onRoute && isActive) {
        // Currently on wall
        const modifiedMs = simStartTime + (i * 2 + r * 2) * 30_000;
        ascents.push({
          route_id: route.id,
          route_name: route.name,
          top: false, top_tries: null,
          zone: false, zone_tries: null,
          low_zone: false, low_zone_tries: null,
          points: 0,
          modified: new Date(modifiedMs).toISOString().replace("T", " ").replace("Z", " +00:00"),
          status: "active",
        });
      }
    }

    if (ascents.length === 0) continue;

    // Add to ranking
    base.ranking.push({
      athlete_id: entry.athlete_id,
      name: entry.name,
      firstname: entry.firstname,
      lastname: entry.lastname,
      country: entry.country,
      flag_url: null,
      federation_id: entry.federation_id,
      bib: entry.bib,
      rank: 0, // will be sorted below
      score: totalPoints.toFixed(1),
      start_order: i + 16,
      extra_advancement: false,
      ascents,
      combined_stages: [],
      active: isActive,
      under_appeal: false,
    });
  }

  // Re-rank by score descending
  base.ranking.sort((a: SimAthlete, b: SimAthlete) => parseFloat(b.score) - parseFloat(a.score));
  base.ranking.forEach((a: SimAthlete, idx: number) => { a.rank = idx + 1; });

  return base;
}

export async function mockGetRoundResults(roundId: number): Promise<unknown> {
  await delay();
  if (roundId === 11632) {
    return simulateRound11632();
  }
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
