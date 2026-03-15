# USA Climbing Results API — Reverse-Engineered Reference

> **Source:** `https://usac.results.info`
> **Platform:** Rails backend + Vue 2 SPA frontend, built by [Vertical-Life](https://www.vertical-life.info/)
> **Last verified:** 2026-03-14

There is no official public API documentation. Everything below was discovered by inspecting the JavaScript bundles served by the frontend and testing the endpoints.

---

## Authentication

The API requires a session, even for public data. The pattern:

1. **GET any HTML page** (e.g. `/event/475`) to receive:
   - A `_usac_resultservice_session` cookie (via `Set-Cookie` header)
   - A CSRF token embedded in the HTML: `<meta name="csrf-token" content="...">`

2. **Use both on subsequent API requests** with these headers:
   ```
   Accept: application/json
   X-CSRF-Token: <token from step 1>
   X-Requested-With: XMLHttpRequest
   Cookie: _usac_resultservice_session=<cookie from step 1>
   Referer: https://usac.results.info/
   Origin: https://usac.results.info
   ```

Sessions expire after some time (observed ~30 minutes). If you get a `401`, re-do step 1.

**Important:** Without the `X-Requested-With: XMLHttpRequest` header, the API returns `401 Not Authorized` even with a valid session.

---

## Endpoints

All endpoints are relative to `https://usac.results.info`.

### `GET /entrypoint`

App configuration. **Does not require auth.**

**Response:**
```json
{
  "sidemenu": {},
  "entrypoint": {
    "is_stage": false,
    "is_test": false,
    "signed_in": false,
    "federation": "USAC",
    "federation_fullname": "USA Climbing",
    "show_speed_records": false,
    "keycloak": true,
    "keycloak_login_link": "/users/auth/openid_connect",
    "logout_path": "/users/auth/keycloakopenid/logout"
  },
  "flippers": {
    "jam_format_feature": true,
    "self_registration": true,
    "rankings_filter": true,
    "payments": true,
    ...
  },
  "current_user": null,
  "timezones": [],
  "countries": []
}
```

---

### `GET /api/v1/`

Returns available seasons and the current season.

**Response:**
```json
{
  "current": {
    "id": 5,
    "season": "2026",
    "url": "/api/v1/seasons/5",
    "discipline_kinds": [
      [0, "lead"],
      [1, "speed"],
      [2, "boulder"],
      [3, "combined"],
      [4, "boulder&lead"]
    ],
    "leagues": [
      { "id": 17, "name": "Regionals", ... },
      { "id": 10, "name": "Local", ... }
    ]
  },
  "seasons": [
    { "id": 5, "season": "2026", ... },
    { "id": 4, "season": "2025", ... }
  ]
}
```

---

### `GET /api/v1/live`

Returns events with currently active (in-progress) rounds.

**Response:**
```json
{
  "live": [
    {
      "category_round_id": 11758,
      "event_name": "R92 Boulder Union Youth Boulder Regional Championship",
      "event_id": 498,
      "event_location": "New Bedford",
      "local_start_date": "2026-03-14",
      "local_end_date": "2026-03-15",
      "starts_at": "2026-03-14T04:00:00.000Z",
      "ends_at": "2026-03-16T03:59:00.000Z",
      "category": "F-13",
      "discipline_kind": "boulder",
      "round_name": "Final",
      "timezone": { "value": "America/New_York" }
    }
  ]
}
```

Each entry in `live` is a **category round**, not a whole event. A single event may appear multiple times (once per active category round).

---

### `GET /api/v1/seasons/:seasonId`

Returns events for a given season.

**Response:**
```json
{
  "events": [
    {
      "id": 475,
      "name": "R61 Vertical Endeavors Bloomington Youth Lead/TR Regional Championship",
      "local_start_date": "2026-03-14",
      "local_end_date": "2026-03-14",
      "location": "Bloomington",
      ...
    }
  ]
}
```

---

### `GET /api/v1/events/:eventId`

Full event detail including all discipline categories and their rounds.

**Response (abbreviated):**
```json
{
  "id": 475,
  "name": "R61 Vertical Endeavors Bloomington Youth Lead/TR Regional Championship",
  "type": "classic",
  "starts_at": "2026-03-14 05:00:00 UTC",
  "ends_at": "2026-03-15 04:59:00 UTC",
  "local_start_date": "2026-03-14",
  "local_end_date": "2026-03-14",
  "location": "Bloomington",
  "country": "USA",
  "timezone": { "value": "America/Chicago" },
  "public_information": {
    "organiser_name": "Region 61",
    "organiser_url": "https://usaclimbing.org/compete/region-61/",
    "venue_name": "",
    "description": ""
  },
  "registration_url": "/api/v1/events/475/registrations",
  "registration_deadline": "2026-03-09T18:00:00.000Z",
  "registration_opens_at": "2026-03-02T19:00:00.000Z",
  "athlete_self_registration": true,
  "d_cats": [
    {
      "dcat_id": 376,
      "event_id": 475,
      "dcat_name": "LEAD F-13",
      "discipline_kind": "lead",
      "category_id": 5672,
      "category_name": "F-13",
      "status": "finished",
      "status_as_of": "2026-03-14 23:41:16 UTC",
      "ranking_as_of": "2026-03-14 22:17:04 UTC",
      "category_rounds": [
        {
          "category_round_id": 11515,
          "kind": "lead",
          "name": "Final",
          "category": "F-13",
          "status": "finished",
          "status_as_of": "2026-03-14 23:11:25 UTC",
          "result_url": "/api/v1/category_rounds/11515/results",
          "format": "Custom: 3+ routes, IFSC scoring",
          "routes": [
            {
              "id": 234163,
              "name": "1",
              "startlist": "/api/v1/routes/234163/startlist",
              "ranking": "/api/v1/routes/234163/results"
            }
          ],
          "starting_groups": [],
          "combined_stages": []
        }
      ]
    }
  ]
}
```

**Key concepts:**
- **`d_cats`** = "discipline categories" — e.g. "LEAD F-13", "BOULDER M-11"
- **`category_rounds`** = rounds within a category — e.g. "Qualifiers", "Finals"
- **`category_round_id`** is the primary ID used to fetch results
- **`status`** values: `"not_started"`, `"active"`, `"finished"`

---

### `GET /api/v1/category_rounds/:categoryRoundId/results`

**This is the main results endpoint.** Returns full rankings for a round.

**Response (abbreviated):**
```json
{
  "id": 11515,
  "event": "R61 Vertical Endeavors Bloomington Youth Lead/TR Regional Championship",
  "event_id": 475,
  "dcat_id": 376,
  "discipline": "Lead",
  "status": "finished",
  "status_as_of": "2026-03-14 23:11:25 UTC",
  "category": "F-13",
  "round": "Final",
  "format": "Custom: 3+ routes, IFSC scoring",
  "routes": [
    { "id": 234163, "name": "1", "startlist": "...", "ranking": "..." },
    { "id": 234164, "name": "2", "startlist": "...", "ranking": "..." },
    { "id": 234165, "name": "3", "startlist": "...", "ranking": "..." }
  ],
  "ranking": [
    {
      "athlete_id": 6117,
      "name": "MYERS Mary",
      "firstname": "Mary",
      "lastname": "MYERS",
      "country": "Adventure Rock Climbing Team",
      "flag_url": null,
      "federation_id": 580,
      "bib": "1205",
      "rank": 1,
      "score": "2.57",
      "extra_advancement": false,
      "ascents": [
        {
          "route_id": 234163,
          "route_name": "1",
          "top": true,
          "plus": false,
          "restarted": false,
          "rank": 1,
          "corrective_rank": 8.5,
          "score": "TOP",
          "status": "confirmed",
          "top_tries": null
        }
      ],
      "combined_stages": null,
      "active": false,
      "under_appeal": false,
      "qualified": true
    }
  ]
}
```

**Fields in `ranking[]`:**
| Field | Type | Notes |
|-------|------|-------|
| `athlete_id` | int | Unique per athlete |
| `name` | string | "LASTNAME Firstname" format |
| `country` | string | **Not a country** — this is the team/gym name |
| `bib` | string | Bib number |
| `rank` | int | Current rank (null if not yet ranked) |
| `score` | string | Varies by discipline (e.g. "2.57" for lead, "T3z2 14 10" for boulder) |
| `active` | bool | `true` if the athlete is currently climbing |
| `under_appeal` | bool | Score is being appealed |
| `qualified` | bool | Advanced to next round |
| `ascents` | array | Per-route results (see below) |

**Fields in `ascents[]`:**
| Field | Type | Notes |
|-------|------|-------|
| `route_id` | int | Links to `routes[].id` |
| `route_name` | string | "1", "2", etc. |
| `top` | bool | Reached the top |
| `score` | string | "TOP", hold number, or time |
| `rank` | int | Rank on this specific route |
| `status` | string | "confirmed", "under_appeal" |

**Discipline-specific scoring:**
- **Lead:** score is geometric mean of route ranks (lower = better). Ascent scores are hold numbers or "TOP"
- **Boulder:** score like "T3z2 14 10" (3 tops, 2 zones, 14 top attempts, 10 zone attempts)
- **Speed:** score is time in seconds (e.g. "7.82"). Ascent scores are also times or "FALL"/"FALSE START"

---

### `GET /api/v1/events/:eventId/registrations`

Returns registered athletes for an event.

---

### `GET /api/v1/routes/:routeId/results`

Returns results for a specific route within a round.

---

### `GET /api/v1/routes/:routeId/startlist`

Returns the start order for a specific route.

---

### `GET /api/v1/category_rounds/:id/custom_field_filtered_results/:fieldId?value=X`

Filtered rankings by custom registration fields. Niche — used for filtering by sub-categories.

---

## Real-Time Updates

The site uses **Rails ActionCable** (WebSocket) for real-time updates:
- WebSocket URL: `wss://usac.results.info/usac_cable`
- Protocol: `actioncable-v1-json`
- Cable path is defined in `<div id="cable-path">usac_cable</div>` on the HTML page

The SPA subscribes to channels for live score updates. We haven't reverse-engineered the channel names/subscriptions yet — for now, our app polls `/api/v1/category_rounds/:id/results` every 30 seconds instead.

**Future improvement:** Subscribe to ActionCable channels directly for true push updates instead of polling.

---

## Frontend URL Structure

These are the SPA routes (served as HTML, rendered client-side):

| URL | What it shows |
|-----|---------------|
| `/` | Homepage — season browser, event list |
| `/event/:eventId` | Event overview — categories, rounds |
| `/event/:eventId/cr/:categoryRoundId` | Round results |
| `/event/:eventId/general/:discipline` | General ranking for a discipline |
| `/event/:eventId/team` | Team ranking |
| `/event/:eventId/registrations` | Event registrations |
| `/rankings/` | Overall rankings |
| `/rankings/cup/:cupId/:disciplineKindId?` | Cup rankings |
| `/athletes` | Athlete search |
| `/athlete/:id` | Athlete profile |

---

## Rate Limiting / Terms

No rate limiting was observed during testing. However:
- This is an **undocumented, unofficial API**
- Be respectful — don't hammer it. Our app polls at most every 30 seconds
- The site is powered by Vertical-Life (an Austrian company) on behalf of USA Climbing
- Session cookies and CSRF tokens rotate regularly

---

## Example: Fetching results with curl

```bash
# Step 1: Get session + CSRF
CSRF=$(curl -sL -c cookies.txt 'https://usac.results.info/event/475/cr/11515' \
  | grep -oP 'csrf-token" content="\K[^"]+')

# Step 2: Fetch results
curl -sL -b cookies.txt \
  -H 'Accept: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Referer: https://usac.results.info/event/475/cr/11515' \
  -H 'Origin: https://usac.results.info' \
  'https://usac.results.info/api/v1/category_rounds/11515/results'
```
