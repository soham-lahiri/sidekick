// ===== SideKick panel =====
const SUPABASE_URL = "https://ykcagxlgmbfspnkgvrnh.supabase.co";
const SUPABASE_KEY = "sb_publishable_zOkXOQIvOTI8dzg4XV3R2w_ELFYVD5W";
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
const SEASON_START = "2026-08-21";

const BAND_ORDER = ["GK", "DEF", "DM", "MID", "AM", "FWD"]; // defense -> attack

const content = document.getElementById("content");

// ---- country / nationality ----
const COUNTRY = {
  "GB-ENG":"England","GB-SCT":"Scotland","GB-WLS":"Wales","GB-NIR":"Northern Ireland",
  "FR":"France","ES":"Spain","DE":"Germany","IT":"Italy","PT":"Portugal","NL":"Netherlands",
  "BE":"Belgium","BR":"Brazil","AR":"Argentina","US":"USA","NG":"Nigeria","GH":"Ghana",
  "CI":"Ivory Coast","SN":"Senegal","EG":"Egypt","MA":"Morocco","JP":"Japan","KR":"South Korea",
  "DK":"Denmark","SE":"Sweden","NO":"Norway","HR":"Croatia","RS":"Serbia","PL":"Poland",
  "UY":"Uruguay","CO":"Colombia","MX":"Mexico","CH":"Switzerland","AT":"Austria","IE":"Ireland",
  "UA":"Ukraine","TR":"Turkey","CM":"Cameroon","ML":"Mali","DZ":"Algeria","EC":"Ecuador",
  "GR":"Greece","CZ":"Czechia","SK":"Slovakia","HU":"Hungary","RO":"Romania","FI":"Finland",
  "IS":"Iceland","AU":"Australia","CA":"Canada","JM":"Jamaica","PY":"Paraguay","CL":"Chile",
  "VE":"Venezuela","CD":"DR Congo","GN":"Guinea","GA":"Gabon","BF":"Burkina Faso","ZW":"Zimbabwe"
};
function flagFromCC(cc) {
  if (!cc) return "";
  const base = cc.split("-")[0].toUpperCase();
  if (base.length !== 2) return "";
  const A = 0x1F1E6;
  const cps = [...base].map(c => A + (c.charCodeAt(0) - 65));
  if (cps.some(p => p < A || p > A + 25)) return "";
  return String.fromCodePoint(...cps);
}
function natLabel(cc) {
  if (!cc) return "";
  const name = COUNTRY[cc] || COUNTRY[cc.split("-")[0]] || cc;
  const flag = flagFromCC(cc);
  return flag ? `${flag} ${name}` : name;
}

// ---- helpers ----
async function api(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function isoShift(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function maxDateISO() { return isoShift(todayISO(), 21); }
function shortName(full) {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  return parts.length === 1 ? parts[0] : parts[parts.length - 1];
}
function age(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
function fmtDateHeader(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
}
function fmtTime(d) {
  if (!d) return "";
  if (typeof d === "string") d = new Date(d);
  if (isNaN(d)) return "";
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = m < 10 ? "0" + m : m;
  return `${h}:${mm}<span class="ampm">${ap}</span>`;
}
function matchRight(f) {
  const finished = f.status === "FT" || (f.home_score != null && f.away_score != null);
  if (finished) {
    return `<div class="t1">${f.home_score ?? ""}–${f.away_score ?? ""}</div><div class="t2">FT</div>`;
  }
  if (!f.kickoff_utc) return `<div class="t1">—</div>`;
  const ko = new Date(f.kickoff_utc);
  const end = new Date(ko);
  end.setHours(end.getHours() + 2);
  return `<div class="t1">${fmtTime(ko)}</div><div class="t2">${fmtTime(end)}</div>`;
}

// ---- lineup rows ----
function bandOf(position) {
  const p = (position || "").toLowerCase();
  if (p.includes("goalkeep") || p === "gk" || p === "g") return "GK";
  if (p.includes("defensive mid") || p.includes("def mid") || p === "dm" || p === "cdm") return "DM";
  if (p.includes("attacking mid") || p.includes("att mid") || p === "am" || p === "cam") return "AM";
  if (p.includes("midfield") || p === "mid" || p === "mf" || p === "m") return "MID";
  if (p.includes("defend") || p.includes("defence") || p.includes("defense") || p.includes("back") || p === "def" || p === "df" || p === "d") return "DEF";
  if (p.includes("strik") || p.includes("forward") || p.includes("attacker") || p.includes("wing") || p === "fw" || p === "f" || p === "st") return "FWD";
  return "MID";
}

function rowsFor(players, side) {
  const by = { GK: [], DEF: [], DM: [], MID: [], AM: [], FWD: [] };
  players.forEach(p => by[bandOf(p.position)].push(p));
  // away = top half: GK at top, attackers near halfway. home = bottom half: attackers near halfway, GK at bottom.
  const order = side === "home" ? [...BAND_ORDER].reverse() : [...BAND_ORDER];
  return order.map(k => ({ line: k, players: by[k] })).filter(r => r.players.length);
}
function chip(p, team, side) {
  const nm = shortName(p.player_name);
  const cap = p.is_captain ? "1" : "0";
  const mins = p.mins_played != null ? p.mins_played : "";
  return `<div class="pchip ${side}" data-name="${encodeURIComponent(p.player_name || "")}"
      data-team="${encodeURIComponent(team)}" data-shirt="${p.shirt ?? ""}"
      data-pos="${p.position || ""}" data-cap="${cap}" data-mins="${mins}">
      <div class="jersey">${p.shirt ?? ""}</div>
      <div class="pname">${nm}${p.is_captain ? " (C)" : ""}</div>
    </div>`;
}

// ===== 3D CARD EFFECT — tweak these to taste =====
const TILT = {
  perspective: 900,   // depth of the 3D space (px). LOWER = more extreme 3D. Try 500-1400.
  maxTilt: 12,        // max tilt at the edges (degrees). Try 4-20.
  rowDivisor: 22,     // fixtures rows: cursor divisor. HIGHER = gentler tilt. Try 14-40.
  pitchDivisor: 75,   // formation board. HIGHER = gentler.
  cardDivisor: 50,    // player card. HIGHER = gentler.
  popDepth: 0.75,        // player-card layer pop-out. 0 = flat, 1 = default, 2 = dramatic.
  ease: 0.18,         // settle/return speed (seconds). Higher = slower, smoother trail.
};

// Which player-card elements float forward, and how far (px). Scaled by TILT.popDepth.
const CARD_LAYERS = [
  [".pcard-close", 0],
  [".pcard-num",   70],
  [".pcard-name",  55],
  [".tiles",       50],
  [".pcard-sub",   42],
  [".pcard-sec",   28],
  [".statrow",     26],
];
// ==================================================

// flat tilt — fixtures rows & formation board
function attachTilt(el, divisor) {
  if (!el) return;
  el.style.willChange = "transform";
  el.style.transition = `transform ${TILT.ease}s ease-out, background .15s ease`;
  el.addEventListener("mousemove", (e) => {
    const r = el.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / divisor;
    let y = (e.clientY - r.top - r.height / 2) / divisor;
    x = Math.max(-TILT.maxTilt, Math.min(TILT.maxTilt, x));
    y = Math.max(-TILT.maxTilt, Math.min(TILT.maxTilt, y));
    el.style.transform = `perspective(${TILT.perspective}px) rotateY(${x}deg) rotateX(${-y}deg)`;
  });
  el.addEventListener("mouseleave", () => {
    el.style.transform = `perspective(${TILT.perspective}px) rotateY(0deg) rotateX(0deg)`;
  });
}

// tilt + layered depth — player card (true CardItem pop-out)
function attachCard3D(card) {
  if (!card) return;
  if (card.parentElement) card.parentElement.style.perspective = TILT.perspective + "px";
  card.style.transformStyle = "preserve-3d";
  card.style.willChange = "transform";
  card.style.transition = `transform ${TILT.ease}s ease-out`;
  const layers = CARD_LAYERS
    .map(([sel, z]) => [card.querySelector(sel), z])
    .filter(([el]) => el);
  layers.forEach(([el]) => { el.style.transition = `transform ${TILT.ease}s ease-out`; });
  const pop = (on) => layers.forEach(([el, z]) => {
    el.style.transform = on ? `translateZ(${z * TILT.popDepth}px)` : "translateZ(0px)";
  });
  card.addEventListener("mouseenter", () => pop(true));
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / TILT.cardDivisor;
    let y = (e.clientY - r.top - r.height / 2) / TILT.cardDivisor;
    x = Math.max(-TILT.maxTilt, Math.min(TILT.maxTilt, x));
    y = Math.max(-TILT.maxTilt, Math.min(TILT.maxTilt, y));
    card.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`; // perspective comes from the overlay
  });
  card.addEventListener("mouseleave", () => {
    pop(false);
    card.style.transform = `rotateY(0deg) rotateX(0deg)`;
  });
}

// ===== leagues (apiId = SportAPI league id used to filter the fixtures table) =====
const LEAGUES = [
  { id: "PL",  name: "Premier League",   logo: "icons/pl.jpg",  apiId: 24 },
  { id: "LL",  name: "La Liga",          logo: "icons/ll.png",  apiId: 1 },
  { id: "BL",  name: "Bundesliga",       logo: "icons/bl.svg",  apiId: 2 },
  { id: "SA",  name: "Serie A",          logo: "icons/sa.jpg",  apiId: 3 },
  { id: "L1",  name: "Ligue 1",          logo: "icons/l1.png",  apiId: 9 },
  { id: "CL",  name: "Champions League", logo: "icons/cl.jpg",  apiId: 18 },
  { id: "MLS", name: "MLS",              logo: "icons/mls.png", apiId: 89, bg: "#000000" },
];
function leagueById(id) { return LEAGUES.find(l => l.id === id) || LEAGUES[0]; }
let currentLeagueId = "PL";

// ===== Premier League team display meta: [abbreviation, short name, accent color] =====
const PL_TEAMS = {
  "Arsenal": ["ARS","Arsenal","#EF0107"],
  "Manchester City": ["MCI","Man City","#6CABDD"],
  "Liverpool": ["LIV","Liverpool","#C8102E"],
  "Chelsea": ["CHE","Chelsea","#034694"],
  "Aston Villa": ["AVL","Aston Villa","#670E36"],
  "Manchester United": ["MUN","Man United","#DA291C"],
  "Tottenham Hotspur": ["TOT","Tottenham","#132257"],
  "Newcastle United": ["NEW","Newcastle","#241F20"],
  "Brighton & Hove Albion": ["BHA","Brighton","#0057B8"],
  "Brentford": ["BRE","Brentford","#E30613"],
  "Everton": ["EVE","Everton","#003399"],
  "Crystal Palace": ["CRY","Crystal Palace","#1B458F"],
  "Fulham": ["FUL","Fulham","#1a1a1a"],
  "AFC Bournemouth": ["BOU","Bournemouth","#DA291C"],
  "Nottingham Forest": ["NFO","Nott'm Forest","#DD0000"],
  "Coventry City": ["COV","Coventry","#60B5E5"],
  "Sunderland": ["SUN","Sunderland","#EB172B"],
  "Leeds United": ["LEE","Leeds","#1D428A"],
  "Hull City": ["HUL","Hull City","#F18A01"],
  "Ipswich Town": ["IPS","Ipswich","#3A64A3"],
};
function teamMeta(name) {
  if (PL_TEAMS[name]) return { abbr: PL_TEAMS[name][0], short: PL_TEAMS[name][1], color: PL_TEAMS[name][2] };
  const clean = (name || "").replace(/^(AFC|FC)\s+/i, "").trim();
  return { abbr: clean.slice(0, 3).toUpperCase() || "—", short: name || "—", color: "#64748b" };
}

// ---- match status ----
function isFinished(f) {
  if (/^(ft|aet|pen|full)/i.test(f.status || "")) return true;
  return f.home_score != null && f.away_score != null && !/live|1h|2h|half|^ht|^et/i.test(f.status || "");
}
function isLive(f) {
  return /live|1h|2h|half|^ht|^et/i.test(f.status || "") && !isFinished(f);
}

// ---- standings computed from finished fixtures ----
function computeStandings(fixtures) {
  const t = {};
  const ensure = n => (t[n] = t[n] || { team: n, p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0, form:[] });
  const finished = fixtures
    .filter(isFinished)
    .sort((a, b) => (a.match_date || "").localeCompare(b.match_date || ""));
  for (const f of finished) {
    if (f.home_score == null || f.away_score == null) continue;
    const h = ensure(f.home_team), a = ensure(f.away_team);
    const hs = f.home_score, as = f.away_score;
    h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push("W"); a.form.push("L"); }
    else if (hs < as) { a.w++; h.l++; a.pts += 3; h.form.push("L"); a.form.push("W"); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("D"); a.form.push("D"); }
  }
  return Object.values(t)
    .map(x => ({ ...x, gd: x.gf - x.ga, form: x.form.slice(-5) }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
}

// ---- screens ----
async function showHome() {
  content.innerHTML = `
    <div class="panel">
      <div class="leaguebar">
        ${LEAGUES.map(l => `
          <div class="lchip ${l.id === currentLeagueId ? "active" : "soon"}" data-id="${l.id}" data-name="${l.name}" title="${l.name}">
            <div class="lchip-badge"${l.bg ? ` style="background:${l.bg}"` : ""}><img src="${l.logo}" alt="${l.name}"></div>
          </div>`).join("")}
      </div>
      <div id="home-body"><div class="empty">Loading…</div></div>
    </div>`;

  content.querySelectorAll(".lchip").forEach(chipEl => {
    chipEl.addEventListener("click", () => {
      currentLeagueId = chipEl.dataset.id;
      setActiveChip(currentLeagueId);
      renderLeagueHome(leagueById(currentLeagueId));
    });
  });

  setActiveChip(currentLeagueId);
  renderLeagueHome(leagueById(currentLeagueId));
}

function setActiveChip(id) {
  content.querySelectorAll(".lchip").forEach(c => {
    const on = c.dataset.id === id;
    c.classList.toggle("active", on);
    c.classList.toggle("soon", !on);
  });
}

function renderComingSoon(name) {
  const body = document.getElementById("home-body");
  if (body) body.innerHTML = `
    <div class="empty">
      <div class="soon-emoji">🔜</div>
      <b>${name}</b> is coming soon.<br>
      The data pipeline for this league isn't built yet.
    </div>`;
}

async function renderLeagueHome(league) {
  const body = document.getElementById("home-body");
  if (!body) return;
  body.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    const fixtures = await api(`fixtures?league_id=eq.${league.apiId}&order=match_date,kickoff_utc&select=*`);
    if (!fixtures.length) { renderComingSoon(league.name); return; }
    const standings = computeStandings(fixtures);
    const topSet = new Set(standings.slice(0, 4).map(s => s.team));

    const today = todayISO();
    const upcoming = fixtures
      .filter(f => (f.match_date || "") >= today)
      .sort((a, b) => (a.match_date || "").localeCompare(b.match_date || "") || (a.kickoff_utc || "").localeCompare(b.kickoff_utc || ""))
      .slice(0, 7);

    body.innerHTML = `
      <div class="sec-head"><span>Upcoming</span><a class="sec-link" id="see-all">See all →</a></div>
      <div id="upcoming">${renderUpcoming(upcoming, topSet)}</div>
      <div class="sec-head" style="margin-top:16px"><span>Standings</span><a class="sec-link" id="full-table">Full table →</a></div>
      <div id="standings">${renderStandings(standings.slice(0, 5))}</div>
      <div class="footer">${league.name}</div>`;

    const seeAll = document.getElementById("see-all");
    if (seeAll) seeAll.addEventListener("click", () => showFixtures(league));
    const fullTable = document.getElementById("full-table");
    if (fullTable) fullTable.addEventListener("click", () => showStandings(standings, league));
    body.querySelectorAll(".upc-row").forEach(el =>
      el.addEventListener("click", () =>
        showLineup(el.dataset.id, decodeURIComponent(el.dataset.home), decodeURIComponent(el.dataset.away))));
  } catch (err) {
    body.innerHTML = `<div class="empty">Error loading: ${err.message}</div>`;
  }
}

function dayLabel(dateStr) {
  const today = todayISO();
  if (dateStr === today) return "TODAY";
  if (dateStr === isoShift(today, 1)) return "TOMORROW";
  return fmtDateHeader(dateStr);
}

function renderUpcoming(list, topSet) {
  if (!list.length) return `<div class="empty">No upcoming matches.</div>`;
  const groups = {}; const order = [];
  list.forEach(f => {
    const d = f.match_date || "TBD";
    if (!groups[d]) { groups[d] = []; order.push(d); }
    groups[d].push(f);
  });
  return order.map(d => `
    <div class="upc-day">${d === "TBD" ? "DATE TBD" : dayLabel(d)}</div>
    ${groups[d].map(f => upcomingRow(f, topSet)).join("")}`).join("");
}

function upcomingRow(f, topSet) {
  const live = isLive(f), fin = isFinished(f);
  const scored = f.home_score != null && f.away_score != null;
  const matchup = scored
    ? `${f.home_team} <b>${f.home_score}–${f.away_score}</b> ${f.away_team}`
    : `${f.home_team} <span class="vs">vs</span> ${f.away_team}`;
  const tag = (topSet.has(f.home_team) && topSet.has(f.away_team))
    ? `<span class="upc-tag">Top 4 clash</span>` : "";
  let right = "";
  if (live) right = `<span class="live">● LIVE</span>`;
  else if (fin) right = `<span class="ft">FT</span>`;
  else if (f.kickoff_utc) right = `<span class="kot">${fmtTime(f.kickoff_utc)}</span>`;
  return `<div class="upc-row" data-id="${f.id}" data-home="${encodeURIComponent(f.home_team)}" data-away="${encodeURIComponent(f.away_team)}">
    <span class="upc-match">${matchup}</span>
    ${tag}
    <span class="upc-right">${right}</span>
  </div>`;
}

function formDots(form) {
  if (!form.length) return `<span class="form"></span>`;
  return `<span class="form">${form.map(r => `<span class="fd ${r}"></span>`).join("")}</span>`;
}

function renderStandings(rows) {
  if (!rows.length) return `<div class="empty">Standings will appear once results are in.</div>`;
  return `
    <div class="st-head"><span class="st-rank">#</span><span class="st-team">TEAM</span><span class="st-form">FORM</span><span class="st-num">P</span><span class="st-num">GD</span><span class="st-num">PTS</span></div>
    ${rows.map((r, i) => {
      const m = teamMeta(r.team);
      return `<div class="st-row">
        <span class="st-rank">${i + 1}</span>
        <span class="st-team">${m.short}</span>
        <span class="st-form">${formDots(r.form)}</span>
        <span class="st-num">${r.p}</span>
        <span class="st-num">${r.gd > 0 ? "+" + r.gd : r.gd}</span>
        <span class="st-num pts">${r.pts}</span>
      </div>`;
    }).join("")}`;
}

// Full scrollable fixtures list (reached via "See all")
async function showFixtures(league) {
  content.innerHTML = `
    <div class="fx-page">
      <button id="back">← Home</button>
      <div class="panel fx-panel">
        <div class="fx-titlebar">
          <div class="apptitle">${league.name}</div>
          <div class="appsub">All fixtures · tap a match for lineups</div>
        </div>
        <div id="fixtures">Loading…</div>
      </div>
    </div>`;
  document.getElementById("back").addEventListener("click", showHome);
  const fx = document.getElementById("fixtures");
  try {
    const fixtures = await api(`fixtures?league_id=eq.${league.apiId}&order=match_date,kickoff_utc&select=*`);
    if (!fixtures.length) {
      fx.innerHTML = `<div class="empty">No fixtures loaded yet.</div>`;
      return;
    }
    const groups = {};
    const dateOrder = [];
    fixtures.forEach(f => {
      const d = f.match_date || (f.kickoff_utc ? f.kickoff_utc.slice(0, 10) : "TBD");
      if (!groups[d]) { groups[d] = []; dateOrder.push(d); }
      groups[d].push(f);
    });
    const today = todayISO();
    const anchorDate = dateOrder.find(d => d >= today) || dateOrder[dateOrder.length - 1];
    fx.innerHTML = dateOrder.map(d => `
      <div class="daygroup"${d === anchorDate ? ' id="anchor"' : ''}>
        <div class="date-title">${d === "TBD" ? "DATE TBD" : fmtDateHeader(d)}</div>
        ${groups[d].map(f => `
          <div class="match" data-id="${f.id}" data-home="${encodeURIComponent(f.home_team)}" data-away="${encodeURIComponent(f.away_team)}">
            <div class="title">${f.home_team} vs ${f.away_team}</div>
            <div class="right">${matchRight(f)}</div>
          </div>`).join("")}
      </div>`).join("");
    fx.querySelectorAll(".match").forEach(el => {
      el.addEventListener("click", () =>
        showLineup(el.dataset.id, decodeURIComponent(el.dataset.home), decodeURIComponent(el.dataset.away)));
      attachTilt(el, TILT.rowDivisor);
    });
    const anchor = document.getElementById("anchor");
    if (anchor) requestAnimationFrame(() => anchor.scrollIntoView({ block: "start" }));
  } catch (err) {
    fx.innerHTML = `<div class="empty">Error loading fixtures: ${err.message}</div>`;
  }
}

// Full standings table (reached via "Full table")
function showStandings(rows, league) {
  content.innerHTML = `
    <div class="fx-page">
      <button id="back">← Home</button>
      <div class="panel fx-panel">
        <div class="fx-titlebar">
          <div class="apptitle">${league ? league.name : "Standings"}</div>
          <div class="appsub">Standings · computed from results</div>
        </div>
        <div class="standings-full">${renderStandings(rows)}</div>
      </div>
    </div>`;
  document.getElementById("back").addEventListener("click", showHome);
}

async function showLineup(fixtureId, home, away) {
  content.innerHTML = `
    <button id="back">← Back</button>
    <div class="pitch" id="pitch">Loading lineups…</div>
    <div class="hint">Tap a player for stats</div>`;
  document.getElementById("back").addEventListener("click", () => showHome());
  const pitch = document.getElementById("pitch");
  try {
    const rows = await api(`lineups?fixture_id=eq.${fixtureId}&select=*`);
    if (!rows.length) {
      pitch.innerHTML = `<div class="empty">Lineups not posted yet.<br>They usually appear ~60 min before kickoff.</div>`;
      return;
    }
    const homePlayers = rows.filter(r => r.team_side === "home" && r.is_starter);
    const awayPlayers = rows.filter(r => r.team_side === "away" && r.is_starter);
    const awayRows = rowsFor(awayPlayers, "away");
    const homeRows = rowsFor(homePlayers, "home");
    const renderHalf = (teamName, teamRows, side) =>
      `<div class="teamlabel">${teamName}</div>
       <div class="half">${teamRows.map(r =>
          `<div class="prow">${r.players.map(p => chip(p, teamName, side)).join("")}</div>`).join("")}</div>`;
    pitch.innerHTML =
      renderHalf(away, awayRows, "away") +
      `<div class="halfline"></div>` +
      renderHalf(home, homeRows, "home");
    pitch.querySelectorAll(".pchip").forEach(el =>
      el.addEventListener("click", () => showPlayerCard({
        name: decodeURIComponent(el.dataset.name),
        team: decodeURIComponent(el.dataset.team),
        shirt: el.dataset.shirt,
        pos: el.dataset.pos,
        cap: el.dataset.cap,
        mins: el.dataset.mins
      })));
    attachTilt(pitch, TILT.pitchDivisor);
  } catch (err) {
    pitch.innerHTML = `<div class="empty">Error loading lineups: ${err.message}</div>`;
  }
}

async function showPlayerCard(d) {
  const old = document.getElementById("pcard-overlay");
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.id = "pcard-overlay";
  overlay.innerHTML = `<div class="pcard"><div class="pcard-loading">Loading…</div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  let s = null;
  try {
    const r = await api(`players?team_name=eq.${encodeURIComponent(d.team)}&shirt=eq.${d.shirt}&select=*`);
    s = r[0] || null;
  } catch (_) {}

  const name = (s && s.full_name) || d.name;
  const cap = d.cap === "1" ? ` <span class="capbadge">C</span>` : "";
  const a = s && s.dob ? age(s.dob) : null;
  const subBits = [];
  if (d.pos) subBits.push(d.pos);
  if (a != null) subBits.push(a + " yrs");
  if (s && s.nationality) { const nl = natLabel(s.nationality); if (nl) subBits.push(nl); }
  const matchMins = (d.mins === "" || d.mins == null) ? "—" : d.mins + "'";
  const V = v => (v == null ? "—" : v);

  overlay.querySelector(".pcard").innerHTML = `
    <button class="pcard-close" id="pcard-close">✕</button>
    <div class="pcard-num">${d.shirt || "–"}</div>
    <div class="pcard-name">${name}${cap}</div>
    <div class="pcard-sub">${subBits.join(" · ")}</div>
    <div class="pcard-sec">THIS SEASON</div>
    <div class="tiles">
      <div class="tile"><div class="num">${V(s && s.appearances)}</div><div class="lbl">Apps</div></div>
      <div class="tile"><div class="num">${V(s && s.goals)}</div><div class="lbl">Goals</div></div>
      <div class="tile"><div class="num">${V(s && s.assists)}</div><div class="lbl">Assists</div></div>
    </div>
    <div class="statrow"><span class="l">Minutes</span><span class="v">${V(s && s.minutes)}</span></div>
    <div class="pcard-sec">THIS MATCH</div>
    <div class="statrow"><span class="l">Minutes played</span><span class="v">${matchMins}</span></div>`;
  document.getElementById("pcard-close").addEventListener("click", () => overlay.remove());
  attachCard3D(overlay.querySelector(".pcard"));
}

// ---- boot ----
showHome();
