// Mohamed – Analytics.js (ansattportal)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, query, where,
  onSnapshot, doc, setDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  databaseURL: "https://noragenticportal-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* =========================================================
   HJELPEFUNKSJONER
========================================================= */
const WEEK_DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function clamp(num, min, max) { return Math.min(max, Math.max(min, num)); }

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDayIndexFromDate(date) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

function getTodayWeekIndex() {
  return new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
}

// Mohamed – daglig snapshot-nøkkel
function getTodayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

function formatDateNo(dateLike) {
  if (!dateLike) return "Ikke satt";
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("no-NO");
}

// Mohamed – kortformat dato for graf: "29.4"
function fmtD(date) {
  if (!date) return "";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return `${d.getDate()}.${d.getMonth()+1}`;
}

function daysSince(dateLike) {
  if (!dateLike) return null;
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

/* =========================================================
   STATE
========================================================= */
let _state = {
  progressPct:      0,
  goalText:         "Her kan prosjektets aktive delmål vises",
  startedAt:        null,
  daysUsed:         0,
  durationDays:     90,
  daysLeft:         90,
  totalFiles:       0,
  filesThisWeek:    0,
  messagesCount:    0,
  weeklyFileCounts: [0,0,0,0,0,0,0],
  milestones:          [],
  milestonesDone:      0,
  milestonesTotal:     0,
  currentMilestone:    "Ikke satt",
  nextMilestoneDate:   null,
  milestoneRisk:       "low",
  milestoneRiskLabel:  "Lav risiko",
  // Mohamed – tasks per milepæl: { milestoneId: { total, done } }
  tasksByMilestone:    {},
  latestFileAt:     null,
  latestMessageAt:  null,
  latestProgressAt: null,
  activityLabel:    "Lav aktivitet",
  activityTone:     "low",
  summaryText:      "Ingen oppsummering tilgjengelig.",
  alerts:           []
};

let _unsubs = [];
let _currentProjectId = null;
let _lastAutoSnapshotKey = null; // Mohamed – unngå dobbel-skriving per dag

function stopAll() { _unsubs.forEach(u => u()); _unsubs = []; }

/* =========================================================
   DERIVED STATE
   Mohamed – progress beregnes automatisk fra fullførte milepæler
========================================================= */
function recomputeDerivedState() {
  _state.daysLeft = Math.max(0, (_state.durationDays || 0) - (_state.daysUsed || 0));

  const milestones = Array.isArray(_state.milestones) ? _state.milestones : [];
  const total      = milestones.length;
  const done       = milestones.filter(m => m.done).length;

  _state.milestonesTotal = total;
  _state.milestonesDone  = done;
  _state.progressPct     = total > 0 ? Math.round((done / total) * 100) : 0;

  const next = milestones.find(m => !m.done);
  _state.currentMilestone  = next?.title || (total > 0 ? "Alle milepæler fullført ✓" : "Ingen milepæler");
  _state.nextMilestoneDate = next?.date  || null;

  let daysToNext = null;
  if (_state.nextMilestoneDate) {
    const mDate = _state.nextMilestoneDate?.toDate
      ? _state.nextMilestoneDate.toDate()
      : new Date(_state.nextMilestoneDate);
    daysToNext = Math.ceil((mDate.getTime() - Date.now()) / 86400000);
  }

  const pct = _state.progressPct;

  if (done === total && total > 0) {
    _state.milestoneRisk      = "low";
    _state.milestoneRiskLabel = "Alle milepæler fullført ✓";
  } else if (daysToNext !== null && daysToNext <= 0) {
    _state.milestoneRisk      = "high";
    _state.milestoneRiskLabel = "Milepæl overskredet!";
  } else if (daysToNext !== null && daysToNext <= 7 && pct < 75) {
    _state.milestoneRisk      = "high";
    _state.milestoneRiskLabel = "Høy risiko";
  } else if (daysToNext !== null && daysToNext <= 14 && pct < 50) {
    _state.milestoneRisk      = "medium";
    _state.milestoneRiskLabel = "Moderat risiko";
  } else {
    _state.milestoneRisk      = "low";
    _state.milestoneRiskLabel = "Lav risiko";
  }

  const filesThisWeek    = _state.filesThisWeek  || 0;
  const messagesThisWeek = _state.messagesCount   || 0;
  const activityScore    = filesThisWeek + messagesThisWeek;

  if (activityScore >= 8)      { _state.activityLabel = "Høy aktivitet";     _state.activityTone = "high"; }
  else if (activityScore >= 3) { _state.activityLabel = "Moderat aktivitet"; _state.activityTone = "medium"; }
  else                         { _state.activityLabel = "Lav aktivitet";     _state.activityTone = "low"; }

  const alerts = [];
  if (messagesThisWeek === 0) alerts.push("Ingen nye meldinger denne uken.");
  if (filesThisWeek    === 0) alerts.push("Ingen nye filer denne uken.");

  const expectedPct = _state.durationDays > 0
    ? Math.round((_state.daysUsed / _state.durationDays) * 100) : 0;
  if (pct + 10 < expectedPct) alerts.push("Fremdriften ligger bak forventet nivå basert på tidsbruk.");

  if (_state.milestoneRisk === "high" && done < total)
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);
  else if (_state.milestoneRisk === "medium")
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);

  const noFilesDays    = daysSince(_state.latestFileAt);
  const noMsgDays      = daysSince(_state.latestMessageAt);
  const noProgressDays = daysSince(_state.latestProgressAt);
  if (noFilesDays    !== null && noFilesDays    >= 7) alerts.push(`Ingen nye filer de siste ${noFilesDays} dagene.`);
  if (noMsgDays      !== null && noMsgDays      >= 7) alerts.push(`Ingen meldinger de siste ${noMsgDays} dagene.`);
  if (noProgressDays !== null && noProgressDays >= 7) alerts.push(`Milepæler ikke oppdatert på ${noProgressDays} dager.`);

  _state.alerts = alerts;

  // Mohamed – fjernet "X meldinger sendt" fra oppsummeringen
  _state.summaryText = [
    `Prosjektet er ${pct}% ferdig (${done} av ${total} milepæler fullført).`,
    `${_state.daysUsed} dager er brukt og ${_state.daysLeft} dager gjenstår.`,
    `Aktivitetsnivået denne uken er ${_state.activityLabel.toLowerCase()}.`,
    filesThisWeek > 0 ? `${filesThisWeek} nye filer lastet opp.` : ""
  ].filter(Boolean).join(" ");
}

/* =========================================================
   LIVE-LYTTERE
========================================================= */
function startLiveAnalytics(projectId) {
  stopAll();
  _currentProjectId = projectId;

  _state = {
    progressPct: 0, goalText: "Her kan prosjektets aktive delmål vises",
    startedAt: null, daysUsed: 0, durationDays: 90, daysLeft: 90,
    totalFiles: 0, filesThisWeek: 0, messagesCount: 0,
    weeklyFileCounts: [0,0,0,0,0,0,0],
    milestones: [], milestonesDone: 0, milestonesTotal: 0,
    currentMilestone: "Ikke satt", nextMilestoneDate: null,
    milestoneRisk: "low", milestoneRiskLabel: "Lav risiko",
    tasksByMilestone: {},
    latestFileAt: null, latestMessageAt: null, latestProgressAt: null,
    activityLabel: "Lav aktivitet", activityTone: "low",
    summaryText: "Ingen oppsummering tilgjengelig.", alerts: []
  };

  showLoading();

  /* ---- 1. Prosjektdokument ---- */
  _unsubs.push(onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.startedAt?.toDate) {
          _state.startedAt = d.startedAt.toDate();
          _state.daysUsed  = Math.max(0,
            Math.floor((Date.now() - _state.startedAt.getTime()) / 86400000)
          );
        }
        if (typeof d.durationDays === "number") _state.durationDays = d.durationDays;
        if (d.goalText) _state.goalText = d.goalText;
        // Mohamed – milestones-array styrer alt
        _state.milestones       = Array.isArray(d.milestones) ? d.milestones : [];
        _state.latestProgressAt = d.updatedAt?.toDate?.() || d.createdAt?.toDate?.() || null;
      }

      recomputeDerivedState();

      // Mohamed – oppdater hero med milepæl-fremgang istedet for delmål-tekst
      const goalEl = document.getElementById("projectGoal");
      if (goalEl) goalEl.textContent = `${_state.milestonesDone} av ${_state.milestonesTotal} fullført`;

      // Mohamed – lagre snapshot automatisk én gang per dag
      const todayKey = getTodayKey();
      if (_lastAutoSnapshotKey !== todayKey && _currentProjectId) {
        _lastAutoSnapshotKey = todayKey;
        setDoc(
          doc(db, "projects", _currentProjectId, "progressHistory", todayKey),
          { pct: _state.progressPct, savedAt: serverTimestamp() },
          { merge: true }
        ).catch(() => {});
      }

      renderWidget();
    },
    (err) => { console.warn("Project:", err.code); recomputeDerivedState(); renderWidget(); }
  ));

  /* ---- 2. Filer – filtrert lokalt for å unngå compound index ---- */
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart        = getWeekStart().getTime();
      let filesThisWeek      = 0;
      let latestFileAt       = null;
      const weeklyFileCounts = [0,0,0,0,0,0,0];

      snap.forEach(d => {
        const data     = d.data();
        const fileDate = data.createdAt?.toDate?.()    ||
                         data.dateUploaded?.toDate?.() ||
                         (data.createdAt?.seconds   ? new Date(data.createdAt.seconds * 1000)   : null) ||
                         (data.dateUploaded?.seconds ? new Date(data.dateUploaded.seconds * 1000) : null) ||
                         null;
        if (fileDate) {
          if (fileDate.getTime() >= weekStart) {
            filesThisWeek++;
            weeklyFileCounts[getWeekDayIndexFromDate(fileDate)]++;
          }
          if (!latestFileAt || fileDate > latestFileAt) latestFileAt = fileDate;
        }
      });

      _state.totalFiles       = snap.size;
      _state.filesThisWeek    = filesThisWeek;
      _state.latestFileAt     = latestFileAt;
      _state.weeklyFileCounts = weeklyFileCounts;

      recomputeDerivedState();
      renderWidget();
    },
    (err) => { console.warn("Files:", err.code); }
  ));

  /* ---- 3. Meldinger ---- */
  _unsubs.push(onSnapshot(
    query(collection(db, "messages"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let count = 0;
      let latestMessageAt = null;

      snap.forEach(d => {
        const data    = d.data();
        const msgDate = data.createdAt?.toDate?.() ||
                        (data.time ? new Date(data.time) : null) || null;
        if (msgDate) {
          if (msgDate.getTime() >= weekStart) count++;
          if (!latestMessageAt || msgDate > latestMessageAt) latestMessageAt = msgDate;
        }
      });

      _state.messagesCount   = count;
      _state.latestMessageAt = latestMessageAt;
      recomputeDerivedState();
      renderWidget();
    },
    (err) => { console.warn("Messages:", err.code); }
  ));

  /* ---- 4. Tasks – gruppert per milepæl ---- */
  _unsubs.push(onSnapshot(
    collection(db, "projects", projectId, "tasks"),
    (snap) => {
      const byMs = {};
      snap.forEach(d => {
        const t  = d.data();
        const id = t.delmalId || "ukjent";
        if (!byMs[id]) byMs[id] = { total: 0, done: 0 };
        byMs[id].total++;
        if (t.done) byMs[id].done++;
      });
      _state.tasksByMilestone = byMs;
      renderWidget();
    },
    (err) => { console.warn("Tasks:", err.code); }
  ));
}

/* =========================================================
   SVG GRAF – milepæl-fremgang over tid
   Mohamed – bruker milepæl-datoer direkte. Viser linjegraf som
   stiger etter hvert som milepæler fullføres.
========================================================= */
function buildProgressChart() {
  const milestones = _state.milestones || [];
  const total      = milestones.length;

  const doneWithDates = milestones
    .filter(m => m.done && m.date)
    .map(m => ({ date: m.date?.toDate ? m.date.toDate() : new Date(m.date), title: m.title }))
    .sort((a, b) => a.date - b.date);

  const today      = new Date();
  const currentPct = total > 0 ? Math.round((_state.milestonesDone / total) * 100) : 0;

  const points = [];

  if (doneWithDates.length > 0) {
    const start = new Date(doneWithDates[0].date);
    start.setDate(start.getDate() - 1);
    points.push({ pct: 0, label: fmtD(start) });

    doneWithDates.forEach((m, idx) => {
      const pct = Math.round(((idx + 1) / total) * 100);
      points.push({ pct, label: fmtD(m.date), title: m.title });
    });
  } else {
    points.push({ pct: 0, label: "Start" });
  }

  const lastPt = points[points.length - 1];
  if (lastPt.label !== fmtD(today)) {
    points.push({ pct: currentPct, label: "I dag", isToday: true });
  } else {
    points[points.length - 1].isToday = true;
  }

  const n = points.length;
  const W = 300, H = 130;
  const PAD = { top: 14, right: 16, bottom: 30, left: 40 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;
  const xPos = i => PAD.left + (n === 1 ? iW / 2 : (i / (n - 1)) * iW);
  const yPos = v => PAD.top  + iH - (v / 100) * iH;

  const grid = [0,25,50,75,100].map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}" x2="${PAD.left+iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left-5}" y="${(yPos(v)+4).toFixed(1)}" text-anchor="end" font-size="8"
          fill="rgba(255,255,255,0.40)">${v}%</text>`).join("");

  const xLabels = points.map((p, i) => `
    <text x="${xPos(i).toFixed(1)}" y="${(H-5).toFixed(1)}" text-anchor="middle" font-size="8"
          fill="${p.isToday ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.60)'}"
          font-weight="${p.isToday ? '700' : '400'}">${p.label}</text>`).join("");

  // Mohamed – vanlig linje (ikke trappefunksjon)
  const linePath = points.length > 1
    ? `M ${points.map((p,i) => `${xPos(i).toFixed(1)},${yPos(p.pct).toFixed(1)}`).join(" L ")}`
    : `M ${xPos(0).toFixed(1)},${yPos(points[0].pct).toFixed(1)}`;

  const areaPath = points.length > 1
    ? `M ${xPos(0).toFixed(1)},${(PAD.top+iH).toFixed(1)} L ${points.map((p,i) => `${xPos(i).toFixed(1)},${yPos(p.pct).toFixed(1)}`).join(" L ")} L ${xPos(n-1).toFixed(1)},${(PAD.top+iH).toFixed(1)} Z`
    : "";

  const dots = points.map((p, i) => `
    <circle cx="${xPos(i).toFixed(1)}" cy="${yPos(p.pct).toFixed(1)}"
            r="${p.isToday ? 5 : 3.5}"
            fill="${p.isToday ? '#60a5fa' : '#93c5fd'}"
            stroke="rgba(255,255,255,0.90)" stroke-width="1.5">
      <title>${p.label}: ${p.pct}%${p.title ? ` – ${p.title}` : ""}</title>
    </circle>`).join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
       style="width:100%;height:auto;display:block;overflow:visible">
    <defs><linearGradient id="msGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(96,165,250,0.40)"/>
      <stop offset="100%" stop-color="rgba(96,165,250,0.00)"/>
    </linearGradient></defs>
    ${grid}
    ${areaPath ? `<path d="${areaPath}" fill="url(#msGrad)"/>` : ""}
    <path d="${linePath}" fill="none" stroke="#60a5fa" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xLabels}
  </svg>`;
}

/* =========================================================
   RENDER HELPERS
========================================================= */
function showLoading() {
  const c = document.getElementById("weekPlaceholder");
  if (c) c.innerHTML = `
    <div class="analytics-loading">
      <div class="analytics-spinner"></div>
      <span>Kobler til database…</span>
    </div>`;
}

function animateBar(id, pct) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + "%";
  }));
}

/* =========================================================
   RENDER WIDGET
========================================================= */
function renderWidget() {
  const container = document.getElementById("weekPlaceholder");
  if (!container) return;

  const { progressPct, daysUsed, daysLeft, totalFiles,
          filesThisWeek, messagesCount, milestones, milestonesDone,
          milestonesTotal, currentMilestone, nextMilestoneDate,
          milestoneRisk, milestoneRiskLabel, activityLabel, activityTone,
          summaryText, alerts } = _state;
  const pct = progressPct || 0;

  // Mohamed – finn aktiv milepæl (første ikke-fullførte)
  const activeMilestone = milestones.find(m => !m.done);
  const activeTasks     = activeMilestone
    ? (_state.tasksByMilestone?.[activeMilestone.id] || { total: 0, done: 0 })
    : { total: 0, done: 0 };
  const activeTaskPct   = activeTasks.total > 0
    ? Math.round((activeTasks.done / activeTasks.total) * 100) : 0;

  // Mohamed – bar vises alltid rett over milepæl-lista, renamed fra "Tasks" til "Oppgaver"
  const activeTaskBar = activeMilestone ? `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;
                  color:rgba(255,255,255,0.55);margin-bottom:5px">
        <span>Oppgaver i <strong style="color:rgba(255,255,255,0.85)">${activeMilestone.title}</strong></span>
        <!-- Mohamed – byttet fra "Tasks i" til "Oppgaver i" -->
        <span>${activeTasks.done} / ${activeTasks.total > 0 ? activeTasks.total : "0"} (${activeTaskPct}%)</span>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:999px;height:10px;overflow:hidden">
        <div style="width:${activeTaskPct}%;height:100%;
                    background:linear-gradient(90deg,rgba(74,222,128,0.90),rgba(134,239,172,0.95));
                    border-radius:999px;transition:width 0.7s ease;
                    box-shadow:0 0 10px rgba(74,222,128,0.45)"></div>
      </div>
    </div>` : "";

  // Mohamed – milepæl-liste
  const milestonesHtml = milestones.length > 0
    ? milestones.map((m, i) => `
        <div class="milestone-row ${m.done ? 'done' : ''}">
          <span class="milestone-check">${m.done ? '✓' : '○'}</span>
          <span class="milestone-title">${m.title || `Milepæl ${i+1}`}</span>
          ${m.date ? `<span class="milestone-date">${formatDateNo(m.date)}</span>` : ""}
        </div>`).join("")
    : `<div style="font-size:12px;color:rgba(255,255,255,0.45)">Ingen milepæler lagt inn ennå. Trykk Rediger for å legge til.</div>`;

  const alertsHtml = alerts.length
    ? alerts.map(a => `<div class="analytics-alert-item">${a}</div>`).join("")
    : `<div class="analytics-alert-item ok">Ingen varsler akkurat nå. Fremdrift og aktivitet ser stabile ut.</div>`;

  container.innerHTML = `
    <div class="analytics-widget">

      <div class="analytics-summary-card">
        <div class="analytics-summary-title">Prosjektoppsummering</div>
        <p class="analytics-summary-text">${summaryText}</p>
      </div>

      <div class="analytics-stats">
        <div class="stat-card">
          <span class="stat-number">${daysUsed}</span>
          <span class="stat-label">Dager brukt</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${daysLeft}</span>
          <span class="stat-label">Dager igjen</span>
        </div>
      </div>

      <div class="analytics-grid-2">
        <!-- Mohamed – endret fra å vise total milepæl-% til å vise task-info fra grønn bar -->
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Nåværende milepæl</div>
          ${activeMilestone ? `
            <div class="analytics-mini-big" style="font-size:13px">${activeMilestone.title}</div>
            <div class="analytics-mini-meta">${activeTasks.done} / ${activeTasks.total} oppgaver fullført</div>
            <div class="analytics-mini-meta">${activeTaskPct}% av milepælen</div>
          ` : `
            <div class="analytics-mini-big" style="font-size:13px">Alle fullført ✓</div>
            <div class="analytics-mini-meta">${milestonesTotal} av ${milestonesTotal} milepæler er fullført</div>
            <div class="analytics-mini-meta">Prosjektet er ferdig</div>
          `}
        </div>
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Risiko</div>
          <div class="analytics-mini-big">${milestoneRiskLabel}</div>
          <div class="analytics-mini-meta">Neste: ${formatDateNo(nextMilestoneDate)}</div>
          <div class="analytics-mini-meta tone-${activityTone}">${activityLabel}</div>
        </div>
      </div>

      <!-- Mohamed – task-bar rett over milepæl-lista -->
      ${activeTaskBar}
      <div class="analytics-milestone-box" style="margin-top:0">
        <div class="analytics-milestone-title" style="margin-bottom:8px">Milepæler (${milestonesDone}/${milestonesTotal})</div>
        <div class="analytics-milestone-list">${milestonesHtml}</div>
      </div>

      <!-- Mohamed – endret tittel fra "denne uken" til "over tid" -->
      <div class="analytics-chart-wrap">
        <div class="analytics-chart-title">Milepæl-fremgang over tid</div>
        <div class="analytics-chart-inner">${buildProgressChart()}</div>
        <p class="analytics-chart-sub">Blå linje viser total prosjektfremgang – stiger når en milepæl fullføres</p>
      </div>

      <div class="analytics-alert-box">
        <div class="analytics-alert-title">Varsler og risiko</div>
        <div class="analytics-alert-list">${alertsHtml}</div>
      </div>

      <!-- Mohamed – fjernet "Totale filer på prosjektet", erstattet med neste milepæl-info -->
      <div class="analytics-footer-stats">
        <span>Neste milepæl: <strong>${activeMilestone ? `${activeMilestone.title} – ${formatDateNo(activeMilestone.date)}` : "Alle milepæler fullført ✓"}</strong></span>
      </div>

    </div>`;

  animateBar("heroProgressBar", pct);
  const heroPctEl = document.getElementById("heroProgressPct");
  if (heroPctEl) heroPctEl.textContent = pct + "%";
}

/* =========================================================
   ADMIN MODAL
   Mohamed – fjernet emoji fra tittelen, fjernet ukesnotat-felt
========================================================= */
function openAdminModal() {
  const existing = document.getElementById("adminModal");
  if (existing) { existing.remove(); return; }

  const milestones = _state.milestones || [];
  const modal = document.createElement("div");
  modal.id = "adminModal";
  modal.innerHTML = `
    <div class="admin-backdrop"></div>
    <div class="admin-panel">
      <div class="admin-title">Rediger prosjekt</div>

      <!-- Mohamed – ukesnotat fjernet, kan implementeres senere -->

      <label class="admin-label">Prosjektstart</label>
      <input id="adminStart" type="date" class="admin-input"
             value="${_state.startedAt ? _state.startedAt.toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}"/>

      <label class="admin-label">Total varighet (dager)</label>
      <input id="adminDuration" type="number" class="admin-input"
             value="${_state.durationDays || 90}" min="1"/>

      <label class="admin-label">
        Milepæler
        <span style="font-size:10px;color:rgba(255,255,255,0.40);margin-left:6px;text-transform:none">
          Progress beregnes automatisk fra fullførte milepæler
        </span>
      </label>

      <div id="adminMilestoneList" class="admin-milestone-list">
        ${milestones.map((m, i) => `
          <div class="admin-milestone-row" data-idx="${i}">
            <input type="checkbox" class="admin-ms-check" ${m.done ? "checked" : ""}/>
            <input type="text" class="admin-input" value="${m.title || ""}" placeholder="Milepæl-tittel…"/>
            <input type="date" class="admin-input admin-ms-date"
                   value="${m.date ? (() => { try { const d = m.date?.toDate ? m.date.toDate() : new Date(m.date); return d.toISOString().slice(0,10); } catch(e){ return ""; }})() : ""}"/>
            <button class="admin-ms-remove" type="button">✕</button>
          </div>`).join("")}
      </div>

      <button id="adminAddMilestone" class="admin-btn" type="button">+ Legg til milepæl</button>

      <div class="admin-actions">
        <button id="adminSave" class="admin-btn primary">Lagre til Firebase</button>
        <button id="adminClose" class="admin-btn">Avbryt</button>
      </div>
      <p id="adminStatus" class="admin-status"></p>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelector(".admin-backdrop").addEventListener("click", () => modal.remove());
  document.getElementById("adminClose").addEventListener("click",  () => modal.remove());

  modal.querySelectorAll(".admin-ms-remove").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".admin-milestone-row").remove());
  });

  document.getElementById("adminAddMilestone").addEventListener("click", () => {
    const list = document.getElementById("adminMilestoneList");
    const row  = document.createElement("div");
    row.className = "admin-milestone-row";
    row.innerHTML = `
      <input type="checkbox" class="admin-ms-check"/>
      <input type="text" class="admin-input" placeholder="Milepæl-tittel…"/>
      <input type="date" class="admin-input admin-ms-date"/>
      <button class="admin-ms-remove" type="button">✕</button>`;
    list.appendChild(row);
    row.querySelector(".admin-ms-remove").addEventListener("click", () => row.remove());
  });

  document.getElementById("adminSave").addEventListener("click", async () => {
    const startStr = document.getElementById("adminStart").value;
    const duration = parseInt(document.getElementById("adminDuration").value, 10);
    const statusEl = document.getElementById("adminStatus");

    const rows       = document.querySelectorAll(".admin-milestone-row");
    const milestones = [];
    rows.forEach((row, i) => {
      const title   = row.querySelector("input[type=text]")?.value.trim();
      const done    = row.querySelector(".admin-ms-check")?.checked || false;
      const dateVal = row.querySelector(".admin-ms-date")?.value;
      if (title) {
        milestones.push({
          id:    `ms_${i}`,
          title,
          done,
          date: dateVal ? Timestamp.fromDate(new Date(dateVal)) : null
        });
      }
    });

    const nextMs   = milestones.find(m => !m.done);
    const goalText = nextMs?.title || (milestones.length > 0 ? "Alle milepæler fullført ✓" : _state.goalText);

    if (!_currentProjectId) { statusEl.textContent = "Ingen prosjekt valgt."; return; }

    statusEl.textContent = "Lagrer…";
    try {
      await setDoc(doc(db, "projects", _currentProjectId), {
        startedAt:    startStr ? Timestamp.fromDate(new Date(startStr)) : serverTimestamp(),
        durationDays: isNaN(duration) ? 90 : duration,
        milestones,
        goalText,
        updatedAt:    serverTimestamp()
      }, { merge: true });

      // Lagre dagens progress-snapshot for grafen
      const snapPct = milestones.length > 0
        ? Math.round(milestones.filter(m => m.done).length / milestones.length * 100) : 0;
      await setDoc(
        doc(db, "projects", _currentProjectId, "progressHistory", getTodayKey()),
        { pct: snapPct, savedAt: serverTimestamp() },
        { merge: true }
      );

      statusEl.style.color = "#86efac";
      statusEl.textContent = "✓ Lagret!";
      setTimeout(() => modal.remove(), 900);
    } catch (err) {
      statusEl.style.color = "#f87171";
      statusEl.textContent = "Feil: " + err.message;
      console.error(err);
    }
  });
}

window.openAdminModal = openAdminModal;

/* =========================================================
   INIT
========================================================= */
function initAnalytics() {
  if (!document.getElementById("adminModalStyles")) {
    const s = document.createElement("style");
    s.id = "adminModalStyles";
    s.textContent = `
      #adminModal { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; }
      .admin-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.60); backdrop-filter:blur(4px); }
      .admin-panel {
        position:relative; z-index:1; width:min(520px,94vw);
        background:rgba(14,18,30,0.97); border:1px solid rgba(255,255,255,0.16);
        border-radius:20px; padding:24px; box-shadow:0 24px 60px rgba(0,0,0,0.6);
        display:flex; flex-direction:column; gap:10px;
        max-height:90vh; overflow-y:auto;
      }
      .admin-title { font-size:16px; font-weight:800; color:rgba(255,255,255,0.95); margin-bottom:4px; }
      .admin-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,0.55); margin-top:4px; }
      .admin-input { width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.92); font-size:13px; outline:none; font-family:inherit; }
      .admin-input:focus { border-color:rgba(96,165,250,0.60); }
      .admin-textarea { resize:vertical; min-height:72px; }
      .admin-actions { display:flex; gap:8px; margin-top:6px; }
      .admin-btn { flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.88); font-size:13px; font-weight:600; cursor:pointer; }
      .admin-btn.primary { background:#3b82f6; border-color:#60a5fa; color:#fff; }
      .admin-btn.primary:hover { background:#2563eb; }
      .admin-btn:hover { background:rgba(255,255,255,0.14); }
      .admin-status { font-size:12px; min-height:16px; margin:0; color:rgba(255,255,255,0.60); }
      .admin-milestone-list { display:flex; flex-direction:column; gap:6px; }
      .admin-milestone-row { display:grid; grid-template-columns:auto 1fr auto auto; align-items:center; gap:8px; }
      .admin-ms-check { width:16px; height:16px; cursor:pointer; accent-color:#60a5fa; flex-shrink:0; }
      .admin-ms-date { width:120px; flex-shrink:0; }
      .admin-ms-remove { background:none; border:none; color:rgba(255,255,255,0.40); cursor:pointer; font-size:14px; padding:2px 6px; }
      .admin-ms-remove:hover { color:#f87171; }
      .analytics-milestone-box { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:12px; padding:12px 14px; }
      .analytics-milestone-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:rgba(255,255,255,0.50); margin-bottom:8px; }
      .analytics-milestone-list { display:flex; flex-direction:column; gap:6px; }
      .milestone-row { display:flex; align-items:center; gap:8px; font-size:13px; color:rgba(255,255,255,0.80); }
      .milestone-row.done { opacity:0.55; text-decoration:line-through; }
      .milestone-check { font-size:14px; color:#60a5fa; flex-shrink:0; }
      .milestone-row.done .milestone-check { color:#4ade80; }
      .milestone-title { flex:1; }
      .milestone-date { font-size:11px; color:rgba(255,255,255,0.45); white-space:nowrap; }
    `;
    document.head.appendChild(s);
  }

  showLoading();
  const projectId = window.currentProjectId;
  if (projectId) startLiveAnalytics(projectId);

  window.addEventListener("projectChanged", (e) => {
    if (e.detail?.projectId) startLiveAnalytics(e.detail.projectId);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics);
} else {
  initAnalytics();
}