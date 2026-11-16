# SideKick ⚽

**Your soccer sidekick** — a Chrome side-panel extension that shows fixtures, standings, formations, and player stats across seven leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, UEFA Champions League, and MLS) right next to your stream, so new fans can follow along without tabbing away to look things up.

## What it does

- **Home dashboard** — a league switcher across the top; pick a league to see its
  upcoming matches and a standings snapshot, each built live from results.
- **Fixtures** — a scrollable page of every matchday for the selected league, grouped
  by date, that opens on current games. Finished matches show the score; upcoming ones
  show kickoff time. The league title stays pinned while the list scrolls beneath it.
- **Standings** — a full table per league (played, goal difference, points, and recent
  form), computed from finished fixtures.
- **Formations** — tap any match to see both lineups laid out on a tactics board,
  ordered defense-to-attack across six position tiers (GK · DEF · DM · MID · AM · FWD).
- **Player cards** — tap a player for a stat card: appearances, goals, assists,
  and minutes.
- **Design** — a frosted-glass UI with an animated light-blue aurora background and a
  subtle 3D tilt on cards.

## Architecture

SideKick never calls the football API from the browser. A batch pipeline pulls data
into a Supabase cache, and the extension reads only from there:

```
SportAPI  ──►  Python pipeline (pipeline.py)  ──►  Supabase (Postgres + RLS)  ──►  Extension
             pulls fixtures / lineups /                   cached data,              reads via
             players, upserts to cache               publishable key only       publishable key
```

Routing every read through the Supabase cache bounds API usage
(one batch pull serves all users, instead of a live API call per panel open) and
keeps the secret API key server-side. The extension only ever holds a publishable
key, which row-level security makes safe to ship publicly.

## Tech stack

- **Extension:** Chrome Manifest V3, Side Panel API, vanilla HTML/CSS/JS
- **Backend:** Supabase (Postgres, REST, Row-Level Security)
- **Pipeline:** a local Python script (`pipeline/pipeline.py`) using requests + supabase-py
- **Data source:** [SportAPI](https://sportapi.ai)

## Install the extension

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on Developer mode in the top-right.
3. Click Load unpacked and select the project folder.
4. Pin SideKick, then click it to open the side panel.

## Run the data pipeline

The pipeline lives in `pipeline/` and caches SportAPI data into Supabase. It's split
by how often each data type changes, so it stays well inside the API quota — the
fixtures endpoint returns every league in one call, so all seven are pulled at once.

```bash
cd pipeline
cp .env.example .env            # add your SportAPI + Supabase keys
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

python pipeline.py daily        # fixtures + lineups  (run often)
python pipeline.py players      # season stats        (run weekly — heavy)
python pipeline.py backfill     # one-time: full season of fixtures
```

In production this runs on a schedule via GitHub Actions (`.github/workflows/`):
fixtures and lineups daily, player stats weekly.

## Project structure

| File                        | Purpose                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `manifest.json`             | Extension config (MV3, side panel, host permissions)                |
| `background.js`             | Service worker — opens the side panel on click                      |
| `panel.html`                | UI markup + all styling (glass theme, aurora)                       |
| `panel.js`                  | App logic — fetches data, renders dashboard/fixtures/formations/cards |
| `pipeline/pipeline.py`      | Data pipeline — pulls SportAPI into Supabase                         |
| `pipeline/requirements.txt` | Python dependencies                                                  |
| `pipeline/.env.example`     | Template for the pipeline's secret keys                              |
| `.github/workflows/`        | Scheduled pipeline runs (daily fixtures/lineups, weekly players)     |

## Roadmap

- Player stats for every league (currently Premier League only)
- Per-league team metadata — proper abbreviations, colors, and crests
- Key data on stable IDs rather than team names
- Conference-aware standings for MLS (Eastern / Western)
