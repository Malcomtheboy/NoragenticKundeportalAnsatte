import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc
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
const db = getFirestore(app);

/* =========================================================
   HELPERS
========================================================= */
const WEEK_DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Mohamed – gjør om JS sin weekday til index 0=man ... 6=søn
function getWeekDayIndexFromDate(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

// Mohamed – hvilken dag i uka er i dag
function getTodayWeekIndex() {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateNo(dateLike) {
  if (!dateLike) return "Ikke satt";
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("no-NO");
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
  progressPct: 0,
  weekDescription: "Ingen ukesnotat lagt inn ennå.",
  goalText: "Her kan prosjektets aktive delmål vises",
  startedAt: null,
  daysUsed: 0,
  durationDays: 90,
  daysLeft: 90,

  totalFiles: 0,
  filesThisWeek: 0,
  messagesCount: 0,

  // Mohamed – ny: antall filer per dag denne uka
  weeklyFileCounts: [0, 0, 0, 0, 0, 0, 0],

  milestoneTitle: "Ikke satt",
  milestoneDate: null,
  milestoneStatus: "Ikke startet",

  latestFileAt: null,
  latestMessageAt: null,
  latestProgressAt: null,

  activityLabel: "Lav aktivitet",
  activityTone: "low",
  summaryText: "Ingen oppsummering tilgjengelig.",
  alerts: []
};

let _unsubs = [];
let _currentProjectId = null;

function stopAll() {
  _unsubs.forEach((u) => u());
  _unsubs = [];
}

/* =========================================================
   DERIVED STATE
========================================================= */
function recomputeDerivedState() {
  _state.daysLeft = Math.max(0, (_state.durationDays || 0) - (_state.daysUsed || 0));

  const filesThisWeek = _state.filesThisWeek || 0;
  const messagesThisWeek = _state.messagesCount || 0;
  const activityScore = filesThisWeek + messagesThisWeek;

  if (activityScore >= 8) {
    _state.activityLabel = "Høy aktivitet";
    _state.activityTone = "high";
  } else if (activityScore >= 3) {
    _state.activityLabel = "Moderat aktivitet";
    _state.activityTone = "medium";
  } else {
    _state.activityLabel = "Lav aktivitet";
    _state.activityTone = "low";
  }

  const alerts = [];

  // Mohamed – varsler/risiko har nå faktisk logikk
  if (messagesThisWeek === 0) {
    alerts.push("Ingen nye meldinger denne uken – risiko for svak kommunikasjon.");
  }

  if (filesThisWeek === 0) {
    alerts.push("Ingen nye filer denne uken – prosjektet kan ha lav aktivitet.");
  }

  const expectedPct = _state.durationDays > 0
    ? Math.round((_state.daysUsed / _state.durationDays) * 100)
    : 0;

  if ((_state.progressPct || 0) + 10 < expectedPct) {
    alerts.push("Fremdriften ligger bak forventet nivå basert på tidsbruk.");
  }

  if ((_state.daysUsed || 0) > 3 && filesThisWeek <= 1 && messagesThisWeek === 0) {
    alerts.push("Lite aktivitet de siste dagene – bør følges opp.");
  }

  const noFilesDays = daysSince(_state.latestFileAt);
  const noMsgDays = daysSince(_state.latestMessageAt);
  const noProgressDays = daysSince(_state.latestProgressAt);

  if (noFilesDays !== null && noFilesDays >= 7) {
    alerts.push(`Ingen nye filer de siste ${noFilesDays} dagene.`);
  }

  if (noMsgDays !== null && noMsgDays >= 7) {
    alerts.push(`Ingen nye meldinger de siste ${noMsgDays} dagene.`);
  }

  if (noProgressDays !== null && noProgressDays >= 7) {
    alerts.push(`Fremdriften er ikke oppdatert på ${noProgressDays} dager.`);
  }

  _state.alerts = alerts;

  const summaryParts = [];
  summaryParts.push(`Prosjektet er ${_state.progressPct}% ferdig.`);
  summaryParts.push(`${_state.daysUsed} dager er brukt og ${_state.daysLeft} dager gjenstår.`);
  summaryParts.push(`Aktivitetsnivået denne uken er ${_state.activityLabel.toLowerCase()}.`);

  if (filesThisWeek > 0) {
    summaryParts.push(`${filesThisWeek} nye filer er registrert denne uken.`);
  }

  if (messagesThisWeek > 0) {
    summaryParts.push(`${messagesThisWeek} meldinger er sendt denne uken.`);
  }

  _state.summaryText = summaryParts.join(" ");
}

/* =========================================================
   LIVE LISTENERS
========================================================= */
function startLiveAnalytics(projectId) {
  stopAll();
  _currentProjectId = projectId;

  _state = {
    progressPct: 0,
    weekDescription: "Ingen ukesnotat lagt inn ennå.",
    goalText: "Her kan prosjektets aktive delmål vises",
    startedAt: null,
    daysUsed: 0,
    durationDays: 90,
    daysLeft: 90,

    totalFiles: 0,
    filesThisWeek: 0,
    messagesCount: 0,
    weeklyFileCounts: [0, 0, 0, 0, 0, 0, 0],

    milestoneTitle: "Ikke satt",
    milestoneDate: null,
    milestoneStatus: "Ikke startet",

    latestFileAt: null,
    latestMessageAt: null,
    latestProgressAt: null,

    activityLabel: "Lav aktivitet",
    activityTone: "low",
    summaryText: "Ingen oppsummering tilgjengelig.",
    alerts: []
  };

  showLoading();

  /* -------------------------
     1) PROJECT DOC
  ------------------------- */
  _unsubs.push(onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();

        if (typeof d.manualProgress === "number") {
          _state.progressPct = clamp(d.manualProgress, 0, 100);
        } else if (typeof d.progress === "number") {
          _state.progressPct = clamp(d.progress, 0, 100);
        }

        if (d.startedAt?.toDate) {
          _state.startedAt = d.startedAt.toDate();
          _state.daysUsed = Math.max(
            0,
            Math.floor((Date.now() - _state.startedAt.getTime()) / 86400000)
          );
        }

        if (typeof d.daysUsed === "number") {
          _state.daysUsed = d.daysUsed;
        }

        if (typeof d.durationDays === "number") {
          _state.durationDays = d.durationDays;
        }

        if (typeof d.manualProgress !== "number" &&
            typeof d.progress !== "number" &&
            _state.startedAt &&
            _state.durationDays) {
          _state.progressPct = clamp(
            Math.round((_state.daysUsed / _state.durationDays) * 100),
            0,
            100
          );
        }

        if (d.weekNote) _state.weekDescription = d.weekNote;
        if (d.goalText) _state.goalText = d.goalText;

        _state.milestoneTitle = d.milestoneTitle || d.milestone || "Ikke satt";
        _state.milestoneDate = d.milestoneDate || d.eta || null;
        _state.milestoneStatus = d.milestoneStatus || "Pågår";

        _state.latestProgressAt =
          d.updatedAt?.toDate?.() ||
          d.createdAt?.toDate?.() ||
          null;
      }

      recomputeDerivedState();
      renderWidget();
    },
    (err) => {
      console.warn("Project listener:", err.code);
      recomputeDerivedState();
      renderWidget();
    }
  ));

  /* -------------------------
     2) FILES
  ------------------------- */
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let filesThisWeek = 0;
      let latestFileAt = null;

      // Mohamed – ny: teller filer per ukedag
      const weeklyFileCounts = [0, 0, 0, 0, 0, 0, 0];

      snap.forEach((d) => {
        const data = d.data();
        const fileDate =
          data.createdAt?.toDate?.() ||
          data.dateUploaded?.toDate?.() ||
          null;

        if (fileDate) {
          if (fileDate.getTime() >= weekStart) {
            filesThisWeek++;
            const dayIndex = getWeekDayIndexFromDate(fileDate);
            weeklyFileCounts[dayIndex]++;
          }

          if (!latestFileAt || fileDate > latestFileAt) {
            latestFileAt = fileDate;
          }
        }
      });

      _state.totalFiles = snap.size;
      _state.filesThisWeek = filesThisWeek;
      _state.latestFileAt = latestFileAt;
      _state.weeklyFileCounts = weeklyFileCounts;

      recomputeDerivedState();
      renderWidget();
    },
    (err) => {
      console.warn("Files listener:", err.code);
    }
  ));

  /* -------------------------
     3) MESSAGES
  ------------------------- */
  _unsubs.push(onSnapshot(
    query(collection(db, "messages"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let count = 0;
      let latestMessageAt = null;

      snap.forEach((d) => {
        const data = d.data();
        const msgDate = data.createdAt?.toDate?.() || null;

        if (msgDate) {
          if (msgDate.getTime() >= weekStart) {
            count++;
          }

          if (!latestMessageAt || msgDate > latestMessageAt) {
            latestMessageAt = msgDate;
          }
        }
      });

      _state.messagesCount = count;
      _state.latestMessageAt = latestMessageAt;

      recomputeDerivedState();
      renderWidget();
    },
    (err) => {
      console.warn("Messages listener:", err.code);
    }
  ));
}

/* =========================================================
   CHART
========================================================= */
// Mohamed – grafen viser nå filaktivitet denne uka, ikke bare progressPct
function buildProgressChart() {
  const todayIdx = getTodayWeekIndex();
  const counts = Array.isArray(_state.weeklyFileCounts)
    ? _state.weeklyFileCounts
    : [0, 0, 0, 0, 0, 0, 0];

  const visibleCounts = counts.map((value, index) => {
    return index <= todayIdx ? value : null;
  });

  const maxCount = Math.max(1, ...counts);

  const W = 300;
  const H = 130;
  const PAD = { top: 14, right: 12, bottom: 30, left: 34 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const xPos = (i) => PAD.left + (i / 6) * iW;
  const yPos = (v) => PAD.top + iH - (v / maxCount) * iH;

  const yTicks = [0, Math.ceil(maxCount / 2), maxCount];
  const grid = yTicks.map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}"
          x2="${PAD.left + iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left - 6}" y="${(yPos(v) + 4).toFixed(1)}"
          text-anchor="end" font-size="8"
          fill="rgba(255,255,255,0.40)">${v}</text>
  `).join("");

  const activePoints = [];
  for (let i = 0; i <= todayIdx; i++) {
    activePoints.push({
      x: xPos(i),
      y: yPos(visibleCounts[i] || 0),
      value: visibleCounts[i] || 0,
      label: WEEK_DAY_LABELS[i]
    });
  }

  const linePath = activePoints.length > 1
    ? `M ${activePoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
    : `M ${activePoints[0].x.toFixed(1)},${activePoints[0].y.toFixed(1)}`;

  const areaPath = activePoints.length > 1
    ? `M ${activePoints[0].x.toFixed(1)},${(PAD.top + iH).toFixed(1)}
       L ${activePoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}
       L ${activePoints[activePoints.length - 1].x.toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`
    : "";

  const futureLine = todayIdx < 6
    ? `<line x1="${xPos(todayIdx).toFixed(1)}" y1="${yPos(visibleCounts[todayIdx] || 0).toFixed(1)}"
             x2="${xPos(6).toFixed(1)}" y2="${yPos(visibleCounts[todayIdx] || 0).toFixed(1)}"
             stroke="rgba(147,197,253,0.24)" stroke-width="1.5" stroke-dasharray="4,4"/>`
    : "";

  const dots = activePoints.map((p, i) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
            r="${i === activePoints.length - 1 ? 5 : 3.5}"
            fill="${i === activePoints.length - 1 ? '#60a5fa' : '#93c5fd'}"
            stroke="rgba(255,255,255,0.92)" stroke-width="1.5">
      <title>${p.label}: ${p.value} filer</title>
    </circle>
  `).join("");

  const xLabels = WEEK_DAY_LABELS.map((label, i) => `
    <text x="${xPos(i).toFixed(1)}" y="${(H - 5).toFixed(1)}"
          text-anchor="middle" font-size="8"
          fill="${i === todayIdx ? 'rgba(255,255,255,0.92)' : i < todayIdx ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.30)'}"
          font-weight="${i === todayIdx ? '700' : '400'}">${label}</text>
  `).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:auto;display:block;overflow:visible">
      <defs>
        <linearGradient id="filesAreaWeekly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(96,165,250,0.40)"/>
          <stop offset="100%" stop-color="rgba(96,165,250,0.00)"/>
        </linearGradient>
      </defs>

      ${grid}
      ${areaPath ? `<path d="${areaPath}" fill="url(#filesAreaWeekly)"/>` : ""}
      <path d="${linePath}" fill="none" stroke="#60a5fa" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      ${futureLine}
      ${dots}
      ${xLabels}
    </svg>
  `;
}

/* =========================================================
   RENDER
========================================================= */
function showLoading() {
  const c = document.getElementById("weekPlaceholder");
  if (c) {
    c.innerHTML = `
      <div class="analytics-loading">
        <div class="analytics-spinner"></div>
        <span>Kobler til database…</span>
      </div>
    `;
  }
}

function animateBar(id, pct) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + "%";
  }));
}

function renderWidget() {
  const container = document.getElementById("weekPlaceholder");
  if (!container) return;

  const {
    progressPct,
    weekDescription,
    daysUsed,
    daysLeft,
    totalFiles,
    filesThisWeek,
    messagesCount,
    milestoneTitle,
    milestoneDate,
    milestoneStatus,
    activityLabel,
    activityTone,
    summaryText,
    alerts
  } = _state;

  const pct = progressPct || 0;

  const alertsHtml = alerts.length
    ? alerts.map(alert => `<div class="analytics-alert-item">${alert}</div>`).join("")
    : `<div class="analytics-alert-item ok">Ingen varsler akkurat nå. Fremdrift og aktivitet ser stabile ut.</div>`;

  container.innerHTML = `
    <div class="analytics-widget">

      <div class="analytics-header">
        <span class="analytics-title">Ukesprogresjon</span>
        <span class="analytics-pct">${pct}%</span>
      </div>

      <p class="analytics-desc">${weekDescription}</p>

      <div class="analytics-bar-track">
        <div class="analytics-bar-fill" id="innerBar" style="width:0%"></div>
      </div>

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
        <div class="stat-card">
          <span class="stat-number">${filesThisWeek}</span>
          <span class="stat-label">Filer denne uken</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${messagesCount}</span>
          <span class="stat-label">Meldinger denne uken</span>
        </div>
      </div>

      <div class="analytics-grid-2">
        <div class="analytics-mini-card">
          <div class="analytics-mini-title">Neste milepæl</div>
          <div class="analytics-mini-big">${milestoneTitle}</div>
          <div class="analytics-mini-meta">Dato: ${formatDateNo(milestoneDate)}</div>
          <div class="analytics-mini-meta">Status: ${milestoneStatus}</div>
        </div>

        <div class="analytics-mini-card tone-${activityTone}">
          <div class="analytics-mini-title">Aktivitet denne uken</div>
          <div class="analytics-mini-big">${activityLabel}</div>
          <div class="analytics-mini-meta">${filesThisWeek} nye filer</div>
          <div class="analytics-mini-meta">${messagesCount} nye meldinger</div>
        </div>
      </div>

      <div class="analytics-chart-wrap">
        <div class="analytics-chart-title">Filaktivitet denne uken</div>
        <div class="analytics-chart-inner">${buildProgressChart()}</div>
        <p class="analytics-chart-sub">Viser filer lastet opp per dag denne uken</p>
      </div>

      <div class="analytics-alert-box">
        <div class="analytics-alert-title">Varsler og risiko</div>
        <div class="analytics-alert-list">
          ${alertsHtml}
        </div>
      </div>

      <div class="analytics-footer-stats">
        <span>Totale filer på prosjektet: <strong>${totalFiles}</strong></span>
      </div>

    </div>
  `;

  animateBar("innerBar", pct);
  animateBar("heroProgressBar", pct);

  const heroPctEl = document.getElementById("heroProgressPct");
  if (heroPctEl) {
    heroPctEl.textContent = pct + "%";
  }
}

/* =========================================================
   INIT
========================================================= */
function initAnalytics() {
  showLoading();
  const projectId = window.currentProjectId || "PROJECT_ABC_123";
  startLiveAnalytics(projectId);

  window.addEventListener("projectChanged", (e) => {
    if (e.detail?.projectId) {
      startLiveAnalytics(e.detail.projectId);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics);
} else {
  initAnalytics();
}