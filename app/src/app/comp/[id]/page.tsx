"use client";

import { useEffect, useState, useCallback, use } from "react";
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
  athlete: Athlete | null;
  entry: StartlistEntry | null;
  routes: Route[];
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

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(
    initialRound ? Number(initialRound) : null
  );
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tracked, setTracked] = useState<Map<number, TrackedClimber>>(
    new Map()
  );
  const [sseConnected, setSseConnected] = useState(false);
  const [filterTracked, setFilterTracked] = useState(false);
  const [myClimbersData, setMyClimbersData] = useState<TrackedRoundData[]>([]);
  const [myClimbersLoading, setMyClimbersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ athlete_id: number; name: string; country: string; category: string }[]>([]);
  const [allAthletes, setAllAthletes] = useState<{ athlete_id: number; name: string; country: string; category: string }[]>([]);
  const [batchData, setBatchData] = useState<Record<string, RoundResults> | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchFetchedAt, setBatchFetchedAt] = useState<Date | null>(null);

  // Load tracked climbers from localStorage
  useEffect(() => {
    setTracked(loadTracked(eventId));
  }, [eventId]);

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
      setRoundResults(JSON.parse(e.data));
      setLastUpdate(new Date());
    });

    eventSource.addEventListener("heartbeat", () => {
      setLastUpdate(new Date());
    });

    eventSource.addEventListener("error", () => setSseConnected(false));

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [selectedRoundId, eventId]);

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

  // Fetch all rounds once on page load
  useEffect(() => {
    fetchAllRounds();
  }, [fetchAllRounds]);

  // Derive My Climbers data from batch data
  useEffect(() => {
    if (!batchData || !event) return;

    const allRoundMeta = event.d_cats.flatMap((dcat) =>
      dcat.category_rounds.map((cr) => ({
        id: cr.category_round_id,
        category: dcat.category_name,
        round: cr.name,
        discipline: dcat.discipline_kind,
        status: cr.status,
      }))
    );

    const results: TrackedRoundData[] = [];

    for (const r of allRoundMeta) {
      const data = batchData[r.id];
      if (!data) continue;
      const ranking: Athlete[] = data.ranking ?? [];
      const startlist: StartlistEntry[] = data.startlist ?? [];
      const routes: Route[] = data.routes ?? [];
      const rankedIds = new Set(ranking.map((a) => a.athlete_id));

      for (const [id] of tracked) {
        const athlete = ranking.find((a) => a.athlete_id === id) ?? null;
        const entry = startlist.find((e) => e.athlete_id === id) ?? null;
        if (!athlete && !entry) continue;

        results.push({
          category: r.category,
          round: r.round,
          discipline: r.discipline,
          roundStatus: r.status,
          athlete,
          entry,
          routes,
        });
      }
    }

    setMyClimbersData(results);
    setMyClimbersLoading(false);
  }, [batchData, event, tracked]);

  // Build searchable athlete list from batch data
  useEffect(() => {
    if (!batchData || !event) return;

    const allRoundMeta = event.d_cats.flatMap((dcat) =>
      dcat.category_rounds.map((cr) => ({
        id: cr.category_round_id,
        category: dcat.category_name,
      }))
    );

    const seen = new Set<number>();
    const athletes: typeof allAthletes = [];
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
          });
        }
      }
    }
    athletes.sort((a, b) => a.name.localeCompare(b.name));
    setAllAthletes(athletes);
  }, [batchData, event]);

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
          a.country.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, allAthletes]);

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
            onClick={() => setFilterTracked((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              filterTracked
                ? "bg-yellow-500 text-white border-yellow-500"
                : "bg-yellow-50 text-yellow-800 border-yellow-300 hover:border-yellow-500"
            }`}
          >
            ★ My Climbers{tracked.size > 0 ? ` (${tracked.size})` : ""}
          </button>
          {event.d_cats.map((dcat) =>
            dcat.category_rounds.map((cr) => {
              const isLive =
                cr.status === "active" &&
                dcat.ranking_as_of != null &&
                dcat.ranking_as_of !== "NA";
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
                        ? "bg-green-50 text-green-800 border-green-300 hover:border-green-500"
                        : cr.status === "finished"
                          ? "bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-500"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {label}
                  {isLive && <span className="ml-1 text-xs">●</span>}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search climbers or teams..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                roundResults.status === "finished"
                  ? "bg-gray-100 text-gray-600"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {roundResults.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {roundResults.discipline} · {roundResults.format}
          </p>

          {(roundResults.ranking?.length ?? 0) > 0 ||
          (roundResults.startlist?.length ?? 0) > 0 ? (
            <RoundTable
              ranking={roundResults.ranking ?? []}
              startlist={roundResults.startlist ?? []}
              routes={roundResults.routes ?? []}
              status={roundResults.status}
              tracked={tracked}
              onToggleTrack={toggleTrack}
            />
          ) : (
            <p className="text-gray-500 text-sm">
              No results or startlist available yet.
            </p>
          )}
        </div>
      ) : (
        <p className="text-gray-500">
          Select a category round above to view results.
        </p>
      )}
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
              <th className="p-2">Team</th>
              {routes.map((r) => (
                <th key={r.id} className="p-2 text-center">
                  B{r.name}
                </th>
              ))}
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
                  <td className="p-2 text-gray-500 text-xs">{entry.country}</td>
                  {entry.route_start_positions.map((rsp) => (
                    <td
                      key={rsp.route_id}
                      className="p-2 text-center font-mono text-xs"
                    >
                      {rsp.position}
                    </td>
                  ))}
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

function computeClimberStatus(
  athlete: Athlete | null,
  startlistEntry: StartlistEntry | null,
  roundStatus: string,
): ClimberStatus {
  // Finished round — everyone is done
  if (roundStatus === "finished") {
    return { label: "", style: "", sortKey: 3 };
  }

  // Not started round
  if (roundStatus === "not_started" || !athlete) {
    return {
      label: "Waiting",
      style: "text-gray-400",
      sortKey: 4,
    };
  }

  // Active on wall
  if (athlete.active) {
    const activeRoute = athlete.ascents.find((a) => a.status === "active");
    const routeLabel = activeRoute ? activeRoute.route_name.replace(/.*#/, "B") : "";
    return {
      label: `On wall${routeLabel ? ` — ${routeLabel}` : ""}`,
      style: "text-blue-600 font-medium animate-pulse",
      sortKey: 0,
    };
  }

  // Has results but not currently climbing
  const doneCount = athlete.ascents.filter((a) => a.top_tries != null).length;
  const totalRoutes = athlete.ascents.length;

  if (doneCount >= totalRoutes) {
    return { label: "Done", style: "text-gray-400", sortKey: 3 };
  }

  // Still has routes left but not on wall — waiting for next rotation
  const nextRoute = athlete.ascents.find((a) => a.top_tries == null);
  const routeLabel = nextRoute ? nextRoute.route_name.replace(/.*#/, "B") : "";
  return {
    label: `Next: ${routeLabel}`,
    style: "text-purple-600",
    sortKey: 2,
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
  status: ClimberStatus;
  startPositions: RouteStartPosition[];
  hasResults: boolean;
}

function RoundTable({
  ranking,
  startlist,
  routes,
  status: roundStatus,
  tracked,
  onToggleTrack,
}: {
  ranking: Athlete[];
  startlist: StartlistEntry[];
  routes: Route[];
  status: string;
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
}) {
  // Build unified rows: ranked athletes + unranked startlist entries
  const rankedIds = new Set(ranking.map((a) => a.athlete_id));
  const startlistMap = new Map(startlist.map((e) => [e.athlete_id, e]));

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
      status: computeClimberStatus(athlete, entry ?? null, roundStatus),
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
      status: computeClimberStatus(null, entry, roundStatus),
      startPositions: entry.route_start_positions,
      hasResults: false,
    });
  }

  const hasAscents = ranking[0]?.ascents?.length > 0;
  const isActive = roundStatus === "active";
  const showStartPositions = startlist.length > 0 && routes.length > 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="p-2 w-8"></th>
            <th className="p-2 w-12">#</th>
            <th className="p-2">Climber</th>
            <th className="p-2">Team</th>
            {isActive && <th className="p-2">Status</th>}
            <th className="p-2 text-center">Score</th>
            {hasAscents && <th className="p-2 text-center">Routes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isTracked = tracked.has(row.athlete_id);
            return (
              <tr
                key={row.athlete_id}
                className={`border-t ${
                  isTracked
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
                    onClick={() =>
                      onToggleTrack(row.athlete_id, row.name, row.country)
                    }
                    className="text-lg leading-none"
                  >
                    {isTracked ? "★" : "☆"}
                  </button>
                </td>
                <td className="p-2 text-gray-500 font-mono">
                  {row.rank || "—"}
                </td>
                <td className="p-2">
                  <span className={row.hasResults ? "font-medium" : ""}>{row.name}</span>
                  {row.under_appeal && (
                    <span className="ml-2 text-xs text-orange-600">Appeal</span>
                  )}
                </td>
                <td className="p-2 text-gray-500 text-xs">{row.country}</td>
                {isActive && (
                  <td className="p-2">
                    <span className={`text-xs ${row.status.style}`}>
                      {row.status.label}
                    </span>
                  </td>
                )}
                <td className="p-2 text-center font-mono font-semibold">
                  {row.score || "—"}
                </td>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- My Climbers View ---

function MyClimbersView({
  data,
  tracked,
  onToggleTrack,
}: {
  data: TrackedRoundData[];
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
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
    const id = d.athlete?.athlete_id ?? d.entry?.athlete_id;
    if (!id) continue;
    if (!byClimber.has(id)) byClimber.set(id, []);
    byClimber.get(id)!.push(d);
  }

  return (
    <div className="space-y-4">
      {[...byClimber.entries()].map(([athleteId, rounds]) => {
        const climber = tracked.get(athleteId);
        if (!climber) return null;

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
            </div>

            {/* Round cards */}
            <div className="divide-y divide-yellow-200">
              {rounds.map((r, i) => {
                const status = computeClimberStatus(r.athlete, r.entry, r.roundStatus);
                const hasAscents = (r.athlete?.ascents?.length ?? 0) > 0;

                return (
                  <div key={i} className="px-3 py-2">
                    {/* Round header line */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{r.category}</span>
                      <span className="text-xs text-gray-400">{r.round}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.roundStatus === "finished"
                            ? "bg-gray-100 text-gray-500"
                            : r.roundStatus === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {r.roundStatus}
                      </span>
                      {status.label && (
                        <span className={`text-xs font-medium ${status.style}`}>
                          {status.label}
                        </span>
                      )}
                    </div>

                    {/* Score + ascents */}
                    {r.athlete ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">
                          Rank <span className="font-mono font-semibold text-gray-800">{r.athlete.rank || "—"}</span>
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
                    ) : null}
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
              ? "bg-yellow-100 text-yellow-800"
              : a.low_zone
                ? "bg-orange-100 text-orange-700"
                : attempted
                  ? "bg-red-50 text-red-400"
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
