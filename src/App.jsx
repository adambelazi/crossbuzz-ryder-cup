import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

/* ---------- constants ---------- */

// Real Rosapenna scorecard data — men's tees (White for Old Tom Morris, Granite for St Patrick's Links)
const OTM_HOLES = [
  { hole: 1, par: 4, si: 6, yards: 360 },
  { hole: 2, par: 3, si: 18, yards: 136 },
  { hole: 3, par: 4, si: 4, yards: 339 },
  { hole: 4, par: 4, si: 12, yards: 368 },
  { hole: 5, par: 4, si: 8, yards: 340 },
  { hole: 6, par: 4, si: 2, yards: 330 },
  { hole: 7, par: 3, si: 16, yards: 154 },
  { hole: 8, par: 5, si: 14, yards: 452 },
  { hole: 9, par: 4, si: 10, yards: 356 },
  { hole: 10, par: 4, si: 5, yards: 412 },
  { hole: 11, par: 4, si: 1, yards: 386 },
  { hole: 12, par: 4, si: 7, yards: 377 },
  { hole: 13, par: 4, si: 15, yards: 308 },
  { hole: 14, par: 3, si: 13, yards: 175 },
  { hole: 15, par: 4, si: 3, yards: 362 },
  { hole: 16, par: 5, si: 17, yards: 480 },
  { hole: 17, par: 3, si: 11, yards: 185 },
  { hole: 18, par: 5, si: 9, yards: 544 },
];
const SPL_HOLES = [
  { hole: 1, par: 4, si: 9, yards: 345 },
  { hole: 2, par: 4, si: 11, yards: 339 },
  { hole: 3, par: 3, si: 17, yards: 163 },
  { hole: 4, par: 5, si: 5, yards: 451 },
  { hole: 5, par: 3, si: 13, yards: 144 },
  { hole: 6, par: 5, si: 7, yards: 506 },
  { hole: 7, par: 4, si: 3, yards: 368 },
  { hole: 8, par: 4, si: 15, yards: 280 },
  { hole: 9, par: 4, si: 1, yards: 398 },
  { hole: 10, par: 4, si: 8, yards: 356 },
  { hole: 11, par: 4, si: 6, yards: 399 },
  { hole: 12, par: 5, si: 4, yards: 482 },
  { hole: 13, par: 4, si: 12, yards: 333 },
  { hole: 14, par: 4, si: 10, yards: 340 },
  { hole: 15, par: 3, si: 18, yards: 117 },
  { hole: 16, par: 4, si: 2, yards: 471 },
  { hole: 17, par: 3, si: 14, yards: 155 },
  { hole: 18, par: 4, si: 16, yards: 272 },
];

function makeCourse(name, holes) {
  return { name, holes: holes.map((h) => ({ ...h })) };
}

const DEFAULT_PLAYERS = [
  { id: "eur-jeff", name: "Jeff", handicap: 0, team: "EUR" },
  { id: "eur-keavo", name: "Keavo", handicap: 34, team: "EUR" },
  { id: "eur-morrissey", name: "Morrissey", handicap: 18, team: "EUR" },
  { id: "eur-belazi", name: "Belazi", handicap: 16, team: "EUR" },
  { id: "eur-finucane", name: "Finucane", handicap: 12, team: "EUR" },
  { id: "usa-bermo", name: "Bermo", handicap: 13, team: "USA" },
  { id: "usa-staed", name: "Staed", handicap: 25, team: "USA" },
  { id: "usa-g", name: "G", handicap: 16, team: "USA" },
  { id: "usa-murph", name: "Murph", handicap: 18, team: "USA" },
  { id: "usa-canny", name: "Canny", handicap: 12, team: "USA" },
];

const DEFAULT_STATE = {
  players: DEFAULT_PLAYERS,
  courses: {
    OTM: makeCourse("Old Tom Morris", OTM_HOLES),
    SPL: makeCourse("St Patrick's Links", SPL_HOLES),
  },
  matches: [],
  events: [],
  eventName: "Crossbuzz Ryder Cup",
  settings: { adminPin: "2580", playerPin: "1234" },
};


const TEAM_META = {
  USA: { label: "USA", color: "#A6192E", dim: "#5c1420", flag: "🇺🇸" },
  EUR: { label: "Europe", color: "#1F4E79", dim: "#12324c", flag: "🇪🇺" },
};

const MAX_EVENTS = 150;
const MAX_PHOTO_DIM = 480;
const MAX_PHOTO_BYTES = 350000;

/* ---------- helpers ---------- */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function coursePar(course) {
  return course.holes.reduce((s, h) => s + h.par, 0);
}
function courseYards(course) {
  return course.holes.reduce((s, h) => s + h.yards, 0);
}
function strokesOnHole(hcp, si) {
  if (hcp <= 0) return 0;
  const full = Math.floor(hcp / 18);
  const extra = hcp % 18;
  return full + (si <= extra ? 1 : 0);
}
function playingHandicaps(playerHandicaps) {
  const low = Math.min(...playerHandicaps);
  return playerHandicaps.map((h) => Math.max(0, h - low));
}
function matchStatusLabel(diff, holesPlayed, holesLeft, usaLabel = "USA", eurLabel = "Europe") {
  const leader = diff > 0 ? usaLabel : eurLabel;
  if (holesLeft === 0 || Math.abs(diff) > holesLeft) {
    if (diff === 0) return "Match halved";
    const upBy = Math.abs(diff);
    return holesLeft === 0 ? `${leader} win ${upBy} up` : `${leader} win ${upBy}&${holesLeft}`;
  }
  if (diff === 0) return "All square";
  return `${leader} ${Math.abs(diff)} UP`;
}

function enrichMatch(m, state) {
  const course = state.courses[m.course];
  const usaP = m.usa.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const eurP = m.eur.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const allLow = Math.min(...usaP.map((p) => p.handicap), ...eurP.map((p) => p.handicap));
  const usaRel = usaP.map((p) => p.handicap - allLow);
  const eurRel = eurP.map((p) => p.handicap - allLow);

  let diff = 0, holesPlayed = 0;
  course.holes.forEach((h) => {
    const hs = m.scores[h.hole] || {};
    if (hs.concede === "usa") { holesPlayed++; diff--; return; }
    if (hs.concede === "eur") { holesPlayed++; diff++; return; }
    if (hs.concede === "half") { holesPlayed++; return; }
    const usaGross = usaP.map((p, i) => hs[`usa${i}`]);
    const eurGross = eurP.map((p, i) => hs[`eur${i}`]);
    const usaComplete = usaGross.every((g) => g != null && g !== "");
    const eurComplete = eurGross.every((g) => g != null && g !== "");
    if (usaComplete && eurComplete) {
      const usaNet = Math.min(...usaGross.map((g, i) => g - strokesOnHole(usaRel[i], h.si)));
      const eurNet = Math.min(...eurGross.map((g, i) => g - strokesOnHole(eurRel[i], h.si)));
      holesPlayed++;
      if (usaNet < eurNet) diff++;
      else if (eurNet < usaNet) diff--;
    }
  });
  const holesLeft = 18 - holesPlayed;
  const finished = holesPlayed > 0 && (Math.abs(diff) > holesLeft || holesPlayed === 18);
  let result = null;
  if (finished) result = diff > 0 ? "usa" : diff < 0 ? "eur" : "halved";
  const points = m.points != null ? m.points : 1;
  return {
    ...m, usaP, eurP, diff, holesPlayed, holesLeft, finished, result, points,
    statusLabel: holesPlayed === 0 ? "Not started" : matchStatusLabel(diff, holesPlayed, holesLeft),
  };
}

function computeTotals(matches, state) {
  let usa = 0, eur = 0, halved = 0, totalPoints = 0, pointsPlayed = 0;
  matches.forEach((m) => {
    const points = m.points != null ? m.points : 1;
    totalPoints += points;
    const { result, finished } = enrichMatch(m, state);
    if (finished) pointsPlayed += points;
    if (result === "usa") usa += points;
    else if (result === "eur") eur += points;
    else if (result === "halved") { usa += points / 2; eur += points / 2; halved += 1; }
  });
  const target = totalPoints > 0 ? totalPoints / 2 : null;
  const pointsRemaining = totalPoints - pointsPlayed;
  return { usa, eur, halved, target, totalPoints, pointsPlayed, pointsRemaining };
}

function computeNewEvents(match, state, existingKeys) {
  const out = [];
  const course = state.courses[match.course];
  const usaP = match.usa.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const eurP = match.eur.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);

  course.holes.forEach((h) => {
    const hs = match.scores[h.hole] || {};
    [["usa", usaP], ["eur", eurP]].forEach(([side, players]) => {
      players.forEach((p, i) => {
        const val = hs[`${side}${i}`];
        if (val == null || val === "") return;
        const under = h.par - val;
        if (under >= 2) {
          const key = `score-${side}${i}-${match.id}-${h.hole}`;
          if (!existingKeys.has(key)) {
            const emoji = under >= 3 ? "⛳" : "🦅";
            const label = under >= 3 ? "albatross or better!" : "eagle";
            out.push({ id: uid(), key, type: "score", emoji, text: `${p.name} — ${label} on hole ${h.hole}`, ts: Date.now(), matchId: match.id });
          }
        }
      });
    });
  });

  // Momentum: 3 consecutive holes won by the same side
  {
    const allLow = Math.min(...usaP.map((p) => p.handicap), ...eurP.map((p) => p.handicap));
    const usaRel = usaP.map((p) => p.handicap - allLow);
    const eurRel = eurP.map((p) => p.handicap - allLow);
    let streakSide = null, streakLen = 0, streakEndHole = null;
    course.holes.forEach((h) => {
      const hs = match.scores[h.hole] || {};
      const usaGross = usaP.map((p, i) => hs[`usa${i}`]);
      const eurGross = eurP.map((p, i) => hs[`eur${i}`]);
      const usaComplete = usaGross.every((g) => g != null && g !== "");
      const eurComplete = eurGross.every((g) => g != null && g !== "");
      let winner = null;
      if (hs.concede === "usa") winner = "eur";
      else if (hs.concede === "eur") winner = "usa";
      else if (hs.concede === "half") winner = "halved";
      else if (usaComplete && eurComplete) {
        const usaNet = Math.min(...usaGross.map((g, i) => g - strokesOnHole(usaRel[i], h.si)));
        const eurNet = Math.min(...eurGross.map((g, i) => g - strokesOnHole(eurRel[i], h.si)));
        winner = usaNet < eurNet ? "usa" : eurNet < usaNet ? "eur" : "halved";
      }
      if (winner === "usa" || winner === "eur") {
        if (winner === streakSide) streakLen++;
        else { streakSide = winner; streakLen = 1; }
        streakEndHole = h.hole;
      } else if (winner === "halved") {
        streakSide = null; streakLen = 0;
      }
    });
    if (streakLen >= 3) {
      const key = `momentum-${match.id}-${streakSide}-${streakLen}`;
      if (!existingKeys.has(key)) {
        const names = streakSide === "usa" ? usaP.map((p) => p.name).join(" & ") : eurP.map((p) => p.name).join(" & ");
        out.push({ id: uid(), key, type: "momentum", emoji: "🔥", text: `${names} on fire — ${streakLen} holes in a row (through hole ${streakEndHole})`, ts: Date.now(), matchId: match.id });
      }
    }
  }

  const en = enrichMatch(match, state);
  if (!en.finished && en.holesLeft > 0 && en.diff !== 0 && Math.abs(en.diff) === en.holesLeft) {
    const key = `dormie-${match.id}`;
    if (!existingKeys.has(key)) {
      const leadTeam = en.diff > 0 ? "USA" : "Europe";
      out.push({ id: uid(), key, type: "dormie", emoji: "⚔️", text: `Dormie — ${leadTeam} lead ${en.usaP.map((p) => p.name).join(" & ")} vs ${en.eurP.map((p) => p.name).join(" & ")}`, ts: Date.now(), matchId: match.id });
    }
  }
  if (en.finished) {
    const key = `result-${match.id}`;
    if (!existingKeys.has(key)) {
      const winner = en.result === "usa" ? "USA" : en.result === "eur" ? "Europe" : "Halved";
      const ptsLabel = en.points === 1 ? "1 point" : `${en.points} points`;
      out.push({ id: uid(), key, type: "result", emoji: en.result === "halved" ? "🤝" : "🏆", text: `${en.usaP.map((p) => p.name).join(" & ")} vs ${en.eurP.map((p) => p.name).join(" & ")} — ${winner} ${en.statusLabel} (${ptsLabel})`, ts: Date.now(), matchId: match.id });
    }
  }
  return out;
}

function withNewEvents(prevState, updatedMatch) {
  const existingKeys = new Set(prevState.events.map((e) => e.key));
  const newEvents = computeNewEvents(updatedMatch, prevState, existingKeys);
  if (newEvents.length === 0) return prevState;
  const events = [...newEvents.reverse(), ...prevState.events].slice(0, MAX_EVENTS);
  return { ...prevState, events };
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_PHOTO_DIM) {
          height = Math.round((height * MAX_PHOTO_DIM) / width);
          width = MAX_PHOTO_DIM;
        } else if (height > MAX_PHOTO_DIM) {
          width = Math.round((width * MAX_PHOTO_DIM) / height);
          height = MAX_PHOTO_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.7;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > MAX_PHOTO_BYTES * 1.37 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/* ---------- main component ---------- */

function mergeState(data) {
  return { ...DEFAULT_STATE, ...data, settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) } };
}

async function fetchRow() {
  const { data, error } = await supabase.from("event_state").select("data, version").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}

export default function RyderCupApp() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [tab, setTab] = useState("feed");
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [role, setRole] = useState("viewer");
  const [pinPrompt, setPinPrompt] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const row = await fetchRow();
      if (row && row.data) {
        setState(mergeState(row.data));
      } else {
        // First ever load: seed the database with the default event
        await supabase.from("event_state").insert({ id: 1, data: DEFAULT_STATE, version: 1 });
      }
    } catch (e) {
      console.error("load failed", e);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 12000);
    // Realtime: update instantly when anyone else writes
    const channel = supabase
      .channel("event-state-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "event_state" }, (payload) => {
        if (payload.new && payload.new.data) setState(mergeState(payload.new.data));
      })
      .subscribe();
    return () => {
      clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Version-checked write with retry: re-applies your change on top of the
  // freshest data, so two phones scoring at once don't overwrite each other.
  const applyRemote = useCallback(async (fn) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await fetchRow();
      if (!row) {
        const next = fn(DEFAULT_STATE);
        const { error } = await supabase.from("event_state").insert({ id: 1, data: next, version: 1 });
        if (!error) return next;
        continue; // someone else seeded first — retry against their row
      }
      const base = mergeState(row.data);
      const next = fn(base);
      const { data: updated, error } = await supabase
        .from("event_state")
        .update({ data: next, version: row.version + 1 })
        .eq("id", 1)
        .eq("version", row.version)
        .select("version");
      if (!error && updated && updated.length > 0) return next;
      // version conflict: someone wrote in between — loop and re-apply on fresh data
    }
    throw new Error("could not sync after retries");
  }, []);

  const update = useCallback((fn) => {
    const updater = typeof fn === "function" ? fn : () => fn;
    // Optimistic local update so the UI feels instant
    setState((prev) => updater(prev));
    setSyncing(true);
    applyRemote(updater)
      .then((next) => setState(next))
      .catch((e) => {
        console.error("sync failed", e);
        load(); // fall back to server truth
      })
      .finally(() => setSyncing(false));
  }, [applyRemote, load]);

  const tryPin = (kind, val) => {
    if (kind === "player" && (val === state.settings.playerPin || val === state.settings.adminPin)) {
      setRole(val === state.settings.adminPin ? "admin" : "player");
      setPinPrompt(null);
    } else if (kind === "admin" && val === state.settings.adminPin) {
      setRole("admin");
      setPinPrompt(null);
    } else {
      alert("Wrong PIN");
    }
  };

  if (!loaded) {
    return <Shell><div style={{ padding: 60, textAlign: "center", color: "#D9C7A0" }}>Loading the tournament…</div></Shell>;
  }

  const usaPlayers = state.players.filter((p) => p.team === "USA");
  const eurPlayers = state.players.filter((p) => p.team === "EUR");
  const totals = computeTotals(state.matches, state);
  const canScore = role === "player" || role === "admin";
  const canAdmin = role === "admin";

  return (
    <Shell>
      <Header state={state} totals={totals} syncing={syncing} onRefresh={load} role={role} setPinPrompt={setPinPrompt} setRole={setRole} />
      <Tabs tab={tab} setTab={setTab} canAdmin={canAdmin} />
      <div style={{ padding: "20px 18px 60px" }}>
        {tab === "feed" && <FeedTab state={state} update={update} canPost={canScore} />}
        {tab === "setup" && <SetupTab state={state} update={update} usaPlayers={usaPlayers} eurPlayers={eurPlayers} canAdmin={canAdmin} />}
        {tab === "courses" && <CoursesTab state={state} update={update} canAdmin={canAdmin} />}
        {(tab === "day1" || tab === "day2") && (
          <MatchesTab key={tab} day={tab === "day1" ? 1 : 2} format={tab === "day1" ? "fourball" : "singles"} state={state} update={update} canScore={canScore} canAdmin={canAdmin} />
        )}
        {tab === "leaderboard" && <LeaderboardTab state={state} totals={totals} />}
        {tab === "admin" && canAdmin && <AdminTab state={state} update={update} />}
      </div>
      {pinPrompt && <PinModal kind={pinPrompt} onSubmit={(v) => tryPin(pinPrompt, v)} onCancel={() => setPinPrompt(null)} />}
    </Shell>
  );
}

/* ---------- shell / chrome ---------- */

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 50% -10%, #1c3a2c 0%, #0f2419 55%, #0a1a13 100%)", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#F3EDDD" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        h1,h2,h3 { font-family: 'Fraunces', Georgia, serif; margin: 0; }
        input, select { font-family: 'Inter', sans-serif; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: #3a5a44; border-radius: 4px; }
        button { cursor: pointer; font-family: 'Inter', sans-serif; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>
      {children}
    </div>
  );
}

function Header({ state, totals, syncing, onRefresh, role, setPinPrompt, setRole }) {
  const total = totals.usa + totals.eur;
  const usaPct = total > 0 ? (totals.usa / total) * 100 : 50;
  const roleLabel = role === "admin" ? "👑 Admin" : role === "player" ? "🏌️ Player" : "👀 Spectator";

  return (
    <div style={{ padding: "22px 18px 16px", borderBottom: "1px solid #2a4636", background: "linear-gradient(180deg, rgba(0,0,0,0.25), transparent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#C7A252", fontWeight: 600 }}>ROSAPENNA · DONEGAL</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#F3EDDD", lineHeight: 1.15 }}>{state.eventName}</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button onClick={onRefresh} style={{ background: "transparent", border: "1px solid #3a5a44", color: "#D9C7A0", fontSize: 11, padding: "6px 10px", borderRadius: 20 }}>{syncing ? "syncing…" : "↻ sync"}</button>
          {role === "viewer" ? (
            <button onClick={() => setPinPrompt("player")} style={{ background: "transparent", border: "1px solid #C7A25266", color: "#C7A252", fontSize: 11, padding: "6px 10px", borderRadius: 20 }}>Unlock</button>
          ) : (
            <button onClick={() => setRole("viewer")} style={{ background: "transparent", border: "1px solid #3a5a44", color: "#8a9a8f", fontSize: 11, padding: "6px 10px", borderRadius: 20 }}>{roleLabel} · exit</button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: TEAM_META.EUR.color, fontWeight: 700 }}>{TEAM_META.EUR.flag} EUROPE {totals.eur}</span>
          <span style={{ color: "#8a9a8f", fontWeight: 600 }}>{totals.target ? `first to ${totals.target}` : "—"}</span>
          <span style={{ color: TEAM_META.USA.color, fontWeight: 700 }}>{totals.usa} USA {TEAM_META.USA.flag}</span>
        </div>
        <div style={{ height: 10, borderRadius: 6, overflow: "hidden", display: "flex", border: "1px solid #2a4636" }}>
          <div style={{ width: `${usaPct}%`, background: TEAM_META.EUR.color, transition: "width .4s" }} />
          <div style={{ flex: 1, background: TEAM_META.USA.color, transition: "width .4s" }} />
        </div>
      </div>
    </div>
  );
}

function PinModal({ kind, onSubmit, onCancel }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ background: "#17301F", border: "1px solid #3a5a44", borderRadius: 12, padding: 20, width: "100%", maxWidth: 300 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{kind === "admin" ? "Admin PIN" : "Enter PIN"}</div>
        <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 12 }}>{kind === "admin" ? "For the trip organiser only." : "Players use the shared PIN to enter scores. Admin PIN also works here."}</div>
        <input autoFocus type="tel" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} style={inputStyle({ width: "100%", marginBottom: 12, fontSize: 18, letterSpacing: 4, textAlign: "center" })} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onSubmit(val)} style={primaryBtn({ flex: 1 })}>Unlock</button>
          <button onClick={onCancel} style={ghostBtn({ flex: 1 })}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Tabs({ tab, setTab, canAdmin }) {
  const items = [["feed", "Feed"], ["setup", "Roster"], ["courses", "Courses"], ["day1", "Day 1"], ["day2", "Day 2"], ["leaderboard", "Leaderboard"]];
  if (canAdmin) items.push(["admin", "Admin"]);
  return (
    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "12px 14px 0", borderBottom: "1px solid #2a4636" }}>
      {items.map(([key, label]) => (
        <button key={key} onClick={() => setTab(key)} style={{ flexShrink: 0, background: tab === key ? "#1e3d2c" : "transparent", color: tab === key ? "#F3EDDD" : "#8a9a8f", border: "none", borderBottom: tab === key ? "2px solid #C7A252" : "2px solid transparent", padding: "10px 12px", fontSize: 13, fontWeight: 600, borderRadius: "6px 6px 0 0" }}>{label}</button>
      ))}
    </div>
  );
}

/* ---------- feed ---------- */

function FeedTab({ state, update, canPost }) {
  const [showPost, setShowPost] = useState(false);
  const addMoment = (text, photo) => {
    update((prev) => {
      const event = { id: uid(), key: `moment-${uid()}`, type: "moment", emoji: "📸", text, photo, ts: Date.now() };
      let events = [event, ...prev.events].slice(0, MAX_EVENTS);
      // Photos are big (base64) — keep only the 15 most recent photo posts so
      // syncing stays fast on weak course signal. Text events are untouched.
      let photoCount = 0;
      events = events.filter((ev) => {
        if (!ev.photo) return true;
        photoCount++;
        return photoCount <= 15;
      });
      return { ...prev, events };
    });
    setShowPost(false);
  };
  return (
    <div>
      <SectionTitle>Live feed</SectionTitle>
      {canPost && (showPost ? <PostMomentForm onPost={addMoment} onCancel={() => setShowPost(false)} /> : (
        <button onClick={() => setShowPost(true)} style={primaryBtn({ width: "100%", marginBottom: 14 })}>📸 Post a moment</button>
      ))}
      {state.events.length === 0 && <EmptyNote>Nothing yet — eagles, dormie matches and finished results will show up here automatically as scores go in.</EmptyNote>}
      {state.events.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #2a463655" }}>
          <div style={{ fontSize: 22, lineHeight: 1 }}>{e.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13 }}>{e.text}</div>
            <div style={{ fontSize: 11, color: "#6b7a70", marginTop: 2 }}>{timeAgo(e.ts)}</div>
            {e.photo && <img src={e.photo} alt="" style={{ marginTop: 8, maxWidth: "100%", borderRadius: 8, border: "1px solid #2a4636" }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function PostMomentForm({ onPost, onCancel }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      setPhoto(compressed);
    } catch (err) { console.error(err); }
    setBusy(false);
  };
  return (
    <div style={{ border: "1px solid #2a4636", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <input placeholder="What happened? (e.g. Rob in the whins on 7)" value={text} onChange={(e) => setText(e.target.value)} style={inputStyle({ width: "100%", marginBottom: 10 })} />
      <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ marginBottom: 10, fontSize: 12, color: "#D9C7A0" }} />
      {busy && <div style={{ fontSize: 11, color: "#8a9a8f", marginBottom: 8 }}>compressing photo…</div>}
      {photo && <img src={photo} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 10 }} />}
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={!text.trim() && !photo} onClick={() => onPost(text.trim() || "Moment posted", photo)} style={primaryBtn({ flex: 1, opacity: text.trim() || photo ? 1 : 0.4 })}>Post</button>
        <button onClick={onCancel} style={ghostBtn({ flex: 1 })}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- setup / roster ---------- */

function SetupTab({ state, update, usaPlayers, eurPlayers, canAdmin }) {
  const [name, setName] = useState("");
  const [hcp, setHcp] = useState("");
  const [team, setTeam] = useState("USA");
  const addPlayer = () => {
    if (!name.trim()) return;
    update((prev) => ({ ...prev, players: [...prev.players, { id: uid(), name: name.trim(), team, handicap: Number(hcp) || 0 }] }));
    setName(""); setHcp("");
  };
  const removePlayer = (id) => update((prev) => ({ ...prev, players: prev.players.filter((p) => p.id !== id) }));
  const updateHandicap = (id, val) => update((prev) => ({ ...prev, players: prev.players.map((p) => (p.id === id ? { ...p, handicap: Number(val) || 0 } : p)) }));

  if (!canAdmin) {
    return (
      <div>
        <SectionTitle>Roster</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <TeamRoster meta={TEAM_META.USA} players={usaPlayers} readOnly />
          <TeamRoster meta={TEAM_META.EUR} players={eurPlayers} readOnly />
        </div>
      </div>
    );
  }
  return (
    <div>
      <SectionTitle>Add golfers</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle({ flex: "1 1 140px" })} />
        <input placeholder="Hcp" type="number" value={hcp} onChange={(e) => setHcp(e.target.value)} style={inputStyle({ width: 70 })} />
        <select value={team} onChange={(e) => setTeam(e.target.value)} style={inputStyle({ width: 110 })}>
          <option value="USA">USA</option>
          <option value="EUR">Europe</option>
        </select>
        <button onClick={addPlayer} style={primaryBtn()}>Add</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <TeamRoster meta={TEAM_META.USA} players={usaPlayers} onRemove={removePlayer} onHcp={updateHandicap} />
        <TeamRoster meta={TEAM_META.EUR} players={eurPlayers} onRemove={removePlayer} onHcp={updateHandicap} />
      </div>
      {state.players.length === 0 && <EmptyNote>Add all ten lads here first — assign each to USA or Europe with their current handicap.</EmptyNote>}
    </div>
  );
}

function TeamRoster({ meta, players, onRemove, onHcp, readOnly }) {
  return (
    <div style={{ border: `1px solid ${meta.color}55`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: `${meta.color}22`, padding: "8px 10px", fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.flag} {meta.label} ({players.length})</div>
      <div>
        {players.length === 0 && <div style={{ padding: 12, fontSize: 12, color: "#6b7a70" }}>No players yet</div>}
        {players.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderTop: "1px solid #2a463655", fontSize: 13 }}>
            <span>{p.name}</span>
            {readOnly ? <span style={{ color: "#8a9a8f", fontSize: 12 }}>{p.handicap}</span> : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" value={p.handicap} onChange={(e) => onHcp(p.id, e.target.value)} style={inputStyle({ width: 46, padding: "3px 5px", fontSize: 12 })} />
                <button onClick={() => onRemove(p.id)} style={{ background: "none", border: "none", color: "#8a5555", fontSize: 15 }}>×</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- courses ---------- */

function CoursesTab({ state, update, canAdmin }) {
  const [courseKey, setCourseKey] = useState("OTM");
  const course = state.courses[courseKey];
  const updateHole = (idx, field, val) => {
    update((prev) => {
      const holes = prev.courses[courseKey].holes.map((h, i) => (i === idx ? { ...h, [field]: Number(val) || 0 } : h));
      return { ...prev, courses: { ...prev.courses, [courseKey]: { ...prev.courses[courseKey], holes } } };
    });
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {Object.entries(state.courses).map(([key, c]) => (
          <button key={key} onClick={() => setCourseKey(key)} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: courseKey === key ? "1px solid #C7A252" : "1px solid #2a4636", background: courseKey === key ? "#C7A25222" : "transparent", color: courseKey === key ? "#F3EDDD" : "#8a9a8f", fontSize: 13, fontWeight: 600 }}>{c.name}</button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 10 }}>Par {coursePar(course)} · {courseYards(course)} yards {canAdmin ? "— edit pars, stroke index (SI) and yardages to match the printed scorecard." : "(admin can edit)"}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12 }}>
          <thead><tr style={{ color: "#8a9a8f", textAlign: "left" }}><th style={thStyle}>Hole</th><th style={thStyle}>Par</th><th style={thStyle}>SI</th><th style={thStyle}>Yards</th></tr></thead>
          <tbody>
            {course.holes.map((h, i) => (
              <tr key={h.hole} style={{ borderTop: "1px solid #2a463655" }}>
                <td style={tdStyle}>{h.hole}</td>
                <td style={tdStyle}>{canAdmin ? <SmallNum value={h.par} onChange={(v) => updateHole(i, "par", v)} /> : h.par}</td>
                <td style={tdStyle}>{canAdmin ? <SmallNum value={h.si} onChange={(v) => updateHole(i, "si", v)} /> : h.si}</td>
                <td style={tdStyle}>{canAdmin ? <SmallNum value={h.yards} onChange={(v) => updateHole(i, "yards", v)} width={54} /> : h.yards}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SmallNum({ value, onChange, width = 40 }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle({ width, padding: "3px 4px", fontSize: 12, textAlign: "center" })} />;
}

/* ---------- matches (fourball / singles) ---------- */

function MatchesTab({ day, format, state, update, canScore, canAdmin }) {
  const dayMatches = state.matches.filter((m) => m.day === day);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const createMatch = (matchData) => {
    update((prev) => ({ ...prev, matches: [...prev.matches, { id: uid(), day, format, ...matchData, scores: {} }] }));
    setCreating(false);
  };
  const saveEdit = (matchId, matchData) => {
    update((prev) => ({ ...prev, matches: prev.matches.map((m) => (m.id === matchId ? { ...m, ...matchData } : m)) }));
    setEditingId(null);
  };
  const removeMatch = (id) => update((prev) => ({ ...prev, matches: prev.matches.filter((m) => m.id !== id) }));
  const updateScore = (matchId, hole, side, val) => {
    update((prev) => {
      const matches = prev.matches.map((m) => {
        if (m.id !== matchId) return m;
        const scores = { ...m.scores };
        const holeScores = { ...(scores[hole] || {}) };
        holeScores[side] = val === "" ? undefined : Number(val);
        scores[hole] = holeScores;
        return { ...m, scores };
      });
      const updatedMatch = matches.find((m) => m.id === matchId);
      return withNewEvents({ ...prev, matches }, updatedMatch);
    });
  };
  const updateConcede = (matchId, hole, side) => {
    update((prev) => {
      const matches = prev.matches.map((m) => {
        if (m.id !== matchId) return m;
        const scores = { ...m.scores };
        const holeScores = { ...(scores[hole] || {}) };
        if (holeScores.concede === side) delete holeScores.concede;
        else holeScores.concede = side;
        scores[hole] = holeScores;
        return { ...m, scores };
      });
      const updatedMatch = matches.find((m) => m.id === matchId);
      return withNewEvents({ ...prev, matches }, updatedMatch);
    });
  };
  const undoLastHole = (matchId) => {
    update((prev) => {
      const matches = prev.matches.map((m) => {
        if (m.id !== matchId) return m;
        const course = prev.courses[m.course];
        let lastHole = null;
        course.holes.forEach((h) => {
          const hs = m.scores[h.hole];
          if (hs && (hs.concede || Object.keys(hs).some((k) => hs[k] != null && hs[k] !== ""))) lastHole = h.hole;
        });
        if (lastHole == null) return m;
        const scores = { ...m.scores };
        delete scores[lastHole];
        return { ...m, scores };
      });
      return { ...prev, matches };
    });
  };
  if (state.players.length < 2) return <EmptyNote>Add players in the Roster tab first.</EmptyNote>;

  const selected = dayMatches.find((m) => m.id === selectedId);
  if (selected && editingId !== selected.id) {
    return (
      <MatchView
        match={selected}
        state={state}
        onScore={updateScore}
        onConcede={updateConcede}
        onUndo={() => undoLastHole(selected.id)}
        onRemove={() => { removeMatch(selected.id); setSelectedId(null); }}
        onEdit={() => setEditingId(selected.id)}
        onBack={() => setSelectedId(null)}
        canScore={canScore}
        canAdmin={canAdmin}
      />
    );
  }

  return (
    <div>
      <SectionTitle>{day === 1 ? "Day 1 — Fourballs & Singles" : "Day 2 — Singles"}</SectionTitle>
      {dayMatches.length > 0 && !editingId && (
        <div style={{ fontSize: 11, color: "#8a9a8f", border: "1px dashed #2a4636", borderRadius: 8, padding: "8px 10px", marginBottom: 12, lineHeight: 1.5 }}>
          Tap a match to open it. Players: enter your actual shots taken (gross) — the app works out strokes given automatically. <span style={{ color: "#C7A252" }}>●</span> means a shot received on that hole. Use <b>concede</b> when a hole isn't worth finishing.
        </div>
      )}
      {dayMatches.map((m) => (
        editingId === m.id ? (
          <NewMatchForm key={m.id} state={state} format={format} initial={m} onCreate={(data) => saveEdit(m.id, data)} onCancel={() => setEditingId(null)} submitLabel="Save changes" />
        ) : (
          <MatchSummaryCard key={m.id} match={m} state={state} onOpen={() => setSelectedId(m.id)} />
        )
      ))}
      {canAdmin && (creating ? (
        <NewMatchForm state={state} format={format} onCreate={createMatch} onCancel={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} style={primaryBtn({ width: "100%", marginTop: 10 })}>+ New match</button>
      ))}
      {!canAdmin && dayMatches.length === 0 && <EmptyNote>The admin hasn't set up any matches for this day yet.</EmptyNote>}
    </div>
  );
}

function NewMatchForm({ state, format, onCreate, onCancel, initial, submitLabel }) {
  const [fmt, setFmt] = useState(initial ? (initial.format || format) : format);
  const perSide = fmt === "fourball" ? 2 : 1;
  const [courseKey, setCourseKey] = useState(initial ? initial.course : "OTM");
  const [usaSel, setUsaSel] = useState(initial ? initial.usa : []);
  const [eurSel, setEurSel] = useState(initial ? initial.eur : []);
  const [points, setPoints] = useState(initial && initial.points != null ? String(initial.points) : "1");
  const usaPlayers = state.players.filter((p) => p.team === "USA");
  const eurPlayers = state.players.filter((p) => p.team === "EUR");
  const changeFmt = (f) => {
    setFmt(f);
    const n = f === "fourball" ? 2 : 1;
    setUsaSel((s) => s.slice(0, n));
    setEurSel((s) => s.slice(0, n));
  };
  const toggle = (list, setList, id) => {
    if (list.includes(id)) setList(list.filter((x) => x !== id));
    else if (list.length < perSide) setList([...list, id]);
  };
  const ready = usaSel.length === perSide && eurSel.length === perSide && Number(points) > 0;
  return (
    <div style={{ border: "1px solid #2a4636", borderRadius: 10, padding: 14, marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 8 }}>Match type</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => changeFmt("fourball")} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: fmt === "fourball" ? "1px solid #C7A252" : "1px solid #2a4636", background: fmt === "fourball" ? "#C7A25222" : "transparent", color: fmt === "fourball" ? "#F3EDDD" : "#8a9a8f", fontSize: 12, fontWeight: 600 }}>Fourball (2 v 2)</button>
        <button onClick={() => changeFmt("singles")} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: fmt === "singles" ? "1px solid #C7A252" : "1px solid #2a4636", background: fmt === "singles" ? "#C7A25222" : "transparent", color: fmt === "singles" ? "#F3EDDD" : "#8a9a8f", fontSize: 12, fontWeight: 600 }}>Singles (1 v 1)</button>
      </div>
      <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 8 }}>Course</div>
      <select value={courseKey} onChange={(e) => setCourseKey(e.target.value)} style={inputStyle({ width: "100%", marginBottom: 12 })}>
        {Object.entries(state.courses).map(([key, c]) => <option key={key} value={key}>{c.name}</option>)}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <PlayerPicker meta={TEAM_META.USA} players={usaPlayers} selected={usaSel} onToggle={(id) => toggle(usaSel, setUsaSel, id)} />
        <PlayerPicker meta={TEAM_META.EUR} players={eurPlayers} selected={eurSel} onToggle={(id) => toggle(eurSel, setEurSel, id)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 6 }}>Points this match is worth (e.g. 1 for a normal match, 0.5 for a lone singles match)</div>
        <input type="number" step="0.5" min="0.5" value={points} onChange={(e) => setPoints(e.target.value)} style={inputStyle({ width: 80 })} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button disabled={!ready} onClick={() => onCreate({ course: courseKey, usa: usaSel, eur: eurSel, points: Number(points), format: fmt })} style={primaryBtn({ flex: 1, opacity: ready ? 1 : 0.4 })}>{submitLabel || "Create match"}</button>
        <button onClick={onCancel} style={ghostBtn({ flex: 1 })}>Cancel</button>
      </div>
    </div>
  );
}

function PlayerPicker({ meta, players, selected, onToggle }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 6 }}>{meta.label}</div>
      {players.map((p) => (
        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => onToggle(p.id)} />
          {p.name} <span style={{ color: "#6b7a70" }}>({p.handicap})</span>
        </label>
      ))}
      {players.length === 0 && <div style={{ fontSize: 11, color: "#6b7a70" }}>No players on this team</div>}
    </div>
  );
}

function analyzeMatch(match, state) {
  const course = state.courses[match.course];
  const usaP = match.usa.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const eurP = match.eur.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const points = match.points != null ? match.points : 1;
  const allLow = Math.min(...usaP.map((p) => p.handicap), ...eurP.map((p) => p.handicap));
  const usaRel = usaP.map((p) => p.handicap - allLow);
  const eurRel = eurP.map((p) => p.handicap - allLow);
  let diff = 0, holesPlayed = 0;
  const holeRows = course.holes.map((h) => {
    const hs = match.scores[h.hole] || {};
    const usaGross = usaP.map((p, i) => hs[`usa${i}`]);
    const eurGross = eurP.map((p, i) => hs[`eur${i}`]);
    const usaStrokes = usaRel.map((r) => strokesOnHole(r, h.si));
    const eurStrokes = eurRel.map((r) => strokesOnHole(r, h.si));
    const usaComplete = usaGross.every((g) => g != null && g !== "");
    const eurComplete = eurGross.every((g) => g != null && g !== "");
    let usaNetBest = null, eurNetBest = null, winner = null, concede = null;
    if (usaComplete) usaNetBest = Math.min(...usaGross.map((g, i) => g - usaStrokes[i]));
    if (eurComplete) eurNetBest = Math.min(...eurGross.map((g, i) => g - eurStrokes[i]));
    if (hs.concede === "usa") { winner = "eur"; concede = "usa"; holesPlayed++; diff--; }
    else if (hs.concede === "eur") { winner = "usa"; concede = "eur"; holesPlayed++; diff++; }
    else if (hs.concede === "half") { winner = "halved"; concede = "half"; holesPlayed++; }
    else if (usaNetBest != null && eurNetBest != null) {
      holesPlayed++;
      if (usaNetBest < eurNetBest) { winner = "usa"; diff++; }
      else if (eurNetBest < usaNetBest) { winner = "eur"; diff--; }
      else winner = "halved";
    }
    return { hole: h, usaGross, eurGross, usaStrokes, eurStrokes, winner, concede };
  });
  const holesLeft = 18 - holesPlayed;
  const finished = holesPlayed > 0 && (Math.abs(diff) > holesLeft || holesPlayed === 18);
  const usaLabel = usaP.map((p) => p.name.split(" ")[0]).join("/");
  const eurLabel = eurP.map((p) => p.name.split(" ")[0]).join("/");
  const statusLabel = holesPlayed === 0 ? "Not started" : matchStatusLabel(diff, holesPlayed, holesLeft, usaLabel, eurLabel);
  let streakSide = null, streakLen = 0;
  holeRows.forEach((row) => {
    if (row.winner === "usa" || row.winner === "eur") {
      if (row.winner === streakSide) streakLen++;
      else { streakSide = row.winner; streakLen = 1; }
    } else if (row.winner === "halved") {
      streakSide = null; streakLen = 0;
    }
  });
  const hotSide = streakLen >= 3 ? streakSide : null;
  const coldSide = hotSide ? (hotSide === "usa" ? "eur" : "usa") : null;
  return { course, usaP, eurP, points, holeRows, diff, holesPlayed, holesLeft, finished, statusLabel, hotSide, coldSide, streakLen };
}

function MatchSummaryCard({ match, state, onOpen }) {
  const a = analyzeMatch(match, state);
  return (
    <button onClick={onOpen} style={{ display: "block", width: "100%", textAlign: "left", background: "#17301F", border: "1px solid #2a4636", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: TEAM_META.USA.color, fontWeight: 700 }}>{a.usaP.map((p) => p.name).join(" & ")} {a.hotSide === "usa" && "🔥"}{a.coldSide === "usa" && "🧊"}</span>
          <span style={{ color: "#6b7a70" }}> vs </span>
          <span style={{ color: TEAM_META.EUR.color, fontWeight: 700 }}>{a.eurP.map((p) => p.name).join(" & ")} {a.hotSide === "eur" && "🔥"}{a.coldSide === "eur" && "🧊"}</span>
          <div style={{ color: "#6b7a70", fontSize: 11, marginTop: 3 }}>{a.course.name} · worth {a.points === 1 ? "1 pt" : `${a.points} pts`}{a.holesPlayed > 0 && !a.finished ? ` · thru ${a.holesPlayed}` : ""}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: a.finished ? "#C7A252" : "#D9C7A0" }}>{a.statusLabel}</div>
          <div style={{ fontSize: 11, color: "#C7A252", marginTop: 3 }}>Open ›</div>
        </div>
      </div>
    </button>
  );
}

function MatchView({ match, state, onScore, onConcede, onUndo, onRemove, onEdit, onBack, canScore, canAdmin }) {
  const [unlocked, setUnlocked] = useState(false);
  const a = analyzeMatch(match, state);
  const locked = a.finished && !unlocked;
  const inputsEnabled = canScore && !locked;
  const firstOpen = a.holeRows.findIndex((r) => r.winner == null);
  const defaultIdx = firstOpen === -1 ? 17 : firstOpen;
  const [holeIdx, setHoleIdx] = useState(defaultIdx);
  const [mode, setMode] = useState(inputsEnabled ? "entry" : "card");
  const row = a.holeRows[holeIdx];
  const h = row.hole;

  const banner = row.winner === "usa" ? { bg: "#5c1420", color: "#f0b3bc", text: `${TEAM_META.USA.flag} USA win the hole${row.concede ? " (conceded)" : ""}` }
    : row.winner === "eur" ? { bg: "#12324c", color: "#9fc0e8", text: `${TEAM_META.EUR.flag} Europe win the hole${row.concede ? " (conceded)" : ""}` }
    : row.winner === "halved" ? { bg: "#3d3319", color: "#e8d5a4", text: `🤝 Halved${row.concede === "half" ? " (agreed)" : ""}` }
    : null;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#C7A252", fontSize: 13, fontWeight: 600, padding: "0 0 12px" }}>‹ All matches</button>
      <div style={{ border: "1px solid #2a4636", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "12px 14px", background: "#17301F" }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: TEAM_META.USA.color, fontWeight: 700 }}>{a.usaP.map((p) => p.name).join(" & ")} {a.hotSide === "usa" && "🔥"}{a.coldSide === "usa" && "🧊"}</span>
            <span style={{ color: "#6b7a70" }}> vs </span>
            <span style={{ color: TEAM_META.EUR.color, fontWeight: 700 }}>{a.eurP.map((p) => p.name).join(" & ")} {a.hotSide === "eur" && "🔥"}{a.coldSide === "eur" && "🧊"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <div style={{ color: "#6b7a70", fontSize: 11 }}>{a.course.name} · worth {a.points === 1 ? "1 pt" : `${a.points} pts`}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: a.finished ? "#C7A252" : "#D9C7A0" }}>{a.statusLabel}{a.holesPlayed > 0 && !a.finished ? ` thru ${a.holesPlayed}` : ""}</div>
          </div>
          {a.hotSide && (
            <div style={{ fontSize: 11, color: "#C7A252", marginTop: 4, fontWeight: 600 }}>
              {a.streakLen} in a row — {a.hotSide === "usa" ? a.usaP.map((p) => p.name).join(" & ") : a.eurP.map((p) => p.name).join(" & ")} on fire
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            {canScore && a.holesPlayed > 0 && <button onClick={onUndo} style={{ background: "none", border: "none", color: "#8a9a8f", fontSize: 11 }}>undo last hole</button>}
            {a.finished && canScore && <button onClick={() => setUnlocked((u) => !u)} style={{ background: "none", border: "none", color: "#C7A252", fontSize: 11 }}>{locked ? "🔒 unlock to edit" : "✏️ lock"}</button>}
            {canAdmin && <button onClick={onEdit} style={{ background: "none", border: "none", color: "#8a9a8f", fontSize: 11 }}>edit match</button>}
            {canAdmin && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#8a5555", fontSize: 11 }}>remove</button>}
          </div>
        </div>
        <div style={{ display: "flex", borderTop: "1px solid #2a4636" }}>
          <button onClick={() => setMode("entry")} style={{ flex: 1, padding: "11px 8px", background: mode === "entry" ? "#1e3d2c" : "transparent", color: mode === "entry" ? "#F3EDDD" : "#8a9a8f", border: "none", borderBottom: mode === "entry" ? "2px solid #C7A252" : "2px solid transparent", fontSize: 13, fontWeight: 600 }}>{inputsEnabled ? "Enter scores" : "Hole by hole"}</button>
          <button onClick={() => setMode("card")} style={{ flex: 1, padding: "11px 8px", background: mode === "card" ? "#1e3d2c" : "transparent", color: mode === "card" ? "#F3EDDD" : "#8a9a8f", border: "none", borderBottom: mode === "card" ? "2px solid #C7A252" : "2px solid transparent", fontSize: 13, fontWeight: 600 }}>Scorecard</button>
        </div>
      </div>

      {mode === "entry" && (
        <div style={{ border: "1px solid #2a4636", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#17301F" }}>
            <button onClick={() => setHoleIdx((i) => Math.max(0, i - 1))} disabled={holeIdx === 0} style={{ background: "none", border: "1px solid #3a5a44", borderRadius: 8, color: holeIdx === 0 ? "#3a5a44" : "#D9C7A0", fontSize: 16, padding: "8px 16px", fontWeight: 700 }}>‹</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#F3EDDD" }}>Hole {h.hole}</div>
              <div style={{ fontSize: 11, color: "#8a9a8f", marginTop: 2 }}>Par {h.par} · SI {h.si} · {h.yards} yds</div>
            </div>
            <button onClick={() => setHoleIdx((i) => Math.min(17, i + 1))} disabled={holeIdx === 17} style={{ background: "none", border: "1px solid #3a5a44", borderRadius: 8, color: holeIdx === 17 ? "#3a5a44" : "#D9C7A0", fontSize: 16, padding: "8px 16px", fontWeight: 700 }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${a.usaP.length + a.eurP.length}, 1fr)`, gap: 8, padding: "14px 12px" }}>
            {a.usaP.map((p, i) => (
              <BigScoreCell key={`u${i}`} name={p.name.split(" ")[0]} color={TEAM_META.USA.color} gross={row.usaGross[i]} strokes={row.usaStrokes[i]} enabled={inputsEnabled} onChange={(v) => onScore(match.id, h.hole, `usa${i}`, v)} />
            ))}
            {a.eurP.map((p, i) => (
              <BigScoreCell key={`e${i}`} name={p.name.split(" ")[0]} color={TEAM_META.EUR.color} gross={row.eurGross[i]} strokes={row.eurStrokes[i]} enabled={inputsEnabled} onChange={(v) => onScore(match.id, h.hole, `eur${i}`, v)} />
            ))}
          </div>
          {banner ? (
            <div>
              <div style={{ background: banner.bg, padding: "12px 10px", textAlign: "center", fontSize: 15, fontWeight: 700, color: banner.color, letterSpacing: 0.5 }}>{banner.text}</div>
              {row.concede && inputsEnabled && (
                <button onClick={() => onConcede(match.id, h.hole, row.concede)} style={{ width: "100%", background: "none", border: "none", borderTop: "1px solid #2a4636", color: "#8a9a8f", fontSize: 12, padding: "10px" }}>{row.concede === "half" ? "undo halve" : "undo concede"}</button>
              )}
            </div>
          ) : inputsEnabled ? (
            <div style={{ display: "flex", gap: 8, padding: "0 12px 14px" }}>
              <button onClick={() => onConcede(match.id, h.hole, "usa")} style={{ flex: 1, background: "none", border: "1px solid #7a3844", borderRadius: 10, color: "#e8a5ae", fontSize: 13, fontWeight: 700, padding: "13px 2px" }}>{TEAM_META.USA.flag} USA concede</button>
              <button onClick={() => onConcede(match.id, h.hole, "half")} style={{ flex: 1, background: "none", border: "1px solid #C7A25288", borderRadius: 10, color: "#e8d5a4", fontSize: 13, fontWeight: 700, padding: "13px 2px" }}>🤝 Halve</button>
              <button onClick={() => onConcede(match.id, h.hole, "eur")} style={{ flex: 1, background: "none", border: "1px solid #3a5a7a", borderRadius: 10, color: "#9fc0e8", fontSize: 13, fontWeight: 700, padding: "13px 2px" }}>{TEAM_META.EUR.flag} EUR concede</button>
            </div>
          ) : (
            <div style={{ padding: "10px 12px 14px", textAlign: "center", fontSize: 12, color: "#6b7a70" }}>Not played yet</div>
          )}
        </div>
      )}

      {mode === "card" && (
        <div style={{ border: "1px solid #2a4636", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 11 }}>
              <thead>
                <tr style={{ color: "#6b7a70" }}>
                  <th style={thStyle}>H</th><th style={thStyle}>Par</th>
                  {a.usaP.map((p, i) => <th key={`u${i}`} style={{ ...thStyle, color: TEAM_META.USA.color }}>{p.name.split(" ")[0]}</th>)}
                  {a.eurP.map((p, i) => <th key={`e${i}`} style={{ ...thStyle, color: TEAM_META.EUR.color }}>{p.name.split(" ")[0]}</th>)}
                  <th style={thStyle}>Won by</th>
                </tr>
              </thead>
              <tbody>
                {a.holeRows.map((r) => (
                  <tr key={r.hole.hole} style={{ borderTop: "1px solid #2a463655", background: r.winner ? `${r.winner === "usa" ? TEAM_META.USA.color : r.winner === "eur" ? TEAM_META.EUR.color : "#C7A252"}18` : "transparent" }}>
                    <td style={tdStyle}>{r.hole.hole}</td>
                    <td style={{ ...tdStyle, color: "#6b7a70" }}>{r.hole.par}</td>
                    {a.usaP.map((p, i) => <td key={`u${i}`} style={tdStyle}>{r.concede === "usa" ? "×" : (r.usaGross[i] ?? "–")}{r.usaStrokes[i] > 0 && r.usaGross[i] != null && r.concede !== "usa" ? <span style={{ color: "#C7A252", fontSize: 9 }}> {"●".repeat(r.usaStrokes[i])}</span> : null}</td>)}
                    {a.eurP.map((p, i) => <td key={`e${i}`} style={tdStyle}>{r.concede === "eur" ? "×" : (r.eurGross[i] ?? "–")}{r.eurStrokes[i] > 0 && r.eurGross[i] != null && r.concede !== "eur" ? <span style={{ color: "#C7A252", fontSize: 9 }}> {"●".repeat(r.eurStrokes[i])}</span> : null}</td>)}
                    <td style={{ ...tdStyle, fontWeight: 700, fontSize: 11 }}>
                      {r.winner === "usa" ? <span style={{ color: TEAM_META.USA.color }}>USA{r.concede ? " (c)" : ""}</span>
                        : r.winner === "eur" ? <span style={{ color: TEAM_META.EUR.color }}>EUR{r.concede ? " (c)" : ""}</span>
                        : r.winner === "halved" ? <span style={{ color: "#C7A252" }}>½{r.concede === "half" ? " (a)" : ""}</span> : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1px solid #2a4636", fontSize: 10, color: "#6b7a70" }}>× = conceded · ½ = halved · (a) = agreed half · ● = shot received · gross scores shown</div>
        </div>
      )}
    </div>
  );
}

function BigScoreCell({ name, color, gross, strokes, enabled, onChange }) {
  const net = gross != null && gross !== "" ? gross - strokes : null;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>{name}</div>
      {enabled ? (
        <input type="number" inputMode="numeric" value={gross ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle({ width: "100%", padding: "12px 2px", fontSize: 18, textAlign: "center", fontWeight: 700 })} />
      ) : (
        <div style={{ padding: "12px 2px", fontSize: 18, fontWeight: 700, color: gross != null ? "#F3EDDD" : "#6b7a70", border: "1px solid #2a4636", borderRadius: 6 }}>{gross ?? "–"}</div>
      )}
      <div style={{ fontSize: 11, color: "#C7A252", marginTop: 4, minHeight: 14 }}>
        {strokes > 0 && "●".repeat(strokes)}{strokes > 0 && net != null && <span style={{ color: "#8a9a8f" }}> net {net}</span>}
      </div>
    </div>
  );
}

/* ---------- leaderboard ---------- */

function LeaderboardTab({ state, totals }) {
  const enriched = state.matches.map((m) => {
    const usaLabel = m.usa.map((id) => state.players.find((p) => p.id === id)).filter(Boolean).map((p) => p.name.split(" ")[0]).join("/");
    const eurLabel = m.eur.map((id) => state.players.find((p) => p.id === id)).filter(Boolean).map((p) => p.name.split(" ")[0]).join("/");
    const en = enrichMatch(m, state);
    return { ...en, statusLabel: en.holesPlayed === 0 ? "Not started" : matchStatusLabel(en.diff, en.holesPlayed, en.holesLeft, usaLabel, eurLabel) };
  });
  const target = totals.target;
  return (
    <div>
      <SectionTitle>Overall standings</SectionTitle>
      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        <BigScore meta={TEAM_META.EUR} score={totals.eur} />
        <BigScore meta={TEAM_META.USA} score={totals.usa} />
      </div>
      {target != null && (
        <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 8 }}>
          {enriched.length} match{enriched.length > 1 ? "es" : ""} on the board · {totals.totalPoints} points on offer · more than {target} wins the cup outright
        </div>
      )}
      {totals.pointsRemaining > 0 && (
        <div style={{ fontSize: 12, color: "#C7A252", marginBottom: 18, fontWeight: 600 }}>{totals.pointsRemaining} point{totals.pointsRemaining !== 1 ? "s" : ""} still to play for</div>
      )}
      <SectionTitle>Match results</SectionTitle>
      {enriched.length === 0 && <EmptyNote>No matches created yet.</EmptyNote>}
      {enriched.map((m) => (
        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", border: "1px solid #2a4636", borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
          <div>
            <div>
              <span style={{ color: TEAM_META.USA.color, fontWeight: 700 }}>{m.usaP.map((p) => p.name).join(" & ")}</span>
              <span style={{ color: "#6b7a70" }}> vs </span>
              <span style={{ color: TEAM_META.EUR.color, fontWeight: 700 }}>{m.eurP.map((p) => p.name).join(" & ")}</span>
            </div>
            <div style={{ color: "#6b7a70", fontSize: 11 }}>Day {m.day} · {state.courses[m.course].name} · worth {m.points === 1 ? "1 pt" : `${m.points} pts`}</div>
          </div>
          <div style={{ fontWeight: 700, color: m.finished ? "#C7A252" : "#D9C7A0", alignSelf: "center", textAlign: "right" }}>{m.statusLabel}</div>
        </div>
      ))}
    </div>
  );
}

function BigScore({ meta, score }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${meta.color}66`, borderRadius: 12, padding: "16px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, letterSpacing: 1 }}>{meta.flag} {meta.label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Fraunces', serif", color: "#F3EDDD" }}>{score}</div>
    </div>
  );
}

/* ---------- admin ---------- */

function AdminTab({ state, update }) {
  const [playerPin, setPlayerPin] = useState(state.settings.playerPin);
  const [adminPin, setAdminPin] = useState(state.settings.adminPin);
  const savePins = () => update((prev) => ({ ...prev, settings: { adminPin: adminPin || prev.settings.adminPin, playerPin: playerPin || prev.settings.playerPin } }));
  const resetEverything = () => {
    if (!confirm("Reset all players, matches and feed? This can't be undone.")) return;
    update((prev) => ({ ...DEFAULT_STATE, settings: prev.settings }));
  };
  return (
    <div>
      <SectionTitle>Admin settings</SectionTitle>
      <div style={{ fontSize: 12, color: "#8a9a8f", marginBottom: 14 }}>Share the player PIN with everyone playing so they can enter scores. Keep the admin PIN to yourself.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        <label style={{ fontSize: 12 }}>Player PIN<input value={playerPin} onChange={(e) => setPlayerPin(e.target.value)} style={inputStyle({ width: "100%", marginTop: 4 })} /></label>
        <label style={{ fontSize: 12 }}>Admin PIN<input value={adminPin} onChange={(e) => setAdminPin(e.target.value)} style={inputStyle({ width: "100%", marginTop: 4 })} /></label>
        <button onClick={savePins} style={primaryBtn()}>Save PINs</button>
      </div>
      <div style={{ borderTop: "1px solid #2a4636", paddingTop: 14 }}>
        <button onClick={resetEverything} style={ghostBtn({ borderColor: "#8a5555", color: "#c98686" })}>Reset entire event</button>
      </div>
    </div>
  );
}

/* ---------- shared bits ---------- */

function SectionTitle({ children }) { return <h2 style={{ fontSize: 15, color: "#C7A252", marginBottom: 12, letterSpacing: 0.3 }}>{children}</h2>; }
function EmptyNote({ children }) { return <div style={{ fontSize: 12, color: "#8a9a8f", padding: 14, border: "1px dashed #2a4636", borderRadius: 8 }}>{children}</div>; }
function inputStyle(extra = {}) { return { background: "#0f2419", border: "1px solid #3a5a44", color: "#F3EDDD", borderRadius: 6, padding: "8px 10px", fontSize: 13, ...extra }; }
function primaryBtn(extra = {}) { return { background: "#C7A252", color: "#0f2419", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, ...extra }; }
function ghostBtn(extra = {}) { return { background: "transparent", color: "#D9C7A0", border: "1px solid #3a5a44", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600, ...extra }; }
const thStyle = { padding: "6px 8px", fontWeight: 600 };
const tdStyle = { padding: "5px 8px", textAlign: "center" };
