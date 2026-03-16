"use client";

import { useEffect, useState, useCallback } from "react";
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
  event_id: number;
  event: string;
  local_start_date: string;
  local_end_date: string;
  location: string;
}

// --- localStorage helpers for favorite events ---

function loadFavoriteEvents(): Set<number> {
  try {
    const saved = localStorage.getItem("favorite-events");
    if (!saved) return new Set();
    return new Set(JSON.parse(saved));
  } catch {
    return new Set();
  }
}

function saveFavoriteEvents(favs: Set<number>) {
  localStorage.setItem("favorite-events", JSON.stringify([...favs]));
}

// --- Date helpers ---

function getDateRange(): { today: string; tomorrow: string; weekEnd: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return {
    today,
    tomorrow: tomorrow.toISOString().split("T")[0],
    weekEnd: weekEnd.toISOString().split("T")[0],
  };
}

function isCurrentOrUpcoming(ev: EventSummary, today: string): boolean {
  return ev.local_end_date >= today;
}

function isThisWeekend(ev: EventSummary, today: string, weekEnd: string): boolean {
  return ev.local_start_date <= weekEnd && ev.local_end_date >= today;
}

export default function Home() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  // Load favorites from localStorage
  useEffect(() => {
    setFavorites(loadFavoriteEvents());
  }, []);

  const toggleFavorite = useCallback((eventId: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      saveFavoriteEvents(next);
      return next;
    });
  }, []);

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
        if (data.events) {
          const sorted = [...data.events].sort(
            (a: EventSummary, b: EventSummary) =>
              b.local_start_date.localeCompare(a.local_start_date)
          );
          setEvents(sorted);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeasonId]);

  // Dedupe live events by event_id for the "Live Now" section
  const liveEventIds = new Set(liveEvents.map((ev) => ev.event_id));
  const uniqueLiveEvents = Array.from(
    liveEvents.reduce((map, ev) => {
      if (!map.has(ev.event_id)) map.set(ev.event_id, ev);
      return map;
    }, new Map<number, LiveEvent>()).values()
  );

  // Split events into sections
  const { today, weekEnd } = getDateRange();

  const favoriteEvents = events.filter(
    (ev) => favorites.has(ev.event_id) && !liveEventIds.has(ev.event_id)
  );
  const thisWeekEvents = events.filter(
    (ev) =>
      isThisWeekend(ev, today, weekEnd) &&
      !favorites.has(ev.event_id) &&
      !liveEventIds.has(ev.event_id)
  );
  const upcomingEvents = events.filter(
    (ev) =>
      isCurrentOrUpcoming(ev, today) &&
      !isThisWeekend(ev, today, weekEnd) &&
      !favorites.has(ev.event_id) &&
      !liveEventIds.has(ev.event_id)
  );
  const pastEvents = events.filter(
    (ev) =>
      !isCurrentOrUpcoming(ev, today) &&
      !favorites.has(ev.event_id) &&
      !liveEventIds.has(ev.event_id)
  );

  const refreshAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/competitions").then((r) => r.json()),
      fetch("/api/competitions?live=true").then((r) => r.json()),
      selectedSeasonId
        ? fetch(`/api/competitions?seasonId=${selectedSeasonId}`).then((r) => r.json())
        : Promise.resolve(null),
    ])
      .then(([seasonsData, liveData, seasonEventsData]) => {
        if (seasonsData.seasons) {
          setSeasons(seasonsData.seasons);
          setCurrentSeason(seasonsData.current);
        }
        if (liveData.live) setLiveEvents(liveData.live);
        if (seasonEventsData?.events) {
          const sorted = [...seasonEventsData.events].sort(
            (a: EventSummary, b: EventSummary) =>
              b.local_start_date.localeCompare(a.local_start_date)
          );
          setEvents(sorted);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeasonId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Competitions</h1>
        <button
          onClick={refreshAll}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 transition-all"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Live events */}
      {uniqueLiveEvents.length > 0 && (
        <section className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-green-800 mb-3">
            Live Now
          </h2>
          <div className="grid gap-2">
            {uniqueLiveEvents.map((ev) => (
              <div key={ev.event_id} className="flex items-center gap-2">
                <button
                  onClick={() => toggleFavorite(ev.event_id)}
                  className="text-lg leading-none shrink-0"
                >
                  {favorites.has(ev.event_id) ? "★" : "☆"}
                </button>
                <Link
                  href={`/comp/${ev.event_id}`}
                  className="flex-1 flex items-center justify-between bg-white rounded-lg p-3 border border-green-100 hover:border-green-400 transition-all"
                >
                  <div>
                    <div className="font-medium">{ev.event_name}</div>
                    <div className="text-sm text-gray-500">
                      {ev.event_location} · {ev.local_start_date}
                      {ev.local_end_date !== ev.local_start_date
                        ? ` – ${ev.local_end_date}`
                        : ""}
                    </div>
                  </div>
                  <span className="text-green-600 text-sm font-medium animate-pulse">
                    LIVE
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Favorite events */}
      {favoriteEvents.length > 0 && (
        <EventSection
          title="My Events"
          events={favoriteEvents}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* This week */}
      {!loading && thisWeekEvents.length > 0 && (
        <EventSection
          title="This Week"
          events={thisWeekEvents}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* Upcoming */}
      {!loading && upcomingEvents.length > 0 && (
        <EventSection
          title="Upcoming"
          events={upcomingEvents}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* Season selector + past events */}
      <section>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold">Past Events</h2>
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
        ) : pastEvents.length > 0 ? (
          <div className="grid gap-2">
            {pastEvents.map((ev) => (
              <EventRow
                key={ev.event_id}
                ev={ev}
                isFavorite={favorites.has(ev.event_id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No past events.</p>
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

// --- Reusable components ---

function EventSection({
  title,
  events,
  favorites,
  onToggleFavorite,
}: {
  title: string;
  events: EventSummary[];
  favorites: Set<number>;
  onToggleFavorite: (id: number) => void;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="grid gap-2">
        {events.map((ev) => (
          <EventRow
            key={ev.event_id}
            ev={ev}
            isFavorite={favorites.has(ev.event_id)}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </section>
  );
}

function EventRow({
  ev,
  isFavorite,
  onToggleFavorite,
}: {
  ev: EventSummary;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onToggleFavorite(ev.event_id)}
        className="text-lg leading-none shrink-0"
      >
        {isFavorite ? "★" : "☆"}
      </button>
      <Link
        href={`/comp/${ev.event_id}`}
        className="flex-1 block border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-all"
      >
        <div className="font-medium">{ev.event}</div>
        <div className="text-sm text-gray-500">
          {ev.location} · {ev.local_start_date}
          {ev.local_end_date !== ev.local_start_date
            ? ` – ${ev.local_end_date}`
            : ""}
        </div>
      </Link>
    </div>
  );
}
