"""
SideKick data pipeline
----------------------
Pulls Premier League lineups and player/squad stats from SportAPI and caches
them in Supabase, so the Chrome extension only ever reads from Supabase (never
from SportAPI directly). Ported from the original Colab notebook to run locally.

Usage:
    python pipeline.py lineups    # refresh lineups for every fixture in the DB
    python pipeline.py players    # fetch league teams' squads + season stats
    python pipeline.py all        # both (default if no argument given)

Setup:
    1. cp .env.example .env   and fill in your real keys
    2. source venv/bin/activate   (or your VS Code interpreter)
    3. pip install -r requirements.txt
    4. python pipeline.py all

.env must define:  SPORTAPI_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
"""

import os
import sys
import time
from datetime import datetime

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# --- config / secrets (loaded from .env, never hardcoded) ---
try:
    SPORTAPI_KEY = os.environ["SPORTAPI_KEY"]
    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
except KeyError as missing:
    sys.exit(f"Missing environment variable {missing}. "
             f"Copy .env.example to .env and fill in your keys.")

BASE = "https://sportapi.ai/api"
HEADERS = {"X-Api-Key": SPORTAPI_KEY}
LEAGUE_ID = 24  # Premier League

# The pipeline writes, so it uses the SECRET key (kept server-side, out of the
# extension). The extension itself reads with the publishable key.
sb = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def pull_lineups():
    """For every fixture already in the DB, pull its lineup (if posted) and cache it.
    Idempotent: clears a fixture's existing lineup rows before inserting fresh ones."""
    fixtures = sb.table("fixtures").select("id").execute().data
    print(f"fixtures to check: {len(fixtures)}")

    total = 0
    for fx in fixtures:
        fid = fx["id"]
        try:
            lu = requests.get(
                f"{BASE}/fixtures/{fid}/lineups", headers=HEADERS, timeout=10
            ).json()
            if not lu.get("available"):
                continue
            rows = []
            for side in ("home", "away"):
                team = lu["data"].get(side, {})
                for grp, starter in (("starters", True), ("subs", False)):
                    for p in team.get(grp, []):
                        rows.append({
                            "fixture_id": fid,
                            "team_side": side,
                            "player_name": p["name"],
                            "position": p["position"],
                            "shirt": p.get("shirt"),
                            "is_captain": p.get("is_captain"),
                            "is_starter": starter,
                            "mins_played": p.get("mins_played"),
                        })
            if rows:
                sb.table("lineups").delete().eq("fixture_id", fid).execute()
                sb.table("lineups").insert(rows).execute()
                total += len(rows)
                print(f"{fid} -> {len(rows)} players")
        except Exception as e:
            print(f"{fid} error: {e}")
        time.sleep(0.5)

    print(f"DONE — total lineup rows stored: {total}")


def clean_dob(dob):
    """Return dob only if it's a valid YYYY-MM-DD date, else None (SportAPI
    occasionally returns malformed dates like '2006-00-00')."""
    if not dob:
        return None
    try:
        datetime.strptime(dob, "%Y-%m-%d")
        return dob
    except Exception:
        return None


def pull_players():
    """Fetch each league team's squad + season stats and cache in the players table.
    Skips teams already stored. Idempotent upsert on (team_name, shirt)."""
    teams = [
        {"id": r["team"]["id"], "name": r["team"]["name"]}
        for r in requests.get(
            f"{BASE}/standings/{LEAGUE_ID}", headers=HEADERS, timeout=10
        ).json().get("data", [])
    ]

    done = {r["team_name"] for r in sb.table("players").select("team_name").execute().data}
    print(f"already stored: {len(done)} teams")

    total = 0
    for t in teams:
        tid, tname = t["id"], t["name"]
        if tname in done:
            print(f"{tname} skip")
            continue
        try:
            squad = requests.get(
                f"{BASE}/teams/{tid}/squad", headers=HEADERS, timeout=10
            ).json().get("squad", [])
        except Exception as e:
            print(f"{tname} squad error: {e}")
            continue

        # Dedupe by shirt number — one row per jersey (some feeds list two).
        by_shirt = {}
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

    print(f"DONE — newly stored players: {total}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd not in ("lineups", "players", "all"):
        sys.exit(f"unknown command: {cmd}\nusage: python pipeline.py [lineups|players|all]")
    if cmd in ("lineups", "all"):
        pull_lineups()
    if cmd in ("players", "all"):
        pull_players()


if __name__ == "__main__":
    main()
