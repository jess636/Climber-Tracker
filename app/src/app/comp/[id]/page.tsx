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

interface TrackedResult {
  category: string;
  round: string;
  discipline: string;
  status: string;
  athlete: Athlete;
}

interface TrackedStartlistResult {
  category: string;
  round: string;
  discipline: string;
  status: string;
  entry: StartlistEntry;
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
  const [myClimbersResults, setMyClimbersResults] = useState<TrackedResult[]>([]);
  const [myClimbersStartlist, setMyClimbersStartlist] = useState<TrackedStartlistResult[]>([]);
  const [myClimbersLoading, setMyClimbersLoading] = useState(false);

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

    eventSource.addEventListener("error", () => setSseConnected(false));

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [selectedRoundId, eventId]);

  // Fetch all rounds when "My Climbers" is active
  useEffect(() => {
    if (!filterTracked || !event || tracked.size === 0) return;

    setMyClimbersLoading(true);
    const allRoundIds = event.d_cats.flatMap((dcat) =>
      dcat.category_rounds.map((cr) => ({
        id: cr.category_round_id,
        category: dcat.category_name,
        round: cr.name,
        discipline: dcat.discipline_kind,
        status: cr.status,
      }))
    );

    Promise.all(
      allRoundIds.map((r) =>
        fetch(`/api/competitions/${eventId}/${r.id}`)
          .then((res) => res.json())
          .then((data) => ({ ...r, data }))
          .catch(() => ({ ...r, data: null }))
      )
    ).then((results) => {
      const tracked_results: TrackedResult[] = [];
      const tracked_startlist: TrackedStartlistResult[] = [];

      for (const r of results) {
        if (!r.data) continue;
        const ranking: Athlete[] = r.data.ranking ?? [];
        const startlist: StartlistEntry[] = r.data.startlist ?? [];
        const routes: Route[] = r.data.routes ?? [];

        for (const athlete of ranking) {
          if (tracked.has(athlete.athlete_id)) {
            tracked_results.push({
              category: r.category,
              round: r.round,
              discipline: r.discipline,
              status: r.status,
              athlete,
            });
          }
        }

        // Only show startlist entries if there's no ranking for this round
        if (ranking.length === 0) {
          for (const entry of startlist) {
            if (tracked.has(entry.athlete_id)) {
              tracked_startlist.push({
                category: r.category,
                round: r.round,
                discipline: r.discipline,
                status: r.status,
                entry,
                routes,
              });
            }
          }
        }
      }

      setMyClimbersResults(tracked_results);
      setMyClimbersStartlist(tracked_startlist);
      setMyClimbersLoading(false);
    });
  }, [filterTracked, event, tracked, eventId]);

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

      {/* Status bar */}
      <div className="flex items-center gap-4 text-sm">
        {sseConnected && (
          <span className="text-green-600 animate-pulse">
            ● Live — polling every 30s
          </span>
        )}
        {lastUpdate && (
          <span className="text-gray-400">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Category rounds selector */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Categories & Rounds</h2>
        <div className="flex flex-wrap gap-2">
          {tracked.size > 0 && (
            <button
              onClick={() => setFilterTracked((v) => !v)}
              // no need to clear selectedRoundId — we just visually deselect via filterTracked
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                filterTracked
                  ? "bg-yellow-500 text-white border-yellow-500"
                  : "bg-yellow-50 text-yellow-800 border-yellow-300 hover:border-yellow-500"
              }`}
            >
              ★ My Climbers ({tracked.size})
            </button>
          )}
          {event.d_cats.map((dcat) =>
            dcat.category_rounds.map((cr) => {
              const isLive =
                cr.status === "active" &&
                dcat.ranking_as_of != null &&
                dcat.ranking_as_of !== "NA";
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
                  {dcat.category_name} · {cr.name}
                  {isLive && <span className="ml-1 text-xs">●</span>}
                </button>
              );
            })
          )}
        </div>
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
            results={myClimbersResults}
            startlistResults={myClimbersStartlist}
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

          {/* Startlist (no results yet) */}
          {(!roundResults.ranking || roundResults.ranking.length === 0) &&
          roundResults.startlist &&
          roundResults.startlist.length > 0 ? (
            <StartlistTable
              startlist={roundResults.startlist}
              routes={roundResults.routes ?? []}
              tracked={tracked}
              onToggleTrack={toggleTrack}
            />
          ) : (roundResults.ranking?.length ?? 0) > 0 ? (
            <RankingTable
              ranking={roundResults.ranking!}
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

// --- Ranking Table ---

function RankingTable({
  ranking,
  tracked,
  onToggleTrack,
}: {
  ranking: Athlete[];
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
}) {
  const hasAscents = ranking[0]?.ascents?.length > 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="p-2 w-8"></th>
            <th className="p-2 w-12">#</th>
            <th className="p-2">Climber</th>
            <th className="p-2">Team</th>
            <th className="p-2 text-center">Score</th>
            {hasAscents && <th className="p-2 text-center">Routes</th>}
          </tr>
        </thead>
        <tbody>
          {ranking.map((athlete) => {
            const isTracked = tracked.has(athlete.athlete_id);
            return (
              <tr
                key={athlete.athlete_id}
                className={`border-t ${
                  isTracked
                    ? "bg-yellow-50 font-medium"
                    : athlete.active
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                } ${athlete.under_appeal ? "opacity-70" : ""}`}
              >
                <td className="p-2">
                  <button
                    onClick={() =>
                      onToggleTrack(
                        athlete.athlete_id,
                        athlete.name,
                        athlete.country
                      )
                    }
                    className="text-lg leading-none"
                  >
                    {isTracked ? "★" : "☆"}
                  </button>
                </td>
                <td className="p-2 text-gray-500 font-mono">
                  {athlete.rank || "—"}
                </td>
                <td className="p-2">
                  <span className="font-medium">{athlete.name}</span>
                  {athlete.active && (
                    <span className="ml-2 text-xs text-blue-600 animate-pulse">
                      Climbing
                    </span>
                  )}
                  {athlete.under_appeal && (
                    <span className="ml-2 text-xs text-orange-600">Appeal</span>
                  )}
                </td>
                <td className="p-2 text-gray-500 text-xs">{athlete.country}</td>
                <td className="p-2 text-center font-mono font-semibold">
                  {athlete.score || "—"}
                </td>
                {hasAscents && (
                  <td className="p-2">
                    <AscentDisplay ascents={athlete.ascents} />
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
  results,
  startlistResults,
  tracked,
  onToggleTrack,
}: {
  results: TrackedResult[];
  startlistResults: TrackedStartlistResult[];
  tracked: Map<number, TrackedClimber>;
  onToggleTrack: (id: number, name: string, country: string) => void;
}) {
  if (results.length === 0 && startlistResults.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Your tracked climbers weren&apos;t found in any rounds yet.
      </p>
    );
  }

  // Group results by category + round
  const grouped = new Map<string, TrackedResult[]>();
  for (const r of results) {
    const key = `${r.category} · ${r.round}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const startlistGrouped = new Map<string, TrackedStartlistResult[]>();
  for (const r of startlistResults) {
    const key = `${r.category} · ${r.round}`;
    if (!startlistGrouped.has(key)) startlistGrouped.set(key, []);
    startlistGrouped.get(key)!.push(r);
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([key, items]) => {
        const first = items[0];
        const hasAscents = items[0]?.athlete.ascents?.length > 0;
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{key}</h3>
              <span className="text-xs text-gray-500 capitalize">{first.discipline}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  first.status === "finished"
                    ? "bg-gray-100 text-gray-600"
                    : first.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {first.status}
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="p-2 w-8"></th>
                    <th className="p-2 w-12">#</th>
                    <th className="p-2">Climber</th>
                    <th className="p-2">Team</th>
                    <th className="p-2 text-center">Score</th>
                    {hasAscents && <th className="p-2 text-center">Routes</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.athlete.athlete_id}
                      className="border-t bg-yellow-50 font-medium"
                    >
                      <td className="p-2">
                        <button
                          onClick={() =>
                            onToggleTrack(
                              item.athlete.athlete_id,
                              item.athlete.name,
                              item.athlete.country
                            )
                          }
                          className="text-lg leading-none"
                        >
                          ★
                        </button>
                      </td>
                      <td className="p-2 text-gray-500 font-mono">
                        {item.athlete.rank || "—"}
                      </td>
                      <td className="p-2">
                        <span className="font-medium">{item.athlete.name}</span>
                        {item.athlete.active && (
                          <span className="ml-2 text-xs text-blue-600 animate-pulse">
                            Climbing
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-gray-500 text-xs">
                        {item.athlete.country}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold">
                        {item.athlete.score || "—"}
                      </td>
                      {hasAscents && (
                        <td className="p-2">
                          <AscentDisplay ascents={item.athlete.ascents} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {[...startlistGrouped.entries()].map(([key, items]) => {
        const first = items[0];
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{key}</h3>
              <span className="text-xs text-gray-500 capitalize">{first.discipline}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {first.status}
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Bib</th>
                    <th className="p-2">Climber</th>
                    <th className="p-2">Team</th>
                    {first.routes.map((r) => (
                      <th key={r.id} className="p-2 text-center">
                        B{r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.entry.athlete_id}
                      className="border-t bg-yellow-50 font-medium"
                    >
                      <td className="p-2">
                        <button
                          onClick={() =>
                            onToggleTrack(
                              item.entry.athlete_id,
                              item.entry.name,
                              item.entry.country
                            )
                          }
                          className="text-lg leading-none"
                        >
                          ★
                        </button>
                      </td>
                      <td className="p-2 text-gray-500 font-mono">{item.entry.bib}</td>
                      <td className="p-2">
                        <span className="font-medium">{item.entry.name}</span>
                      </td>
                      <td className="p-2 text-gray-500 text-xs">{item.entry.country}</td>
                      {item.entry.route_start_positions.map((rsp) => (
                        <td
                          key={rsp.route_id}
                          className="p-2 text-center font-mono text-xs"
                        >
                          {rsp.position}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
        const attempted = isBoulder && !notStarted && !a.top && !a.zone;

        const label = isBoulder
          ? notStarted
            ? ""
            : a.top
              ? `T${a.top_tries ?? ""}`
              : a.zone
                ? `Z${a.zone_tries ?? ""}`
                : `${a.top_tries ?? 0}att`
          : a.score || "—";

        const tooltip = isBoulder
          ? notStarted
            ? `B${a.route_name}: Not started`
            : `B${a.route_name}: ${a.top ? `Top in ${a.top_tries}` : a.zone ? `Zone in ${a.zone_tries}` : `${a.top_tries} attempts, no zone`}${a.points ? ` · ${a.points}pts` : ""}`
          : `Route ${a.route_name}: ${a.score}`;

        const style = notStarted
          ? "bg-gray-100 text-gray-400"
          : a.top
            ? "bg-green-100 text-green-800"
            : a.zone
              ? "bg-yellow-100 text-yellow-800"
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
