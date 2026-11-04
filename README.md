# SideKick ⚽

**Your soccer sidekick** — a Chrome side-panel extension that shows Premier League
fixtures, formations, and player stats right next to your stream, so new fans can
follow along without tabbing away to look things up.

## What it does

- **Fixtures** — a single scrollable page of every matchday, grouped by date, that
  opens on current games. Finished matches show the score; upcoming ones show kickoff time.
- **Formations** — tap any match to see both lineups laid out on a tactics board,
  ordered defense-to-attack across six position tiers (GK · DEF · DM · MID · AM · FWD).
- **Player cards** — tap a player for a stat card: appearances, goals, assists,
  and minutes.
- **Design** — a frosted-glass UI with an animated light-blue aurora background.

## Architecture

SideKick never calls the football API from the browser. A batch pipeline pulls data
into a Supabase cache, and the extension reads only from there:

```
SportAPI  ──►  Python pipeline (pipeline.py)  ──►  Supabase (Postgres + RLS)  ──►  Extension
             pulls fixtures / lineups /                   cached data,              reads via
             players, upserts to cache               publishable key only       publishable key
```

**Why this matters:** routing every read through the Supabase cache **bounds API usage**
(one batch pull serves all users, instead of a live API call per panel open) and
**keeps the secret API key server-side** — the extension only ever holds a publishable
key, which row-level security makes safe to ship publicly.

## Tech stack

- **Extension:** Chrome Manifest V3, Side Panel API, vanilla HTML/CSS/JS (no framework, no build step)
- **Backend:** Supabase (Postgres, REST, Row-Level Security)
- **Pipeline:** a local Python script (`pipeline/pipeline.py`) using requests + supabase-py
- **Data source:** [SportAPI](https://sportapi.ai)

## Install the extension (load unpacked)

1. Download or clone this repo, keeping the folder somewhere permanent.
2. Open `chrome://extensions` and turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the project folder.
4. Pin SideKick, then click it to open the side panel.

## Run the data pipeline

The pipeline lives in `pipeline/` and caches SportAPI data into Supabase.

```bash
cd pipeline
cp .env.example .env            # add your SportAPI + Supabase keys
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python pipeline.py all          
```

## Project structure

| File                        | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `manifest.json`             | Extension config (MV3, side panel, host permissions)        |
| `background.js`             | Service worker — opens the side panel on click              |
| `panel.html`                | UI markup + all styling (glass theme, aurora)               |
| `panel.js`                  | App logic — fetches data, renders fixtures/formations/cards |
| `pipeline/pipeline.py`      | Data pipeline — pulls SportAPI → Supabase (lineups, players)|
| `pipeline/requirements.txt` | Python dependencies                                         |
| `pipeline/.env.example`     | Template for the pipeline's secret keys                     |

## Roadmap

- Automate the pipeline (scheduled job instead of a manual run)
- Key data on stable IDs rather than team names
- Additional leagues beyond the Premier League
