"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Season {
  id: number;
  name: string;
}

interface LiveEvent {
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

interface EventSummary {
  id: number;
  name: string;
  local_start_date: string;
  local_end_date: string;
  location: string;
}

export default function Home() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState("");

  // Load seasons + live events on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/competitions").then((r) => r.json()),
      fetch("/api/competitions?live=true").then((r) => r.json()),
    ])
      .then(([seasonsData, liveData]) => {
        if (seasonsData.seasons) {
          setSeasons(seasonsData.seasons);
          setCurrentSeason(seasonsData.current);
          setSelectedSeasonId(seasonsData.current?.id);
        }
        if (liveData.live) {
          setLiveEvents(liveData.live);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load events when season changes
  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoading(true);
    fetch(`/api/competitions?seasonId=${selectedSeasonId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.events) setEvents(data.events);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeasonId]);

  return (
    <div className="space-y-8">
      {/* Live events banner */}
      {liveEvents.length > 0 && (
        <section className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-green-800 mb-3">
            Live Now
          </h2>
          <div className="grid gap-2">
            {liveEvents.map((ev) => (
              <Link
                key={ev.category_round_id}
                href={`/comp/${ev.event_id}?round=${ev.category_round_id}`}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-green-100 hover:border-green-400 transition-all"
              >
                <div>
                  <div className="font-medium">{ev.event_name}</div>
                  <div className="text-sm text-gray-500">
                    {ev.category} · {ev.round_name} · {ev.discipline_kind}
                  </div>
                </div>
                <span className="text-green-600 text-sm font-medium animate-pulse">
                  LIVE
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick nav */}
      <section>
        <h1 className="text-2xl font-bold mb-2">Competition Browser</h1>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Event ID (e.g. 475)"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && eventId)
                window.location.href = `/comp/${eventId}`;
            }}
          />
          <Link
            href={eventId ? `/comp/${eventId}` : "#"}
            className={`px-5 py-2 rounded-lg font-medium text-white ${
              eventId
                ? "bg-blue-700 hover:bg-blue-800"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            View Event
          </Link>
        </div>
      </section>

      {/* Season selector + events */}
      <section>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold">Events</h2>
          {seasons.length > 0 && (
            <select
              value={selectedSeasonId ?? ""}
              onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {currentSeason?.id === s.id ? " (current)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700" />
            <span className="ml-3 text-gray-600">Loading...</span>
          </div>
        ) : events.length > 0 ? (
          <div className="grid gap-2">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/comp/${ev.id}`}
                className="block border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-all"
              >
                <div className="font-medium">{ev.name}</div>
                <div className="text-sm text-gray-500">
                  {ev.location} · {ev.local_start_date}
                  {ev.local_end_date !== ev.local_start_date
                    ? ` – ${ev.local_end_date}`
                    : ""}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No events found.</p>
        )}
      </section>

      <footer className="text-sm text-gray-400 border-t pt-4">
        Data sourced live from{" "}
        <a
          href="https://usac.results.info"
          className="underline"
          target="_blank"
          rel="noopener"
        >
          usac.results.info
        </a>
        . Not affiliated with USA Climbing.
      </footer>
    </div>
  );
}
