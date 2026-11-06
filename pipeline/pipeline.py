"""
SideKick data pipeline
----------------------
Pulls Premier League fixtures, lineups, and player stats from SportAPI and
caches them in Supabase, so the Chrome extension only ever reads from Supabase.

Designed to run on a schedule (see .github/workflows/) and use the API
efficiently — each data type is refreshed only as often as it actually changes:
  - fixtures + scores : daily, for a window of dates around today
  - lineups           : daily, only for fixtures near matchday
  - player season stats : weekly (heavy — one API call per player)

Commands:
    python pipeline.py fixtures   # upsert fixtures + scores for a date window
    python pipeline.py lineups    # pull lineups for fixtures near matchday
    python pipeline.py players    # refresh squads + season stats (weekly)
    python pipeline.py daily      # fixtures + lineups  (default)
    python pipeline.py all        # everything

Setup:
    cp .env.example .env   and fill in your keys, then:
    python -m venv venv && source venv/bin/activate
    pip install -r requirements.txt
    python pipeline.py daily

.env (or CI secrets) must define: SPORTAPI_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
"""

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

try:
    SPORTAPI_KEY = os.environ["SPORTAPI_KEY"]
    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
except KeyError as missing:
    sys.exit(f"Missing environment variable {missing}. Copy .env.example to .env "
             f"and fill in your keys (or set it as a CI secret).")

BASE = "https://sportapi.ai/api"
HEADERS = {"X-Api-Key": SPORTAPI_KEY}
LEAGUE_ID = 24  # Premier League

# Pipeline writes, so it uses the SECRET key (kept server-side / in CI secrets).
# The extension reads with the publishable key.
sb = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def _today():
    return datetime.now(timezone.utc).date()


# ---------------- fixtures + scores ----------------
def pull_fixtures(days_back=2, days_ahead=14):
    """Upsert Premier League fixtures (and their scores/status) for a window of
    dates around today — refreshing recent results and picking up new upcoming
    games. SportAPI lists fixtures by date only, so we query one date at a time."""
    rows = []
    for offset in range(-days_back, days_ahead + 1):
        day = (_today() + timedelta(days=offset)).isoformat()
        try:
            resp = requests.get(f"{BASE}/fixtures/date/{day}", headers=HEADERS, timeout=10).json()
        except Exception as e:
            print(f"{day} error: {e}")
            continue
        items = resp.get("data", []) if isinstance(resp, dict) else (resp or [])
        for m in items:
            if m.get("league_id") != LEAGUE_ID:
                continue
            rows.append({
                "id": m["id"],
                "league_id": LEAGUE_ID,
                "league_name": "Premier League",
                "home_team": m.get("home_team"),
                "away_team": m.get("away_team"),
                "kickoff_utc": m.get("kickoff_utc"),
                "status": m.get("status"),
                "home_score": m.get("home_score"),
                "away_score": m.get("away_score"),
                "match_date": day,
            })
        time.sleep(0.2)
    if rows:
        sb.table("fixtures").upsert(rows, on_conflict="id").execute()
    print(f"DONE fixtures — upserted: {len(rows)}")


# ---------------- lineups ----------------
def pull_lineups(days_back=2, days_ahead=2):
    """Pull lineups only for fixtures near matchday (default: yesterday .. +2 days)
    instead of every fixture in the DB. Idempotent: clears a fixture's rows first."""
    start = (_today() - timedelta(days=days_back)).isoformat()
    end = (_today() + timedelta(days=days_ahead)).isoformat()
    fixtures = (sb.table("fixtures").select("id")
                .gte("match_date", start).lte("match_date", end).execute().data)
    print(f"lineups: checking {len(fixtures)} fixtures in [{start} .. {end}]")

    total = 0
    for fx in fixtures:
        fid = fx["id"]
        try:
            lu = requests.get(f"{BASE}/fixtures/{fid}/lineups", headers=HEADERS, timeout=10).json()
            if not lu.get("available"):
                continue
            rows = []
            for side in ("home", "away"):
                team = lu["data"].get(side, {})
                for grp, starter in (("starters", True), ("subs", False)):
                    for p in team.get(grp, []):
                        rows.append({
                            "fixture_id": fid, "team_side": side,
                            "player_name": p["name"], "position": p["position"],
                            "shirt": p.get("shirt"), "is_captain": p.get("is_captain"),
                            "is_starter": starter, "mins_played": p.get("mins_played"),
                        })
            if rows:
                sb.table("lineups").delete().eq("fixture_id", fid).execute()
                sb.table("lineups").insert(rows).execute()
                total += len(rows)
                print(f"{fid} -> {len(rows)} players")
        except Exception as e:
            print(f"{fid} error: {e}")
        time.sleep(0.5)
    print(f"DONE lineups — rows stored: {total}")


# ---------------- players + season stats ----------------
def clean_dob(dob):
    """Return dob only if it's a valid YYYY-MM-DD date, else None
    (SportAPI occasionally returns malformed dates like '2006-00-00')."""
    if not dob:
        return None
    try:
        datetime.strptime(dob, "%Y-%m-%d")
        return dob
    except Exception:
        return None


def pull_players():
    """Refresh every league team's squad + season stats (heavy — one API call per
    player). Stats accumulate on matchdays, so run this weekly, not daily.
    Idempotent upsert on (team_name, shirt)."""
    teams = [
        {"id": r["team"]["id"], "name": r["team"]["name"]}
        for r in requests.get(f"{BASE}/standings/{LEAGUE_ID}", headers=HEADERS, timeout=10)
                 .json().get("data", [])
    ]
    print(f"players: refreshing {len(teams)} teams")

    total = 0
    for t in teams:
        tid, tname = t["id"], t["name"]
        try:
            squad = requests.get(f"{BASE}/teams/{tid}/squad", headers=HEADERS, timeout=10).json().get("squad", [])
        except Exception as e:
            print(f"{tname} squad error: {e}")
            continue

        by_shirt = {}  # dedupe to one row per jersey number
        for p in squad:
            shirt = p.get("jersey_number")
            if shirt is None or shirt in by_shirt:
                continue
            apps = goals = assists = mins = None
            try:
                tot = requests.get(
                    f"{BASE}/players/stats", headers=HEADERS,
                    params={"name": p.get("full_name"), "team_id": tid, "shirt_number": shirt},
                    timeout=10,
                ).json().get("totals") or {}
                apps, goals = tot.get("appearances"), tot.get("goals")
                assists, mins = tot.get("assists"), tot.get("mins_played")
            except Exception:
                pass
            by_shirt[shirt] = {
                "team_name": tname, "shirt": shirt, "full_name": p.get("full_name"),
                "position": p.get("position"), "nationality": p.get("nationality"),
                "dob": clean_dob(p.get("date_of_birth")),
                "appearances": apps, "goals": goals, "assists": assists, "minutes": mins,
            }
            time.sleep(0.2)

        rows = list(by_shirt.values())
        if rows:
            sb.table("players").upsert(rows, on_conflict="team_name,shirt").execute()
            total += len(rows)
            print(f"{tname} -> {len(rows)}")

    print(f"DONE players — rows upserted: {total}")


# ---------------- entrypoint ----------------
def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "daily"
    if cmd == "fixtures":
        pull_fixtures()
    elif cmd == "lineups":
        pull_lineups()
    elif cmd == "players":
        pull_players()
    elif cmd == "daily":
        pull_fixtures()
        pull_lineups()
    elif cmd == "all":
        pull_fixtures()
        pull_lineups()
        pull_players()
    elif cmd == "backfill":
        # one-time catch-up: refresh scores/status for the whole season so far
        pull_fixtures(days_back=150, days_ahead=14)
    else:
        sys.exit(f"unknown command: {cmd}\n"
                 f"usage: python pipeline.py [fixtures|lineups|players|daily|all|backfill]")


if __name__ == "__main__":
    main()
