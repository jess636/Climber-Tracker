"use client";

import { useEffect, useState, useCallback, useRef, Fragment, use } from "react";
import { useSearchParams } from "next/navigation";

// --- Types ---

interface Route {
  id: number;
  name: string;
}

interface CategoryRound {
  category_round_id: number;
  kind: string;
  name: string;
  category: string;
  status: string;
  format: string;
  routes: Route[];
}

interface DCat {
  dcat_id: number;
  dcat_name: string;
  discipline_kind: string;
  category_name: string;
  status: string;
  ranking_as_of: string | null;
  category_rounds: CategoryRound[];
}

interface EventData {
  id: number;
  name: string;
  location: string;
  local_start_date: string;
  local_end_date: string;
  d_cats: DCat[];
  public_information: {
    organiser_name: string;
    venue_name: string;
  };
}

interface Ascent {
  route_name: string;
  score?: string;
  rank?: number;
  top: boolean;
  status: string;
  top_tries?: number;
  zone?: boolean;
  zone_tries?: number;
  low_zone?: boolean;
  low_zone_tries?: number;
  points?: number;
  modified?: string;
}

interface Athlete {
  athlete_id: number;
  name: string;
  firstname: string;
  lastname: string;
  country: string;
  bib: string;
  rank: number;
  score: string;
  ascents: Ascent[];
  active: boolean;
  under_appeal: boolean;
  qualified: boolean;
  extra_advancement: boolean;
}

interface RouteStartPosition {
  route_name: string;
  route_id: number;
  position: number;
}

interface StartlistEntry {
  athlete_id: number;
  name: string;
  firstname: string;
  lastname: string;
  bib: string;
  country: string;
  route_start_positions: RouteStartPosition[];
}

interface RoundResults {
  id: number;
  event: string;
  discipline: string;
  status: string;
  category: string;
  round: string;
  format: string;
  ranking?: Athlete[];
  startlist?: StartlistEntry[];
  routes?: Route[];
}

interface Registration {
  athlete_id: number;
  firstname: string;
  lastname: string;
  name: string;
  gender: number;
  federation: string;
  country: string;
  d_cats: { id: number; name: string; status: string }[];
}

interface TrackedClimber {
  athlete_id: number;
  name: string;
  country: string;
}

interface TrackedRoundData {
  category: string;
  round: string;
  discipline: string;
  roundStatus: string;
  roundId: number;
  athlete: Athlete | null;
  entry: StartlistEntry | null;
  routes: Route[];
  currentPositions: Map<number, number>;
  athleteId?: number; // for registration-only entries where athlete/entry are null
}

// --- Activity History ---

interface ActivityEvent {
  id: string;
  timestamp: Date;
  athleteId: number;
  athleteName: string;
  category: string;
  type: "on_wall" | "topped" | "zone" | "low_zone" | "attempts" | "rank_change" | "appeared" | "finished";
  detail: string;
  routeName?: string;
}

function diffAthleteAscents(
  prev: Ascent[],
  curr: Ascent[],
  athleteId: number,
  athleteName: string,
  category: string,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const prevMap = new Map(prev.map((a) => [a.route_name, a]));
  const now = new Date();

  for (const ascent of curr) {
    const old = prevMap.get(ascent.route_name);
    const routeShort = ascent.route_name.replace(/.*#/, "B");
    const parsed = ascent.modified ? new Date(ascent.modified.replace(" ", "T").replace(" +", "+")) : now;
    const ts = isNaN(parsed.getTime()) ? now : parsed;

    // Newly active on wall
    if (ascent.status === "active" && old?.status !== "active") {
      events.push({
        id: `${athleteId}-${ascent.route_name}-active-${ts.getTime()}`,
        timestamp: ts,
        athleteId,
        athleteName,
        category,
        type: "on_wall",
        detail: `On wall — ${routeShort}`,
        routeName: ascent.route_name,
      });
    }

    // Topped (wasn't topped before)
    if (ascent.top && !old?.top) {
      events.push({
        id: `${athleteId}-${ascent.route_name}-top-${ts.getTime()}`,
        timestamp: ts,
        athleteId,
        athleteName,
        category,
        type: "topped",
        detail: `Topped ${routeShort} in ${ascent.top_tries}`,
        routeName: ascent.route_name,
      });
    }
    // Zone (wasn't zoned before, and not topped)
    else if (ascent.zone && !old?.zone && !ascent.top) {
      events.push({
        id: `${athleteId}-${ascent.route_name}-zone-${ts.getTime()}`,
        timestamp: ts,
        athleteId,
        athleteName,
        category,
        type: "zone",
        detail: `Zone on ${routeShort} in ${ascent.zone_tries}`,
        routeName: ascent.route_name,
      });
    }
    // Low zone (wasn't low-zoned before, and not zoned/topped)
    else if (ascent.low_zone && !old?.low_zone && !ascent.zone && !ascent.top) {
      events.push({
        id: `${athleteId}-${ascent.route_name}-lz-${ts.getTime()}`,
        timestamp: ts,
        athleteId,
        athleteName,
        category,
        type: "low_zone",
        detail: `Low zone on ${routeShort} in ${ascent.low_zone_tries}`,
        routeName: ascent.route_name,
      });
    }
    // Finished attempts with no holds (top_tries appeared, no top/zone/low_zone)
    else if (
      ascent.top_tries != null &&
      old?.top_tries == null &&
      !ascent.top && !ascent.zone && !ascent.low_zone
    ) {
      events.push({
        id: `${athleteId}-${ascent.route_name}-att-${ts.getTime()}`,
        timestamp: ts,
        athleteId,
        athleteName,
        category,
        type: "attempts",
        detail: `${ascent.top_tries} attempts on ${routeShort} — no holds`,
        routeName: ascent.route_name,
      });
    }
  }

  return events;
}

function diffTrackedActivity(
  prevBatch: Record<string, RoundResults> | null,
  currBatch: Record<string, RoundResults>,
  tracked: Map<number, TrackedClimber>,
  roundMeta: { id: number; category: string }[],
): ActivityEvent[] {
  if (!prevBatch || tracked.size === 0) return [];
  const now = new Date();
  const events: ActivityEvent[] = [];

  for (const r of roundMeta) {
    const prev = prevBatch[r.id];
    const curr = currBatch[r.id];
    if (!prev || !curr) continue;

    const prevRanking = prev.ranking ?? [];
    const currRanking = curr.ranking ?? [];
    const prevMap = new Map(prevRanking.map((a) => [a.athlete_id, a]));

    for (const [id, climber] of tracked) {
      const currAthlete = currRanking.find((a) => a.athlete_id === id);
      const prevAthlete = prevMap.get(id);

      // Best available timestamp from ascent modified fields
      // USAC format: "2026-04-12 10:30:00 +00:00" — normalize to ISO 8601
      const latestModified = currAthlete?.ascents
        ?.filter((a) => a.modified)
        .map((a) => new Date(a.modified!.replace(" ", "T").replace(" +", "+")))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? now;

      // Appeared in results
      if (currAthlete && !prevAthlete) {
        events.push({
          id: `${id}-appeared-${r.id}-${latestModified.getTime()}`,
          timestamp: latestModified,
          athleteId: id,
          athleteName: climber.name,
          category: r.category,
          type: "appeared",
          detail: `Started competing in ${r.category}`,
        });
      }

      // Ascent-level diffs
      if (currAthlete) {
        const prevAscents = prevAthlete?.ascents ?? [];
        events.push(
          ...diffAthleteAscents(prevAscents, currAthlete.ascents, id, climber.name, r.category)
        );

        // Rank change
        if (prevAthlete && prevAthlete.rank !== currAthlete.rank && currAthlete.rank > 0) {
          const wasUnranked = !prevAthlete.rank || prevAthlete.rank === 0;
          const dir = wasUnranked ? "in" : prevAthlete.rank > currAthlete.rank ? "up" : "down";
          events.push({
            id: `${id}-rank-${r.id}-${latestModified.getTime()}`,
            timestamp: latestModified,
            athleteId: id,
            athleteName: climber.name,
            category: r.category,
            type: "rank_change",
            detail: wasUnranked
              ? `Ranked #${currAthlete.rank} in ${r.category}`
              : `Moved ${dir} to #${currAthlete.rank} in ${r.category}`,
          });
        }
      }
    }
  }

  return events;
}

// --- localStorage helpers ---

function loadTracked(eventId: string): Map<number, TrackedClimber> {
  try {
    const saved = localStorage.getItem(`tracked-${eventId}`);
    if (!saved) return new Map();
    const arr: TrackedClimber[] = JSON.parse(saved);
    return new Map(arr.map((c) => [c.athlete_id, c]));
  } catch {
    return new Map();
  }
}

function saveTracked(eventId: string, tracked: Map<number, TrackedClimber>) {
  localStorage.setItem(
    `tracked-${eventId}`,
    JSON.stringify([...tracked.values()])
  );
}

// --- Page ---

export default function CompetitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const searchParams = useSearchParams();
  const initialRound = searchParams.get("round");
  const shareParam = searchParams.get("share");

  // Restore last view state from localStorage
  const savedView = (() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(`view-${eventId}`) : null;
      return raw ? JSON.parse(raw) as { filterTracked?: boolean; roundId?: number | null } : null;
    } catch { return null; }
  })();

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(
    initialRound ? Number(initialRound) : shareParam ? null : savedView?.roundId ?? null
  );
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tracked, setTracked] = useState<Map<number, TrackedClimber>>(
    new Map()
  );
  const [sseConnected, setSseConnected] = useState(false);
  const [filterTracked, setFilterTracked] = useState(
    shareParam ? false : savedView?.filterTracked ?? false
  );
  const [myClimbersData, setMyClimbersData] = useState<TrackedRoundData[]>([]);
  const [myClimbersLoading, setMyClimbersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ athlete_id: number; name: string; country: string; category: string }[]>([]);
  const [allAthletes, setAllAthletes] = useState<{ athlete_id: number; name: string; country: string; category: string; bib: string }[]>([]);
  const [batchData, setBatchData] = useState<Record<string, RoundResults> | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchFetchedAt, setBatchFetchedAt] = useState<Date | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);
  const [expandedClimberId, setExpandedClimberId] = useState<number | null>(null);
  const [changedAscents, setChangedAscents] = useState<Set<string>>(new Set());
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const prevBatchRef = useRef<Record<string, RoundResults> | null>(null);
  const lastRoundChangeRef = useRef<Map<string, { time: Date; hash: string }>>(new Map());
  const prevRoundResultsRef = useRef<RoundResults | null>(null);
  const trackedRef = useRef(tracked);
  const eventRef = useRef(event);
  trackedRef.current = tracked;
  eventRef.current = event;

  // Reconnect SSE + refresh data when app returns from background (iOS PWA)
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Load tracked climbers from localStorage
  useEffect(() => {
    setTracked(loadTracked(eventId));
  }, [eventId]);

  // Restore staleness tracking from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`staleness-${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, { time: string; hash: string }>;
        for (const [k, v] of Object.entries(parsed)) {
          lastRoundChangeRef.current.set(k, { time: new Date(v.time), hash: v.hash });
        }
      }
    } catch { /* ignore */ }
  }, [eventId]);

  // Persist view state so reload returns to same view
  useEffect(() => {
    localStorage.setItem(`view-${eventId}`, JSON.stringify({
      filterTracked,
      roundId: selectedRoundId,
    }));
  }, [filterTracked, selectedRoundId, eventId]);

  // Auto-select first active round (or first round) if no round is set
  useEffect(() => {
    if (!event || selectedRoundId) return;
    const allRounds = event.d_cats.flatMap((dcat) => dcat.category_rounds);
    const active = allRounds.find((cr) => cr.status === "active");
    const first = active ?? allRounds[0];
    if (first) setSelectedRoundId(first.category_round_id);
  }, [event, selectedRoundId]);

  // Fetch event overview
  useEffect(() => {
    setLoading(true);
    fetch(`/api/competitions?eventId=${eventId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setEvent(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [eventId]);

  // Fetch registrations for pre-comp athlete list
  useEffect(() => {
    if (!event) return;
    // Only fetch if there are pending rounds (no results yet)
    const hasPending = event.d_cats.some((dcat) =>
      dcat.category_rounds.some((cr) => cr.status === "pending")
    );
    if (!hasPending) return;

    fetch(`/api/competitions?registrations=${eventId}`)
      .then((res) => res.json())
      .then((data: Registration[]) => {
        if (Array.isArray(data)) setRegistrations(data);
      })
      .catch(() => {});
  }, [event, eventId]);

  // Fetch round results (initial + SSE)
  useEffect(() => {
    if (!selectedRoundId) return;

    setRoundLoading(true);
    fetch(`/api/competitions/${eventId}/${selectedRoundId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setRoundResults(data);
          setLastUpdate(new Date());
        }
        setRoundLoading(false);
      })
      .catch(() => setRoundLoading(false));

    const eventSource = new EventSource(
      `/api/events?roundId=${selectedRoundId}`
    );
    setSseConnected(true);

    eventSource.addEventListener("results", (e) => {
      const data: RoundResults = JSON.parse(e.data);
      setRoundResults(data);
      setLastUpdate(new Date());

      // Merge SSE data into batchData so My Climbers updates too
      setBatchData((prev) => prev ? { ...prev, [selectedRoundId!]: data } : prev);
    });

    eventSource.addEventListener("heartbeat", () => {
      setLastUpdate(new Date());
    });

    eventSource.addEventListener("error", () => setSseConnected(false));

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoundId, eventId, refreshKey]);

  // Detect ascent changes for expanded climber detail highlighting
  useEffect(() => {
    if (!roundResults || !expandedClimberId) {
      prevRoundResultsRef.current = roundResults;
      return;
    }
    const prev = prevRoundResultsRef.current;
    if (prev) {
      const prevAthlete = prev.ranking?.find((a) => a.athlete_id === expandedClimberId);
      const currAthlete = roundResults.ranking?.find((a) => a.athlete_id === expandedClimberId);
      if (prevAthlete && currAthlete) {
        const changed = new Set<string>();
        for (const ascent of currAthlete.ascents) {
          const old = prevAthlete.ascents.find((a) => a.route_name === ascent.route_name);
          if (!old) { changed.add(ascent.route_name); continue; }
          if (ascent.top !== old.top || ascent.zone !== old.zone ||
              ascent.low_zone !== old.low_zone || ascent.top_tries !== old.top_tries ||
              ascent.status !== old.status) {
            changed.add(ascent.route_name);
          }
        }
        if (changed.size > 0) {
          setChangedAscents(changed);
          setTimeout(() => setChangedAscents(new Set()), 2000);
        }
      }
    }
    prevRoundResultsRef.current = roundResults;
  }, [roundResults, expandedClimberId]);

  // Clear expanded climber when switching rounds
  useEffect(() => {
    setExpandedClimberId(null);
  }, [selectedRoundId]);

  // Single batch fetch for all rounds — powers My Climbers, search, and refresh
  const fetchAllRounds = useCallback(() => {
    if (!event) return;
    setBatchLoading(true);
    const allRoundIds = event.d_cats.flatMap((dcat) =>
      dcat.category_rounds.map((cr) => cr.category_round_id)
    );
    const roundIdList = allRoundIds.join(",");
    fetch(`/api/competitions/batch?rounds=${roundIdList}`)
      .then((res) => res.json())
      .then((data: Record<string, RoundResults>) => {
        setBatchData(data);
        setBatchFetchedAt(new Date());
        setBatchLoading(false);
      })
      .catch(() => setBatchLoading(false));
  }, [event]);

  // Detect activity changes when batch data updates
  useEffect(() => {
    if (!batchData || !event) return;

    const roundMeta = event.d_cats.flatMap((dcat) =>
      dcat.category_rounds.map((cr) => ({
        id: cr.category_round_id,
        category: dcat.category_name,
      }))
    );

    const newEvents = diffTrackedActivity(prevBatchRef.current, batchData, tracked, roundMeta);
    if (newEvents.length > 0) {
      setActivityLog((prev) => [...newEvents, ...prev].slice(0, 100));
    }
    prevBatchRef.current = batchData;

    // Track when each round's ranking actually changes
    const now = new Date();
    for (const r of roundMeta) {
      const data = batchData[r.id];
      if (!data?.ranking?.length) continue;
      // Simple hash: ranking count + sum of scores
      const hash = `${data.ranking.length}:${data.ranking.map((a) => a.score).join(",")}`;
      const prev = lastRoundChangeRef.current.get(String(r.id));
      if (!prev || prev.hash !== hash) {
        lastRoundChangeRef.current.set(String(r.id), { time: now, hash });
      }
    }

    // Persist staleness data to localStorage
    try {
      const obj: Record<string, { time: string; hash: string }> = {};
      for (const [k, v] of lastRoundChangeRef.current) {
        obj[k] = { time: v.time.toISOString(), hash: v.hash };
      }
      localStorage.setItem(`staleness-${eventId}`, JSON.stringify(obj));
    } catch { /* ignore */ }
  }, [batchData, event, tracked, eventId]);

  // Fetch all rounds on page load + when returning from background
  useEffect(() => {
    fetchAllRounds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAllRounds, refreshKey]);

  // Poll active rounds every 30s when My Climbers is open
  useEffect(() => {
    if (!filterTracked || !event || tracked.size === 0) return;

    const activeRoundIds = event.d_cats
      .flatMap((dcat) => dcat.category_rounds)
      .filter((cr) => cr.status === "active" && cr.category_round_id !== selectedRoundId)
      .map((cr) => cr.category_round_id);

    if (activeRoundIds.length === 0) return;

    const pollActive = () => {
      fetch(`/api/competitions/batch?rounds=${activeRoundIds.join(",")}`)
        .then((res) => res.json())
        .then((data: Record<string, RoundResults>) => {
          // Merge into batch data so My Climbers view updates
          setBatchData((prev) => (prev ? { ...prev, ...data } : data));
          setBatchFetchedAt(new Date());
        })
        .catch(() => {});
    };

    const interval = setInterval(pollActive, 30000);
    pollActive(); // Initial poll
    return () => clearInterval(interval);
  }, [filterTracked, event, tracked.size, selectedRoundId]);

  // Derive My Climbers data from batch data + registrations
  useEffect(() => {
    if (!event) return;

    const allRoundMeta = event.d_cats.flatMap((dcat) =>
      dcat.category_rounds.map((cr) => ({
        id: cr.category_round_id,
        category: dcat.category_name,
        round: cr.name,
        discipline: dcat.discipline_kind,
        status: cr.status,
        dcat_id: dcat.dcat_id,
        singleRound: dcat.category_rounds.length === 1,
      }))
    );

    const results: TrackedRoundData[] = [];
    const foundInData = new Set<number>();

    // First: athletes found in batch data (results/startlists)
    if (batchData) {
      for (const r of allRoundMeta) {
        const data = batchData[r.id];
        if (!data) continue;
        const ranking: Athlete[] = data.ranking ?? [];
        const startlist: StartlistEntry[] = data.startlist ?? [];
        const routes: Route[] = data.routes ?? [];

        const currentPositions = computeCurrentPositions(ranking, startlist);

        for (const [id] of tracked) {
          const athlete = ranking.find((a) => a.athlete_id === id) ?? null;
          const entry = startlist.find((e) => e.athlete_id === id) ?? null;
          if (!athlete && !entry) continue;

          foundInData.add(id);
          results.push({
            category: r.category,
            round: r.round,
            discipline: r.discipline,
            roundStatus: r.status,
            roundId: r.id,
            athlete,
            entry,
            routes,
            currentPositions,
          });
        }
      }
    }

    // Second: tracked athletes from registrations not yet in any round data
    // Show them under their registered category's qualification round
    for (const [id, climber] of tracked) {
      if (foundInData.has(id)) continue;
      const reg = registrations.find((r) => r.athlete_id === id);
      if (!reg) continue;

      for (const regCat of reg.d_cats) {
        // Find the qualification round (or single round) for this category
        const qualRound = allRoundMeta.find(
          (r) => r.dcat_id === regCat.id && (r.round === "Qualification" || r.singleRound)
        );
        if (!qualRound) continue;

        results.push({
          category: qualRound.category,
          round: qualRound.round,
          discipline: qualRound.discipline,
          roundStatus: qualRound.status,
          roundId: qualRound.id,
          athlete: null,
          entry: null,
          routes: [],
          currentPositions: new Map(),
          athleteId: id,
        });
      }
    }

    setMyClimbersData(results);
    setMyClimbersLoading(false);
  }, [batchData, event, tracked, registrations]);

  // Build searchable athlete list from batch data + registrations
  useEffect(() => {
    if (!event) return;

    const seen = new Set<number>();
    const athletes: typeof allAthletes = [];

    // First add athletes from batch data (results/startlists)
    if (batchData) {
      const allRoundMeta = event.d_cats.flatMap((dcat) =>
        dcat.category_rounds.map((cr) => ({
          id: cr.category_round_id,
          category: dcat.category_name,
        }))
      );
      for (const r of allRoundMeta) {
        const data = batchData[r.id];
        if (!data) continue;
        for (const a of [...(data.ranking ?? []), ...(data.startlist ?? [])]) {
          if (!seen.has(a.athlete_id)) {
            seen.add(a.athlete_id);
            athletes.push({
              athlete_id: a.athlete_id,
              name: a.name,
              country: a.country,
              category: r.category,
              bib: a.bib || "",
            });
          }
        }
      }
    }

    // Then add from registrations (for pending rounds with no data yet)
    for (const reg of registrations) {
      if (seen.has(reg.athlete_id)) continue;
      seen.add(reg.athlete_id);
      const catName = reg.d_cats[0]?.name?.replace(/^LEAD |^BOULDER |^SPEED /, "") ?? "";
      athletes.push({
        athlete_id: reg.athlete_id,
        name: reg.name,
        country: reg.federation || reg.country,
        category: catName,
        bib: "",
      });
    }

    athletes.sort((a, b) => a.name.localeCompare(b.name));
    setAllAthletes(athletes);
  }, [batchData, event, registrations]);

  // Import shared athletes from URL param
  const [shareImported, setShareImported] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [hideCategories, setHideCategories] = useState(true);
  useEffect(() => {
    if (!shareParam || shareImported || allAthletes.length === 0) return;
    const ids = shareParam.split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
    if (ids.length === 0) return;

    setTracked((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        if (next.has(id)) continue;
        const athlete = allAthletes.find((a) => a.athlete_id === id);
        if (athlete) {
          next.set(id, { athlete_id: id, name: athlete.name, country: athlete.country });
        }
      }
      saveTracked(eventId, next);
      return next;
    });
    setFilterTracked(true);
    setShareImported(true);
    // Clean share param from URL so it doesn't linger
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [shareParam, allAthletes, shareImported, eventId]);

  // Filter athletes by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      allAthletes.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.country || '').toLowerCase().includes(q) ||
          a.bib === q
      )
    );
  }, [searchQuery, allAthletes]);

  const moveTracked = useCallback(
    (athleteId: number, direction: "up" | "down") => {
      setTracked((prev) => {
        const arr = [...prev.entries()];
        const idx = arr.findIndex(([id]) => id === athleteId);
        if (idx < 0) return prev;
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= arr.length) return prev;
        [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
        const next = new Map(arr);
        saveTracked(eventId, next);
        return next;
      });
    },
    [eventId]
  );

  const toggleTrack = useCallback(
    (athleteId: number, name: string, country: string) => {
      setTracked((prev) => {
        const next = new Map(prev);
        if (next.has(athleteId)) {
          next.delete(athleteId);
        } else {
          next.set(athleteId, { athlete_id: athleteId, name, country });
        }
        saveTracked(eventId, next);
        return next;
      });
    },
    [eventId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700" />
        <span className="ml-3 text-gray-600">Loading event...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 font-medium">Error loading event</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="space-y-6">
      {/* Event header */}
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-gray-500">
          {event.location} · {event.local_start_date}
          {event.local_end_date !== event.local_start_date
            ? ` – ${event.local_end_date}`
            : ""}
        </p>
        {event.public_information?.organiser_name && (
          <p className="text-sm text-gray-400">
            Organized by {event.public_information.organiser_name}
          </p>
        )}
      </div>

      {/* Status bar + refresh */}
      <StatusBar
        sseConnected={sseConnected}
        lastUpdate={lastUpdate}
        batchFetchedAt={batchFetchedAt}
        batchLoading={batchLoading}
        onRefresh={() => {
          fetchAllRounds();
          if (selectedRoundId) {
            setRoundLoading(true);
            fetch(`/api/competitions/${eventId}/${selectedRoundId}`)
              .then((r) => r.json())
              .then((data) => {
                if (!data.error) {
                  setRoundResults(data);
                  setLastUpdate(new Date());
                }
                setRoundLoading(false);
              })
              .catch(() => setRoundLoading(false));
          }
        }}
      />

      {/* Category rounds selector */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Categories & Rounds</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setFilterTracked((v) => {
                if (!v) setHideCategories(true);
                return !v;
              });
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              filterTracked
                ? "bg-yellow-500 text-white border-yellow-500"
                : "bg-yellow-50 text-yellow-800 border-yellow-300 hover:border-yellow-500"
            }`}
          >
            ★ My Climbers{tracked.size > 0 ? ` (${tracked.size})` : ""}
          </button>
          {tracked.size > 0 && (
            <button
              onClick={() => {
                const ids = [...tracked.keys()].join(",");
                const url = `${window.location.origin}/comp/${eventId}?share=${ids}`;
                navigator.clipboard.writeText(url).then(() => {
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 1500);
                });
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-50 text-gray-600 border-gray-300 hover:border-gray-500 transition-all"
            >
              {shareCopied ? "Copied!" : "Share"}
            </button>
          )}
          <button
            onClick={() => setHideCategories((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-50 text-gray-600 border-gray-300 hover:border-gray-500 transition-all"
          >
            Categories <span className="text-gray-800">{hideCategories ? "\u25B6" : "\u25BC"}</span>
          </button>
          {!hideCategories && [...event.d_cats]
            .sort((a, b) => {
              // Extract age number from category name (e.g., "F-13" → 13, "M/O-15" → 15)
              const ageA = parseInt(a.category_name.match(/\d+/)?.[0] ?? "99");
              const ageB = parseInt(b.category_name.match(/\d+/)?.[0] ?? "99");
              if (ageA !== ageB) return ageA - ageB;
              // Then by sex prefix (F before M)
              return a.category_name.localeCompare(b.category_name);
            })
            .map((dcat) =>
            dcat.category_rounds.map((cr) => {
              const roundData = batchData?.[cr.category_round_id];
              const hasScores = roundData?.ranking?.some((a: Athlete) => a.score && a.score !== "") ?? false;
              const isLive = cr.status === "active" && hasScores;
              const singleRound = dcat.category_rounds.length === 1;
              const label = singleRound
                ? dcat.category_name
                : `${dcat.category_name} · ${cr.name}`;
              return (
                <button
                  key={cr.category_round_id}
                  onClick={() => {
                    setSelectedRoundId(cr.category_round_id);
                    setFilterTracked(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    selectedRoundId === cr.category_round_id && !filterTracked
                      ? "bg-blue-700 text-white border-blue-700"
                      : isLive
                        ? "bg-green-100 text-green-800 border-green-400 hover:border-green-500"
                        : cr.status === "finished"
                          ? "bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-400"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {label}
                  {isLive && <span className="ml-1 text-xs">●</span>}
                  {cr.status === "finished" && <span className="ml-1 text-xs">★</span>}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search climbers or teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y">
            {searchResults.map((a) => {
              const isTracked = tracked.has(a.athlete_id);
              return (
                <div
                  key={a.athlete_id}
                  className={`flex items-center gap-2 px-3 py-2 text-sm ${isTracked ? "bg-yellow-50" : "hover:bg-gray-50"}`}
                >
                  <button
                    onClick={() => toggleTrack(a.athlete_id, a.name, a.country)}
                    className="text-lg leading-none shrink-0"
                  >
                    {isTracked ? "★" : "☆"}
                  </button>
                  <span className="font-medium">{a.name}</span>
                  <span className="text-gray-400 text-xs">{a.country}</span>
                  <span className="text-gray-400 text-xs ml-auto">{a.category}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {filterTracked ? (
        myClimbersLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500" />
            <span className="ml-3 text-gray-600">Loading your climbers...</span>
          </div>
        ) : (
          <MyClimbersView
            data={myClimbersData}
            tracked={tracked}
            onToggleTrack={toggleTrack}
            onMoveTracked={moveTracked}
            activityLog={activityLog}
            event={event!}
            lastRoundChanges={lastRoundChangeRef.current}
            batchData={batchData}
            onSelectRound={(roundId) => {
              setSelectedRoundId(roundId);
              setFilterTracked(false);
            }}
          />
        )
      ) : roundLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700" />
          <span className="ml-3 text-gray-600">Loading results...</span>
        </div>
      ) : roundResults ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {roundResults.category} — {roundResults.round}
            </h3>
            {(() => {
              const reallyLive = roundResults.status === "active" && (roundResults.ranking?.length ?? 0) > 0;
              return (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    roundResults.status === "finished"
                      ? "bg-amber-100 text-amber-700"
                      : reallyLive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {reallyLive ? "● Live" : roundResults.status === "finished" ? "★ Final" : "Upcoming"}
                </span>
              );
            })()}
          </div>
          <p className="text-sm text-gray-500">
            {roundResults.discipline} · {formatRoundFormat(roundResults.format, roundResults.discipline)}
          </p>

          {(() => {
            if (roundResults.status !== "active" || !roundResults.ranking?.length) return null;
            // Don't show staleness if everyone has scored
            const allScored = roundResults.ranking.every((a) => a.score && a.score !== "")
              && (!roundResults.startlist?.length || roundResults.startlist.every((s) => roundResults.ranking!.some((a) => a.athlete_id === s.athlete_id)));
            if (allScored) return null;
            const lastChange = lastRoundChangeRef.current.get(String(selectedRoundId));
            if (!lastChange) return null;
            const elapsed = Date.now() - lastChange.time.getTime();
            if (elapsed < STALE_THRESHOLD_MS) return null;
            return (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Scores may be delayed — no changes for {formatTimeAgo(lastChange.time)}
              </p>
            );
          })()}

          {(roundResults.ranking?.length ?? 0) > 0 ||
          (roundResults.startlist?.length ?? 0) > 0 ? (
            <RoundTable
              ranking={roundResults.ranking ?? []}
              startlist={roundResults.startlist ?? []}
              routes={roundResults.routes ?? []}
              status={roundResults.status}
              roundName={roundResults.round}
              discipline={roundResults.discipline?.toLowerCase() ?? ""}
              tracked={tracked}
              onToggleTrack={toggleTrack}
              expandedClimberId={expandedClimberId}
              onExpandClimber={setExpandedClimberId}
              changedAscents={changedAscents}
            />
          ) : (() => {
            // Show registrations on qualification rounds when no results/startlist
            const dcat = event!.d_cats.find((d) =>
              d.category_rounds.some((cr) => cr.category_round_id === selectedRoundId)
            );
            const isQual = roundResults.round === "Qualification" || dcat?.category_rounds.length === 1;
            const catRegs = dcat && isQual
              ? registrations.filter((r) =>
                  r.d_cats.some((dc) => dc.id === dcat.dcat_id)
                )
              : [];
            return catRegs.length > 0 ? (
              <RegistrationList
                registrations={catRegs}
                tracked={tracked}
                onToggleTrack={toggleTrack}
              />
            ) : (
              <p className="text-gray-500 text-sm">
                {isQual ? "No results or startlist available yet." : "Waiting for qualification results."}
              </p>
            );
          })()}
        </div>
      ) : (
        <p className="text-gray-500">
          Select a category round above to view results.
        </p>
      )}
    </div>
  );
}

// --- Registration List (pre-comp) ---

function RegistrationList({
  registrations,
  tracked,
  onToggleTrack,
}: {
  registrations: Registration[];
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
}) {
  const sorted = [...registrations].sort((a, b) => a.name.localeCompare(b.name));
  const hasTeams = sorted.some((r) => r.federation);

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">
        {sorted.length} registered — tap ☆ to track before the comp starts
      </p>
      <div className="border border-gray-200 rounded-lg divide-y">
        {sorted.map((reg) => {
          const isTracked = tracked.has(reg.athlete_id);
          return (
            <div
              key={reg.athlete_id}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${isTracked ? "bg-yellow-50" : ""}`}
            >
              <button
                onClick={() => onToggleTrack(reg.athlete_id, reg.name, reg.federation || reg.country)}
                className="text-lg leading-none shrink-0"
              >
                {isTracked ? "★" : "☆"}
              </button>
              <span className="font-medium">{reg.name}</span>
              {hasTeams && reg.federation && (
                <span className="text-gray-400 text-xs">{reg.federation}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Status Bar ---

function StatusBar({
  sseConnected,
  lastUpdate,
  batchFetchedAt,
  batchLoading,
  onRefresh,
}: {
  sseConnected: boolean;
  lastUpdate: Date | null;
  batchFetchedAt: Date | null;
  batchLoading: boolean;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(new Date());

  // Tick every second to keep staleness display current
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const mostRecent = lastUpdate && batchFetchedAt
    ? (lastUpdate > batchFetchedAt ? lastUpdate : batchFetchedAt)
    : lastUpdate || batchFetchedAt;

  const secondsAgo = mostRecent ? Math.floor((now.getTime() - mostRecent.getTime()) / 1000) : null;

  const isStale = secondsAgo !== null && secondsAgo > 60;
  const isVeryStale = secondsAgo !== null && secondsAgo > 120;

  const agoText = secondsAgo === null
    ? null
    : secondsAgo < 5
      ? "just now"
      : secondsAgo < 60
        ? `${secondsAgo}s ago`
        : `${Math.floor(secondsAgo / 60)}m ${secondsAgo % 60}s ago`;

  return (
    <div className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2 ${
      isVeryStale
        ? "bg-red-50 border border-red-200"
        : isStale
          ? "bg-yellow-50 border border-yellow-200"
          : "bg-gray-50 border border-gray-200"
    }`}>
      {/* Connection status */}
      {sseConnected ? (
        <span className="text-green-600 flex items-center gap-1">
          <span className="animate-pulse">●</span> Live
        </span>
      ) : (
        <span className="text-gray-400 flex items-center gap-1">
          ○ Not live
        </span>
      )}

      {/* Freshness */}
      {agoText && (
        <span className={
          isVeryStale ? "text-red-600 font-medium" :
          isStale ? "text-yellow-700" :
          "text-gray-500"
        }>
          Updated {agoText}
        </span>
      )}

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={batchLoading}
        className="ml-auto px-3 py-1 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 transition-all"
      >
        {batchLoading ? (
          <span className="flex items-center gap-1">
            <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" />
            Refreshing
          </span>
        ) : (
          "Refresh"
        )}
      </button>
    </div>
  );
}

// --- Startlist Table ---

function StartlistTable({
  startlist,
  routes,
  tracked,
  onToggleTrack,
}: {
  startlist: StartlistEntry[];
  routes: Route[];
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
}) {
  const hasTeams = startlist.some((e) => e.country);

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          No results yet — showing startlist & rotation order
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2 w-8"></th>
              <th className="p-2">Bib</th>
              <th className="p-2">Climber</th>
              {routes.map((r) => (
                <th key={r.id} className="p-2 text-center">
                  B{r.name}
                </th>
              ))}
              {hasTeams && <th className="p-2">Team</th>}
            </tr>
          </thead>
          <tbody>
            {startlist.map((entry) => {
              const isTracked = tracked.has(entry.athlete_id);
              return (
                <tr
                  key={entry.athlete_id}
                  className={`border-t ${isTracked ? "bg-yellow-50 font-medium" : "hover:bg-gray-50"}`}
                >
                  <td className="p-2">
                    <button
                      onClick={() =>
                        onToggleTrack(
                          entry.athlete_id,
                          entry.name,
                          entry.country
                        )
                      }
                      className="text-lg leading-none"
                    >
                      {isTracked ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="p-2 text-gray-500 font-mono">{entry.bib}</td>
                  <td className="p-2">
                    <span className="font-medium">{entry.name}</span>
                  </td>
                  {entry.route_start_positions.map((rsp) => (
                    <td
                      key={rsp.route_id}
                      className="p-2 text-center font-mono text-xs"
                    >
                      {rsp.position}
                    </td>
                  ))}
                  {hasTeams && <td className="p-2 text-gray-500 text-xs">{entry.country}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Numbers show rotation position on each boulder. Lower number = earlier
        in the rotation.
      </p>
    </div>
  );
}

// --- Climber Status Helpers ---

interface ClimberStatus {
  label: string;
  style: string;
  sortKey: number; // lower = higher priority in display
}

const STALE_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes

function formatRoundFormat(format: string, discipline: string): string {
  // "IFSC: 2 routes" -> "2 routes"
  // "IFSC: 1 group 2025 (points)" -> "Points"
  if (/1 group.*points/i.test(format)) return "Points";
  const m = format.match(/(\d+)\s*routes?/i);
  if (m) return `${m[1]} route${parseInt(m[1]) > 1 ? "s" : ""}`;
  // Strip "IFSC: " prefix if present
  return format.replace(/^IFSC:\s*/i, "");
}

function formatRouteName(routeName: string, includeCategory: boolean): string {
  // "F-19 #3" -> "F-19 B3" (full) or "B3" (short)
  if (includeCategory) {
    return routeName.replace(/\s*#/, " B");
  }
  return routeName.replace(/.*#/, "B");
}

/**
 * Compute the highest confirmed position on each route.
 * This tells us roughly where the rotation is at — the climber at
 * this position just finished or is finishing.
 */
function computeCurrentPositions(
  ranking: Athlete[],
  startlist: StartlistEntry[],
): Map<number, number> {
  // Map route_id -> highest position of a climber who has results or is active
  const startlistMap = new Map(startlist.map((e) => [e.athlete_id, e]));
  const routePositions = new Map<number, number>();

  for (const athlete of ranking) {
    const entry = startlistMap.get(athlete.athlete_id);
    if (!entry) continue;

    for (const ascent of athlete.ascents) {
      // Boulder uses top_tries, lead/TR uses score — check both
      if (ascent.top_tries != null || ascent.status === "active" || ascent.status === "confirmed" || (ascent.score && ascent.score !== "")) {
        const rsp = entry.route_start_positions.find(
          (r) => r.route_name === ascent.route_name
        );
        if (rsp) {
          const current = routePositions.get(rsp.route_id) ?? 0;
          routePositions.set(rsp.route_id, Math.max(current, rsp.position));
        }
      }
    }
  }

  return routePositions;
}

function computeClimberStatus(
  athlete: Athlete | null,
  startlistEntry: StartlistEntry | null,
  roundStatus: string,
  includeCategory = false,
  currentPositions?: Map<number, number>,
  discipline?: string,
): ClimberStatus {
  // Finished round — everyone is done
  if (roundStatus === "finished") {
    return { label: "", style: "", sortKey: 3 };
  }

  // Not started round
  if (roundStatus === "not_started") {
    return {
      label: "Waiting",
      style: "text-gray-400",
      sortKey: 4,
    };
  }

  // Under appeal — show regardless of other state
  if (athlete?.under_appeal) {
    return {
      label: "Under appeal",
      style: "text-orange-600 font-medium",
      sortKey: 0,
    };
  }

  // For lead/TR in active rounds, someone is always on the wall but we can't
  // detect who — advance currentPositions by 1 to account for the climber
  // whose score hasn't been posted yet.
  const isLeadTR = discipline && discipline !== "boulder";
  const adjustedPositions = currentPositions && isLeadTR && roundStatus === "active"
    ? new Map(Array.from(currentPositions).map(([k, v]) => [k, v + 1]))
    : currentPositions;

  // Active on wall — only trust active flag for boulder
  // For lead/TR, the API sets active unreliably (stays true after climbing)
  if (athlete?.active && discipline === "boulder") {
    const activeRoute = athlete.ascents.find((a) => a.status === "active");
    if (activeRoute) {
      const routeLabel = formatRouteName(activeRoute.route_name, includeCategory);
      return {
        label: `On wall — ${routeLabel}`,
        style: "text-blue-600 font-medium animate-pulse",
        sortKey: 0,
      };
    }
  }

  if (athlete) {
    // Has results but not currently climbing
    const doneCount = athlete.ascents.filter((a) => a.status === "confirmed" || a.top_tries != null || (a.score && a.score !== "")).length;
    const totalRoutes = athlete.ascents.length;

    if (doneCount >= totalRoutes) {
      return {
        label: roundStatus === "active" ? "Done — pending" : "Done",
        style: roundStatus === "active" ? "text-amber-600" : "text-gray-400",
        sortKey: 3,
      };
    }

    const roundNotStarted = !currentPositions || currentPositions.size === 0;

    // Still has routes left — find next route and queue depth
    const nextAscent = athlete.ascents.find((a) => a.status !== "confirmed" && a.top_tries == null && !a.score);
    if (nextAscent && startlistEntry && adjustedPositions) {
      const rsp = startlistEntry.route_start_positions.find(
        (r) => r.route_name === nextAscent.route_name
      );
      if (rsp) {
        const currentPos = adjustedPositions.get(rsp.route_id) ?? 0;
        const away = rsp.position - currentPos;
        const routeLabel = formatRouteName(nextAscent.route_name, includeCategory);
        if (away === 0 && isLeadTR) {
          return {
            label: `Likely climbing — ${routeLabel}`,
            style: "text-blue-600 font-medium",
            sortKey: 0,
          };
        }
        if (away < 0 && isLeadTR) {
          // Position is behind the current climber — already went, score pending
          return {
            label: "Score pending",
            style: "text-amber-600",
            sortKey: 3,
          };
        }
        if (away <= 1) {
          return {
            label: `On deck — ${routeLabel}`,
            style: "text-orange-600 font-medium",
            sortKey: 1,
          };
        }
        return {
          label: `${away} away — ${routeLabel}`,
          style: roundNotStarted ? "text-gray-400" : "text-purple-600",
          sortKey: 2,
        };
      }
    }

    const routeLabel = nextAscent ? formatRouteName(nextAscent.route_name, includeCategory) : "";
    return {
      label: `Next: ${routeLabel}`,
      style: roundNotStarted ? "text-gray-400" : "text-purple-600",
      sortKey: 2,
    };
  }

  // Not in ranking yet — use startlist position to estimate queue depth
  const roundNotStarted = !adjustedPositions || adjustedPositions.size === 0;
  if (startlistEntry && adjustedPositions) {
    // Find the route where they have the lowest position (their first route)
    let bestAway = Infinity;
    let bestRoute = "";
    for (const rsp of startlistEntry.route_start_positions) {
      const currentPos = adjustedPositions.get(rsp.route_id) ?? 0;
      const away = rsp.position - currentPos;
      if (away > 0 && away < bestAway) {
        bestAway = away;
        bestRoute = rsp.route_name;
      }
    }
    if (bestAway < Infinity) {
      const routeLabel = formatRouteName(bestRoute, includeCategory);
      if (bestAway <= 1 && !roundNotStarted) {
        return {
          label: `On deck — ${routeLabel}`,
          style: "text-orange-600 font-medium",
          sortKey: 1,
        };
      }
      return {
        label: `${bestAway} away — ${routeLabel}`,
        style: roundNotStarted ? "text-gray-400" : "text-purple-600",
        sortKey: 2,
      };
    }
  }

  return {
    label: "Waiting",
    style: "text-gray-400",
    sortKey: 4,
  };
}

// --- Unified Round Table ---

interface UnifiedRow {
  athlete_id: number;
  name: string;
  country: string;
  bib: string;
  rank: number | null;
  score: string;
  ascents: Ascent[];
  active: boolean;
  under_appeal: boolean;
  extra_advancement: boolean;
  status: ClimberStatus;
  startPositions: RouteStartPosition[];
  hasResults: boolean;
}

function RoundTable({
  ranking,
  startlist,
  routes,
  status: roundStatus,
  roundName,
  discipline,
  tracked,
  onToggleTrack,
  expandedClimberId,
  onExpandClimber,
  changedAscents,
}: {
  ranking: Athlete[];
  startlist: StartlistEntry[];
  routes: Route[];
  status: string;
  roundName: string;
  discipline: string;
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
  expandedClimberId: number | null;
  onExpandClimber: (id: number | null) => void;
  changedAscents: Set<string>;
}) {
  // Build unified rows: ranked athletes + unranked startlist entries
  const rankedIds = new Set(ranking.map((a) => a.athlete_id));
  const startlistMap = new Map(startlist.map((e) => [e.athlete_id, e]));
  const currentPositions = computeCurrentPositions(ranking, startlist);

  const rows: UnifiedRow[] = [];

  // Ranked athletes
  for (const athlete of ranking) {
    const entry = startlistMap.get(athlete.athlete_id);
    rows.push({
      athlete_id: athlete.athlete_id,
      name: athlete.name,
      country: athlete.country,
      bib: athlete.bib,
      rank: athlete.rank,
      score: athlete.score,
      ascents: athlete.ascents,
      active: athlete.active,
      under_appeal: athlete.under_appeal,
      extra_advancement: athlete.extra_advancement,
      status: computeClimberStatus(athlete, entry ?? null, roundStatus, false, currentPositions, discipline),
      startPositions: entry?.route_start_positions ?? [],
      hasResults: true,
    });
  }

  // Unranked startlist entries (haven't started yet)
  for (const entry of startlist) {
    if (rankedIds.has(entry.athlete_id)) continue;
    rows.push({
      athlete_id: entry.athlete_id,
      name: entry.name,
      country: entry.country,
      bib: entry.bib,
      rank: null,
      score: "",
      ascents: [],
      active: false,
      under_appeal: false,
      extra_advancement: false,
      status: computeClimberStatus(null, entry, roundStatus, false, currentPositions, discipline),
      startPositions: entry.route_start_positions,
      hasResults: false,
    });
  }

  // For non-qualification rounds (finals, semis), sort by start order
  // so the list reflects climbing order rather than current rank
  const isFinalOrSemi = roundName !== "Qualification";
  if (isFinalOrSemi && startlist.length > 0) {
    const startOrderMap = new Map(
      startlist.map((e) => [e.athlete_id, Math.min(...e.route_start_positions.map((r) => r.position))])
    );
    rows.sort((a, b) => {
      // Finished climbers (have a score) first, sorted by rank
      const aHasScore = a.score && a.score !== "" && a.score !== "0";
      const bHasScore = b.score && b.score !== "" && b.score !== "0";
      if (aHasScore && !bHasScore) return -1;
      if (!aHasScore && bHasScore) return 1;
      if (aHasScore && bHasScore) return (a.rank ?? Infinity) - (b.rank ?? Infinity);
      // Remaining athletes by start order
      const posA = startOrderMap.get(a.athlete_id) ?? Infinity;
      const posB = startOrderMap.get(b.athlete_id) ?? Infinity;
      return posA - posB;
    });
  }

  // Qualification indicator: show * when a rank is mathematically locked in.
  // qualifyCount = total qualifying spots (from API's qualified flag)
  // remaining = athletes who haven't scored yet
  // guaranteed = qualifyCount - remaining (if > 0, top N ranks are locked)
  const qualifyCount = ranking.filter((a) => a.qualified).length;
  const remaining = rows.filter((r) => !r.score || r.score === "").length;
  const guaranteedRank = qualifyCount > 0 && remaining < qualifyCount ? qualifyCount - remaining : 0;

  const hasAscents = ranking[0]?.ascents?.length > 0;
  const isActive = roundStatus === "active";
  const showStartPositions = startlist.length > 0 && routes.length > 0;
  const hasTeams = rows.some((r) => r.country);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="p-2 w-8"></th>
            <th className="p-2 w-12">#</th>
            <th className="p-2">Climber</th>
            {isActive && <th className="p-2">Status</th>}
            {hasAscents && <th className="p-2 text-center">Routes</th>}
            <th className="p-2 text-center">Score</th>
            {hasTeams && <th className="p-2">Team</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isTracked = tracked.has(row.athlete_id);
            const isExpanded = expandedClimberId === row.athlete_id;
            const colCount = 3 + (hasTeams ? 1 : 0) + (isActive ? 1 : 0) + 1 + (hasAscents ? 1 : 0);
            return (
              <Fragment key={row.athlete_id}>
              <tr
                onClick={() => onExpandClimber(isExpanded ? null : row.athlete_id)}
                className={`border-t cursor-pointer ${
                  isExpanded
                    ? "bg-blue-50 font-medium"
                    : isTracked
                      ? "bg-yellow-50 font-medium"
                      : row.active
                        ? "bg-blue-50"
                        : !row.hasResults
                          ? "text-gray-400"
                          : "hover:bg-gray-50"
                } ${row.under_appeal ? "opacity-70" : ""}`}
              >
                <td className="p-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTrack(row.athlete_id, row.name, row.country);
                    }}
                    className="text-lg leading-none"
                  >
                    {isTracked ? "★" : "☆"}
                  </button>
                </td>
                <td className="p-2 text-gray-500 font-mono">
                  {row.rank || "—"}
                  {row.rank && row.rank <= guaranteedRank && (
                    <span className="text-green-600 ml-0.5" title="Qualified">*</span>
                  )}
                </td>
                <td className="p-2">
                  <span className={row.hasResults ? "font-medium" : ""}>{row.name}</span>
                  {row.extra_advancement && row.rank && row.rank <= guaranteedRank && (
                    <span className="ml-1 text-xs text-green-600" title="Extra Advancement">(EA)</span>
                  )}
                  {row.under_appeal && (
                    <span className="ml-2 text-xs text-orange-600">Appeal</span>
                  )}
                </td>
                {isActive && (
                  <td className="p-2">
                    <span className={`text-xs ${row.status.style}`}>
                      {row.status.label}
                    </span>
                  </td>
                )}
                {hasAscents && (
                  <td className="p-2">
                    {row.hasResults ? (
                      <AscentDisplay ascents={row.ascents} />
                    ) : showStartPositions ? (
                      <div className="flex gap-1 justify-center">
                        {row.startPositions.map((rsp) => (
                          <span
                            key={rsp.route_id}
                            className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400"
                            title={`Rotation position ${rsp.position}`}
                          >
                            #{rsp.position}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                )}
                <td className="p-2 text-center font-mono font-semibold">
                  {row.score || "—"}
                </td>
                {hasTeams && <td className="p-2 text-gray-500 text-xs">{row.country}</td>}
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <ClimberDetail
                      row={row}
                      routes={routes}
                      roundStatus={roundStatus}
                      discipline={discipline}
                      currentPositions={currentPositions}
                      startlistEntry={startlistMap.get(row.athlete_id) ?? null}
                      changedAscents={changedAscents}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Climber Detail ---

function ClimberDetail({
  row,
  routes,
  roundStatus,
  discipline,
  currentPositions,
  startlistEntry,
  changedAscents,
}: {
  row: UnifiedRow;
  routes: Route[];
  roundStatus: string;
  discipline: string;
  currentPositions: Map<number, number>;
  startlistEntry: StartlistEntry | null;
  changedAscents: Set<string>;
}) {
  const status = computeClimberStatus(
    row.hasResults ? { athlete_id: row.athlete_id, ascents: row.ascents, active: row.active } as Athlete : null,
    startlistEntry,
    roundStatus,
    false,
    currentPositions,
    discipline,
  );

  // Build route data — merge ascent results with route info
  const routeCards = routes.map((route) => {
    const ascent = row.ascents.find((a) => {
      // Route names in ascents look like "F-19 #3", route.name is just "3"
      return a.route_name.endsWith(`#${route.name}`);
    });
    const startPos = startlistEntry?.route_start_positions.find(
      (rsp) => rsp.route_id === route.id
    );
    const isChanged = ascent ? changedAscents.has(ascent.route_name) : false;

    return { route, ascent, startPos, isChanged };
  });

  return (
    <div className="bg-slate-50 border-t border-b border-blue-200 px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold text-base">{row.name}</span>
        <span className="text-sm text-gray-500">Bib {row.bib}</span>
        <span className="text-sm text-gray-400">{row.country}</span>
        {row.rank && (
          <span className="text-sm">
            Rank <span className="font-mono font-bold">{row.rank}</span>
          </span>
        )}
        {row.score && (
          <span className="text-sm">
            Score <span className="font-mono font-bold">{row.score}</span>
          </span>
        )}
        {status.label && (
          <span className={`text-sm font-medium ${status.style}`}>{status.label}</span>
        )}
      </div>

      {/* Route cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {routeCards.map(({ route, ascent, startPos, isChanged }) => {
          const isBoulder = ascent?.zone !== undefined;
          const notStarted = !ascent || (isBoulder && ascent.top_tries == null);
          const isActive = ascent?.status === "active";

          let borderColor = "border-gray-200";
          let bgColor = "bg-white";
          if (isActive) { borderColor = "border-blue-400"; bgColor = "bg-blue-50"; }
          else if (ascent?.top) { borderColor = "border-green-400"; bgColor = "bg-green-50"; }
          else if (ascent?.zone) { borderColor = "border-amber-400"; bgColor = "bg-amber-50"; }
          else if (ascent?.low_zone) { borderColor = "border-blue-300"; bgColor = "bg-blue-50"; }
          else if (ascent && !notStarted && !ascent.top && !ascent.zone && !ascent.low_zone) {
            borderColor = "border-gray-300"; bgColor = "bg-gray-50";
          }

          return (
            <div
              key={route.id}
              className={`rounded-lg border-2 ${borderColor} ${bgColor} p-2 text-center transition-all duration-500 ${
                isChanged ? "ring-2 ring-blue-400 ring-offset-1" : ""
              } ${isActive ? "animate-pulse" : ""}`}
            >
              <div className="text-xs font-medium text-gray-500 mb-1">B{route.name}</div>
              {notStarted ? (
                <div className="text-sm text-gray-400">
                  {startPos ? `#${startPos.position}` : "—"}
                </div>
              ) : isActive ? (
                <div className="text-sm font-semibold text-blue-600">Climbing</div>
              ) : isBoulder ? (
                <div>
                  <div className={`text-lg font-bold ${
                    ascent!.top ? "text-green-700" :
                    ascent!.zone ? "text-amber-700" :
                    ascent!.low_zone ? "text-blue-600" :
                    "text-gray-500"
                  }`}>
                    {ascent!.top ? `T${ascent!.top_tries}` :
                     ascent!.zone ? `Z${ascent!.zone_tries}` :
                     ascent!.low_zone ? `LZ${ascent!.low_zone_tries}` :
                     `A${ascent!.top_tries}`}
                  </div>
                  {ascent!.points != null && (
                    <div className="text-xs text-gray-400">{ascent!.points} pts</div>
                  )}
                </div>
              ) : (
                <div className="text-sm font-semibold">{ascent!.score || "—"}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- My Climbers View ---

function MyClimbersView({
  data,
  tracked,
  onToggleTrack,
  onMoveTracked,
  activityLog,
  event,
  lastRoundChanges,
  batchData,
  onSelectRound,
}: {
  data: TrackedRoundData[];
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
  onMoveTracked: (id: number, direction: "up" | "down") => void;
  activityLog: ActivityEvent[];
  event: EventData;
  lastRoundChanges: Map<string, { time: Date; hash: string }>;
  batchData: Record<string, RoundResults> | null;
  onSelectRound: (roundId: number) => void;
}) {
  if (tracked.size === 0) {
    return (
      <p className="text-gray-500 text-sm">
        No climbers tracked yet. Tap the ☆ next to a climber&apos;s name in any round to start tracking them.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Your tracked climbers weren&apos;t found in any rounds yet.
      </p>
    );
  }

  // Group by climber, then show each round they're in
  const byClimber = new Map<number, TrackedRoundData[]>();
  for (const d of data) {
    const id = d.athlete?.athlete_id ?? d.entry?.athlete_id ?? d.athleteId;
    if (!id) continue;
    if (!byClimber.has(id)) byClimber.set(id, []);
    byClimber.get(id)!.push(d);
  }

  return (
    <div className="space-y-4">
      {/* Activity Feed */}
      {activityLog.length > 0 && <ActivityFeed events={activityLog} />}

      {/* Render in tracked Map order (user-defined) */}
      {[...tracked.keys()].map((athleteId, idx) => {
        const rounds = byClimber.get(athleteId);
        if (!rounds) return null;
        const climber = tracked.get(athleteId);
        if (!climber) return null;
        const isFirst = idx === 0;
        const isLast = idx === tracked.size - 1;

        return (
          <div
            key={athleteId}
            className="rounded-lg border border-yellow-200 bg-yellow-50 overflow-hidden"
          >
            {/* Climber header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-100 border-b border-yellow-200">
              <button
                onClick={() =>
                  onToggleTrack(climber.athlete_id, climber.name, climber.country)
                }
                className="text-lg leading-none"
              >
                ★
              </button>
              <span className="font-semibold">{climber.name}</span>
              <span className="text-xs text-gray-500">{climber.country}</span>
              <div className="ml-auto flex">
                <button
                  onClick={() => onMoveTracked(athleteId, "up")}
                  disabled={isFirst}
                  className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${
                    isFirst ? "text-gray-300" : "text-gray-500 hover:bg-yellow-200 active:bg-yellow-300"
                  }`}
                >
                  ▲
                </button>
                <button
                  onClick={() => onMoveTracked(athleteId, "down")}
                  disabled={isLast}
                  className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${
                    isLast ? "text-gray-300" : "text-gray-500 hover:bg-yellow-200 active:bg-yellow-300"
                  }`}
                >
                  ▼
                </button>
              </div>
            </div>

            {/* Round cards */}
            <div className="divide-y divide-yellow-200">
              {rounds.map((r, i) => {
                const status = computeClimberStatus(r.athlete, r.entry, r.roundStatus, true, r.currentPositions, r.discipline);
                const hasAscents = (r.athlete?.ascents?.length ?? 0) > 0;

                // Check if scores are stale using client-side change tracking
                const roundHasScores = r.currentPositions.size > 0;
                const lastChange = lastRoundChanges.get(String(r.roundId));
                const staleMins = lastChange ? (Date.now() - lastChange.time.getTime()) / 60_000 : Infinity;
                const stale = r.roundStatus === "active" && roundHasScores && staleMins > 6;
                // Override status for close climbers when scores are stale
                // Only for athletes not yet in ranking (no scores at all)
                const hasNoScores = !r.athlete || r.athlete.ascents.every((a) => !a.score && a.top_tries == null && a.status !== "confirmed");
                const displayStatus = stale && hasNoScores && status.sortKey === 2 && status.label.match(/^\d+ away/)
                  ? { label: "Likely climbing — score pending", style: "text-amber-600 font-medium", sortKey: 0 }
                  : stale && hasNoScores && status.sortKey === 1
                    ? { label: "Likely on wall — score pending", style: "text-blue-600 font-medium", sortKey: 0 }
                    : status;

                return (
                  <div key={i} className="px-3 py-2">
                    {/* Round header line */}
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => onSelectRound(r.roundId)}
                        className="text-sm font-medium text-blue-700 hover:underline"
                      >{r.category}</button>
                      <span className="text-xs text-gray-400">{r.round}</span>
                      {(() => {
                        const reallyLive = r.roundStatus === "active" && roundHasScores;
                        return (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              r.roundStatus === "finished"
                                ? "bg-amber-100 text-amber-700"
                                : reallyLive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {reallyLive ? "● Live" : r.roundStatus === "finished" ? "★ Final" : "Upcoming"}
                          </span>
                        );
                      })()}
                      {displayStatus.label && (
                        <span className={`text-xs font-medium ${displayStatus.style}`}>
                          {displayStatus.label}
                        </span>
                      )}
                    </div>

                    {/* Score + ascents */}
                    {r.athlete ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">
                          Rank <span className="font-mono font-semibold text-gray-800">{r.athlete.rank || "—"}</span>
                          {(() => {
                            if (!r.athlete?.rank || !batchData) return null;
                            const rd = batchData[r.roundId];
                            if (!rd?.ranking) return null;
                            const qualifyCount = rd.ranking.filter((a: Athlete) => a.qualified).length;
                            const remaining = rd.ranking.filter((a: Athlete) => !a.score || a.score === "").length
                              + (rd.startlist?.filter((s: StartlistEntry) => !rd.ranking!.some((a: Athlete) => a.athlete_id === s.athlete_id)).length ?? 0);
                            const guaranteed = qualifyCount > 0 && remaining < qualifyCount ? qualifyCount - remaining : 0;
                            return r.athlete!.rank <= guaranteed
                              ? <span className="text-green-600 ml-0.5" title="Qualified">*</span>
                              : null;
                          })()}
                        </span>
                        <span className="text-sm text-gray-500">
                          Score <span className="font-mono font-semibold text-gray-800">{r.athlete.score || "—"}</span>
                        </span>
                        {hasAscents && (
                          <AscentDisplay ascents={r.athlete.ascents} />
                        )}
                      </div>
                    ) : r.entry ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>Start positions:</span>
                        <div className="flex gap-1">
                          {r.entry.route_start_positions.map((rsp) => (
                            <span
                              key={rsp.route_id}
                              className="inline-block px-1.5 py-0.5 rounded bg-gray-100"
                              title={`Rotation position ${rsp.position}`}
                            >
                              #{rsp.position}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Registered — waiting for comp to start</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Activity Feed ---

const activityStyles: Record<ActivityEvent["type"], { icon: string; color: string }> = {
  on_wall: { icon: "🧗", color: "text-blue-600" },
  topped: { icon: "✓", color: "text-green-700" },
  zone: { icon: "◆", color: "text-yellow-700" },
  low_zone: { icon: "◇", color: "text-orange-600" },
  attempts: { icon: "✗", color: "text-red-500" },
  rank_change: { icon: "↕", color: "text-purple-600" },
  appeared: { icon: "+", color: "text-blue-500" },
  finished: { icon: "✓", color: "text-gray-500" },
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);

  // Tick every 10s to keep "ago" text fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  const visible = expanded ? events : events.slice(0, 5);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 overflow-hidden">
      <div className="px-3 py-2 bg-blue-100 border-b border-blue-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-blue-800">Live Activity</span>
        <span className="text-xs text-blue-500">{events.length} events</span>
      </div>
      <div className="divide-y divide-blue-100">
        {visible.map((event) => {
          const style = activityStyles[event.type];
          return (
            <div key={event.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
              <span className={`w-5 text-center ${style.color}`}>{style.icon}</span>
              <span className="font-medium text-gray-800">{event.athleteName}</span>
              <span className={`${style.color}`}>{event.detail}</span>
              <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                {formatTimeAgo(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
      {events.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-center text-xs text-blue-600 py-1.5 hover:bg-blue-100 border-t border-blue-200"
        >
          {expanded ? "Show less" : `Show all ${events.length} events`}
        </button>
      )}
    </div>
  );
}

// --- Ascent Display ---

function AscentDisplay({ ascents }: { ascents: Ascent[] }) {
  return (
    <div className="flex gap-1 justify-center">
      {ascents.map((a, i) => {
        const isBoulder = a.zone !== undefined;
        const notStarted = isBoulder && a.top_tries == null;
        const attempted = isBoulder && !notStarted && !a.top && !a.zone && !a.low_zone;

        const label = isBoulder
          ? notStarted
            ? ""
            : a.top
              ? `T${a.top_tries ?? ""}`
              : a.zone
                ? `Z${a.zone_tries ?? ""}`
                : a.low_zone
                  ? `LZ${a.low_zone_tries ?? ""}`
                  : `A${a.top_tries ?? 0}`
          : a.score || "—";

        const tooltip = isBoulder
          ? notStarted
            ? `B${a.route_name}: Not started`
            : `B${a.route_name}: ${a.top ? `Top in ${a.top_tries}` : a.zone ? `Zone in ${a.zone_tries}` : a.low_zone ? `Low zone in ${a.low_zone_tries}` : `${a.top_tries} attempts, no hold`}${a.points ? ` · ${a.points}pts` : ""}`
          : `Route ${a.route_name}: ${a.score}`;

        const style = notStarted
          ? "bg-gray-100 text-gray-400"
          : a.top
            ? "bg-green-100 text-green-800"
            : a.zone
              ? "bg-amber-100 text-amber-800"
              : a.low_zone
                ? "bg-blue-100 text-blue-700"
                : attempted
                  ? "bg-gray-100 text-gray-500"
                  : a.score
                    ? "bg-gray-100 text-gray-700"
                    : "bg-gray-50 text-gray-400";

        return (
          <span
            key={i}
            className={`inline-block px-1.5 py-0.5 rounded text-xs ${style}`}
            title={tooltip}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
