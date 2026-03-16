/**
 * USA Climbing API client
 *
 * The USAC results site (usac.results.info) is a Rails + Vue SPA.
 * API endpoints require a session cookie + CSRF token obtained by
 * first loading any HTML page, then passing those credentials
 * on subsequent JSON requests.
 *
 * Discovered endpoints:
 *   GET /api/v1/              — seasons list + current season
 *   GET /api/v1/live           — currently live events
 *   GET /api/v1/seasons/:id    — events for a season
 *   GET /api/v1/events/:id     — event detail (categories, rounds)
 *   GET /api/v1/category_rounds/:id/results — round results + rankings
 *   GET /api/v1/events/:id/registrations    — event registrations
 *   GET /api/v1/routes/:id/results          — per-route results
 *   GET /api/v1/routes/:id/startlist        — startlist for a route
 */

const USAC_BASE = "https://usac.results.info";

// --- Session management ---

interface USACSession {
  cookie: string;
  csrfToken: string;
  obtainedAt: number;
}

let cachedSession: USACSession | null = null;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- Response cache ---

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 15 * 1000; // 15 seconds — fresh enough for live events

function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data as T;
  }
  responseCache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  responseCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Get a valid session by loading an HTML page and extracting
 * the session cookie + CSRF token.
 */
async function getSession(): Promise<USACSession> {
  if (
    cachedSession &&
    Date.now() - cachedSession.obtainedAt < SESSION_TTL_MS
  ) {
    return cachedSession;
  }

  // Load any public page to get session cookie + CSRF token
  const res = await fetch(`${USAC_BASE}/event/475`, {
    redirect: "follow",
  });

  // Extract session cookie from set-cookie header
  const setCookieHeader = res.headers.get("set-cookie") || "";
  const sessionMatch = setCookieHeader.match(
    /(_usac_resultservice_session=[^;]+)/
  );
  const cookie = sessionMatch ? sessionMatch[1] : "";

  // Extract CSRF token from HTML
  const html = await res.text();
  const csrfMatch = html.match(/csrf-token"\s+content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  cachedSession = {
    cookie,
    csrfToken,
    obtainedAt: Date.now(),
  };

  return cachedSession;
}

/**
 * Make an authenticated API request to USAC.
 */
async function usacApiFetch<T = unknown>(path: string): Promise<T> {
  const cached = getCached<T>(path);
  if (cached) return cached;

  const session = await getSession();

  const res = await fetch(`${USAC_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "X-CSRF-Token": session.csrfToken,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: session.cookie,
      Referer: `${USAC_BASE}/`,
      Origin: USAC_BASE,
    },
  });

  if (!res.ok) {
    // If unauthorized, clear session cache and retry once
    if (res.status === 401 && cachedSession) {
      cachedSession = null;
      const retrySession = await getSession();
      const retryRes = await fetch(`${USAC_BASE}${path}`, {
        headers: {
          Accept: "application/json",
          "X-CSRF-Token": retrySession.csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          Cookie: retrySession.cookie,
          Referer: `${USAC_BASE}/`,
          Origin: USAC_BASE,
        },
      });
      if (!retryRes.ok) {
        throw new Error(`USAC API error: ${retryRes.status} on ${path}`);
      }
      const retryData = await retryRes.json() as T;
      setCache(path, retryData);
      return retryData;
    }
    throw new Error(`USAC API error: ${res.status} on ${path}`);
  }

  const data = await res.json() as T;
  setCache(path, data);
  return data;
}

// --- Public API ---

// Types based on actual API responses

export interface USACSeason {
  id: number;
  name: string;
}

export interface USACSeasonResponse {
  current: USACSeason;
  seasons: USACSeason[];
}

export interface USACLiveEvent {
  category_round_id: number;
  event_id: number;
  discipline_kind: string;
  category: string;
  round_name: string;
  event_name: string;
  local_start_date: string;
  local_end_date: string;
  event_location: string;
}

export interface USACLiveResponse {
  live: USACLiveEvent[];
}

export interface USACSeasonEvents {
  events: USACEventSummary[];
}

export interface USACEventSummary {
  id: number;
  name: string;
  local_start_date: string;
  local_end_date: string;
  location: string;
}

export interface USACRoute {
  id: number;
  name: string;
  startlist: string;
  ranking: string;
}

export interface USACCategoryRoundRef {
  category_round_id: number;
  kind: string;
  name: string;
  category: string;
  status: string;
  status_as_of: string;
  result_url: string;
  format: string;
  routes: USACRoute[];
}

export interface USACDCat {
  dcat_id: number;
  event_id: number;
  dcat_name: string;
  discipline_kind: string;
  category_name: string;
  status: string;
  status_as_of: string;
  category_rounds: USACCategoryRoundRef[];
}

export interface USACEvent {
  id: number;
  name: string;
  type: string;
  starts_at: string;
  ends_at: string;
  local_start_date: string;
  local_end_date: string;
  location: string;
  country: string;
  d_cats: USACDCat[];
  public_information: {
    organiser_name: string;
    organiser_url: string;
    venue_name: string;
    description: string;
  };
}

export interface USACAscent {
  route_id: number;
  route_name: string;
  top: boolean;
  score: string;
  rank: number;
  status: string;
}

export interface USACRankedAthlete {
  athlete_id: number;
  name: string;
  firstname: string;
  lastname: string;
  country: string; // actually team/gym name
  federation_id: number;
  bib: string;
  rank: number;
  score: string;
  ascents: USACAscent[];
  active: boolean;
  under_appeal: boolean;
  qualified: boolean;
}

export interface USACRoundResults {
  id: number;
  event: string;
  event_id: number;
  discipline: string;
  status: string;
  status_as_of: string;
  category: string;
  round: string;
  format: string;
  routes: USACRoute[];
  ranking: USACRankedAthlete[];
}

// --- Fetch functions ---

import {
  isMockMode,
  mockGetSeasons,
  mockGetLiveEvents,
  mockGetSeasonEvents,
  mockGetEvent,
  mockGetRoundResults,
} from "./mock-api";

export async function getSeasons(): Promise<USACSeasonResponse> {
  if (isMockMode()) return mockGetSeasons() as Promise<USACSeasonResponse>;
  return usacApiFetch("/api/v1/");
}

export async function getLiveEvents(): Promise<USACLiveResponse> {
  if (isMockMode()) return mockGetLiveEvents() as Promise<USACLiveResponse>;
  return usacApiFetch("/api/v1/live");
}

export async function getSeasonEvents(
  seasonId: number
): Promise<USACSeasonEvents> {
  if (isMockMode()) return mockGetSeasonEvents() as Promise<USACSeasonEvents>;
  return usacApiFetch(`/api/v1/seasons/${seasonId}`);
}

export async function getEvent(eventId: number): Promise<USACEvent> {
  if (isMockMode()) return mockGetEvent() as Promise<USACEvent>;
  return usacApiFetch(`/api/v1/events/${eventId}`);
}

export async function getRoundResults(
  categoryRoundId: number
): Promise<USACRoundResults> {
  if (isMockMode()) return mockGetRoundResults(categoryRoundId) as Promise<USACRoundResults>;
  return usacApiFetch(`/api/v1/category_rounds/${categoryRoundId}/results`);
}

export async function getEventRegistrations(
  eventId: number
): Promise<unknown> {
  return usacApiFetch(`/api/v1/events/${eventId}/registrations`);
}

export async function getRouteResults(routeId: number): Promise<unknown> {
  return usacApiFetch(`/api/v1/routes/${routeId}/results`);
}

export async function getRouteStartlist(routeId: number): Promise<unknown> {
  return usacApiFetch(`/api/v1/routes/${routeId}/startlist`);
}
