# Climber Tracker

Real-time USA Climbing competition tracking app. The primary goal is easier athlete tracking — knowing what route a climber is on and their current results.

## Tech Stack

- Next.js 15 / React 19 / TypeScript on port 3000
- Tailwind CSS 4
- USAC API proxy (usac.results.info) with session/CSRF management
- SSE for real-time updates (30s polling, diff-based)
- localStorage for favorites and tracked climbers (no database currently)
- PWA with service worker

## Project Structure

```
app/
  src/
    app/
      page.tsx                              # Homepage (live, favorites, upcoming, past)
      comp/[id]/page.tsx                    # Competition detail (categories, rounds, rankings, tracking)
      layout.tsx                            # Root layout
      api/
        competitions/route.ts               # Seasons, events, live events
        competitions/batch/route.ts         # Batch fetch multiple rounds in one request
        competitions/[eventId]/[roundId]/route.ts  # Round results
        events/route.ts                     # SSE stream
    lib/
      usac-api.ts                           # USAC API client (with 15s response cache)
      mock-api.ts                           # Mock API for testing without hitting USAC
      rate-limit.ts                         # Rate limiting + SSE connection limits
      diff.ts                               # Result change detection
      fixtures/                             # Mock data for different comp states
        event.json                          # Event overview with mixed round statuses
        round-11629.json ... round-11637.json  # Per-category round fixtures (unique athlete IDs per category)
  public/
    sw.js                                   # Service worker
    manifest.json                           # PWA manifest
```

## Development

```bash
cd app
npm install
npm run dev    # http://localhost:3000 — live USAC API
```

### Mock Mode

Run against fixture data instead of the live USAC API. Use this for UI development and testing — no API calls, no risk of rate limiting, and all four comp states are available.

```bash
cd app
MOCK_MODE=true npx next dev --port 3002   # use any free port
```

Mock data at http://localhost:3002/comp/503 provides these states:

| Round IDs       | Categories          | State            | What you'll see                                  |
|-----------------|---------------------|------------------|--------------------------------------------------|
| 11629–11631, 11633, 11637 | F-13, F-15, F-17, M/O-13, U-11 | Finished | Full results, no active climbers |
| 11632           | F-19                | Active mid-comp  | 15 ranked, 4 actively climbing, 26 on startlist  |
| 11634           | M/O-15              | Just started     | 3 ranked, 1 climbing, rest on startlist           |
| 11635, 11636    | M/O-17, M/O-19      | Not started      | Startlist only, no results                        |

Fixtures are captured from real API data (comp 503, 2026-03-15) with anonymized athlete names, and live in `app/src/lib/fixtures/`. Each category has its own fixture file with unique athlete IDs (offset by 10000 per category to avoid collisions). The mock layer (`mock-api.ts`) maps round IDs to fixture files and adds simulated network delay (50–200ms).

To update fixtures with fresh data from a live comp:
```bash
curl -s 'http://localhost:3000/api/competitions?eventId=EVENT_ID' > app/src/lib/fixtures/event.json
curl -s 'http://localhost:3000/api/competitions/EVENT_ID/ROUND_ID' > app/src/lib/fixtures/round-active.json
```

### API Efficiency

- USAC responses are cached server-side for 15 seconds (`usac-api.ts`)
- The batch endpoint (`/api/competitions/batch?rounds=id1,id2,...`) fetches multiple rounds in one request — used by My Climbers and search instead of N separate calls
- SSE skips the initial poll (client fetches data separately) and only sends updates when data changes
- Be mindful of USAC rate limits — the cache and batch endpoint exist to minimize upstream calls

### Known USAC API Endpoints

**Currently used** (proxied through our API routes via `usac-api.ts`):
- `GET /api/v1/` — seasons, disciplines, leagues
- `GET /api/v1/live` — currently live category rounds
- `GET /api/v1/seasons/:id` — all events for a season
- `GET /api/v1/events/:id` — event detail with categories, rounds, schedules
- `GET /api/v1/events/:id/registrations` — registered athletes (defined, not actively used)
- `GET /api/v1/category_rounds/:id/results` — round results with rankings and ascents
- `GET /api/v1/routes/:id/results` — route-level results (defined, not actively used)
- `GET /api/v1/routes/:id/startlist` — route startlist (defined, not actively used)

**Available but unused:**

| Endpoint | Returns | Potential Use |
|---|---|---|
| `GET /api/v1/athletes/:id` | Full profile: competition history (`all_results[]`), podium counts by discipline, bio (age, gender), photo. Athlete IDs available in every ranking response. | Athlete profiles, historical results, season tracking |
| `GET /api/v1/season_leagues/:id` | Events filtered by league (Youth, Elite, Collegiate, NACS, etc.) | League-specific event views |
| `GET /api/v1/cups/:id/dcat/:id` | Cup/regional ranking standings | Multi-comp season tracking |
| `GET /api/v1/events/:id/result/:id` | Results for a specific d_cat within an event | More targeted than round-level results |
| `GET /api/v1/events/:id/team_results` | Team-level aggregated results | Team standings |
| `GET /entrypoint` | Feature flags, federation info, auth state | Feature detection |

**Sample `/api/v1/athletes/:id` response** (key fields):
```json
{
  "id": 3795,
  "firstname": "Katia", "lastname": "BIEGALSKI",
  "age": 16, "gender": "female",
  "discipline_podiums": [
    { "discipline_kind": "lead", "total": 1, "1": 0, "2": 1, "3": 0 }
  ],
  "all_results": [
    {
      "season": "2026", "rank": 19, "discipline": "lead",
      "event_name": "R12 Bend Rock Gym Youth Lead/TR Regional Championship",
      "event_id": 502, "category_name": "F-19", "date": "2026-03-15"
    }
  ]
}
```

## Boulder Scoring Display

The USAC API returns three zone levels per ascent: `top`, `zone`, and `low_zone`. Display rules:
- **Top** (green): `T{top_tries}` — topped the boulder
- **Zone** (yellow): `Z{zone_tries}` — reached the zone hold
- **Low Zone** (orange): `LZ{low_zone_tries}` — reached the low zone hold
- **Attempts** (red): `A{top_tries}` — only shown when NO hold was reached (no top, no zone, no low zone)

## Climber Status / Queue Depth

The `computeClimberStatus` function determines where a climber is in the rotation:
- **On wall** — actively climbing (ascent has `status: "active"`)
- **On deck** — 0–1 positions away from the current climber on a route
- **N away** — further back in the queue, shows which route (e.g., "3 away — B2")
- **Waiting** — on startlist but positions can't be determined yet
- **Done** / **Finished** — all routes complete or round finished

Queue depth is computed from `route_start_positions` in the startlist. The position gap between routes for an athlete reveals the rest pattern (gap=2 → 1 climb + 1 rest). `computeCurrentPositions` scans ranking data to find the highest confirmed position on each route.

## Current Status

- Homepage with event sections (Live Now, My Events, This Week, Upcoming, Past)
- Competition detail with category/round selection, rankings, startlists
- "My Climbers" always visible, tracking across rounds within an event
- Athlete search by name or team with bulk tracking
- Boulder scoring (top/zone/low zone/attempts), lead/speed scoring
- Climber status with queue depth (on wall, on deck, N away)
- Single-round categories hide redundant "Final" label
- Event favorites with localStorage persistence
- Status bar with live connection indicator, staleness timer, and refresh button (PWA-friendly)
- Rate limiting (60 req/min API, 10 req/min SSE, 50 max SSE connections)
- Mock mode for offline development and testing (anonymized fixture data)
- Docker deployment (stateless Next.js container)

## Testing

No test framework yet. The mock system and fixtures are the foundation for adding tests. Priority test areas:
1. API route tests — hit endpoints in mock mode, verify response shapes
2. Scoring display logic — boulder top/zone/low_zone/attempts rendering
3. Data filtering — My Climbers showing climbers across mixed round states

## Future Plans

- **Live activity history**: real-time feed per climber showing attempts as they happen (diff successive polls to detect changes)
- Push notifications for tracked climber updates (webpush was scaffolded then removed)
- Athlete profiles using `/api/v1/athletes/:id` (competition history, podiums, bio)
- Database persistence (PostgreSQL/Prisma schema exists but was removed for simplicity)
- User accounts / authentication
- Multi-competition season tracking
