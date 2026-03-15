"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";

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
  score: string;
  rank: number;
  top: boolean;
  status: string;
}

interface Athlete {
  athlete_id: number;
  name: string;
  firstname: string;
  lastname: string;
  country: string; // team/gym
  bib: string;
  rank: number;
  score: string;
  ascents: Ascent[];
  active: boolean;
  under_appeal: boolean;
  qualified: boolean;
}

interface RoundResults {
  id: number;
  event: string;
  discipline: string;
  status: string;
  category: string;
  round: string;
  format: string;
  ranking: Athlete[];
}

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
  const [tracked, setTracked] = useState<Set<number>>(new Set());
  const [sseConnected, setSseConnected] = useState(false);

  // Fetch event overview
  useEffect(() => {
    setLoading(true);
    fetch(`/api/competitions?eventId=${eventId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setEvent(json);
        }
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

    // Initial fetch
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

    // SSE for live updates
    const eventSource = new EventSource(
      `/api/events?roundId=${selectedRoundId}`
    );
    setSseConnected(true);

    eventSource.addEventListener("results", (e) => {
      const data = JSON.parse(e.data);
      setRoundResults(data);
      setLastUpdate(new Date());
    });

    eventSource.addEventListener("changes", (e) => {
      const changes = JSON.parse(e.data);
      // Check if any tracked climbers changed
      const trackedChanges = changes.filter((c: { climberId: string }) =>
        tracked.has(Number(c.climberId))
      );
      if (trackedChanges.length > 0) {
        console.log("Tracked climber updates:", trackedChanges);
      }
    });

    eventSource.addEventListener("error", () => {
      setSseConnected(false);
    });

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [selectedRoundId, eventId, tracked]);

  // Load tracked climbers from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`tracked-${eventId}`);
    if (saved) setTracked(new Set(JSON.parse(saved)));
  }, [eventId]);

  const toggleTrack = useCallback(
    (athleteId: number) => {
      setTracked((prev) => {
        const next = new Set(prev);
        if (next.has(athleteId)) {
          next.delete(athleteId);
        } else {
          next.add(athleteId);
        }
        localStorage.setItem(
          `tracked-${eventId}`,
          JSON.stringify([...next])
        );
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
        {tracked.size > 0 && (
          <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
            Tracking {tracked.size} climber{tracked.size > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Category rounds selector */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Categories & Rounds</h2>
        <div className="flex flex-wrap gap-2">
          {event.d_cats.map((dcat) =>
            dcat.category_rounds.map((cr) => (
              <button
                key={cr.category_round_id}
                onClick={() => setSelectedRoundId(cr.category_round_id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  selectedRoundId === cr.category_round_id
                    ? "bg-blue-700 text-white border-blue-700"
                    : cr.status === "finished"
                      ? "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                      : "bg-green-50 text-green-800 border-green-300 hover:border-green-500"
                }`}
              >
                {dcat.category_name} · {cr.name}
                {cr.status !== "finished" && (
                  <span className="ml-1 text-xs">●</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Results */}
      {roundLoading ? (
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

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-2 w-8"></th>
                  <th className="p-2 w-12">#</th>
                  <th className="p-2">Climber</th>
                  <th className="p-2">Team</th>
                  <th className="p-2 text-center">Score</th>
                  {roundResults.ranking[0]?.ascents?.length > 0 && (
                    <th className="p-2 text-center">Routes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {roundResults.ranking.map((athlete) => {
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
                          onClick={() => toggleTrack(athlete.athlete_id)}
                          className="text-lg leading-none"
                          title={isTracked ? "Untrack" : "Track this climber"}
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
                          <span className="ml-2 text-xs text-orange-600">
                            Appeal
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-gray-500 text-xs">
                        {athlete.country}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold">
                        {athlete.score || "—"}
                      </td>
                      {roundResults.ranking[0]?.ascents?.length > 0 && (
                        <td className="p-2">
                          <div className="flex gap-1 justify-center">
                            {athlete.ascents.map((a, i) => (
                              <span
                                key={i}
                                className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                                  a.top
                                    ? "bg-green-100 text-green-800"
                                    : a.score
                                      ? "bg-gray-100 text-gray-700"
                                      : "bg-gray-50 text-gray-400"
                                }`}
                                title={`Route ${a.route_name}: ${a.score}`}
                              >
                                {a.score || "—"}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">
          Select a category round above to view results.
        </p>
      )}
    </div>
  );
}
