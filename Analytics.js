import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* =========================================================
   FIREBASE CONFIG
========================================================= */
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
const rtdb = getDatabase(app);

/* =========================================================
   HELPERS
========================================================= */
const WEEK_DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function getProjectDayLabel(dayNumber) {
  return `Dag ${dayNumber}`;
}

function getHistoryKeyFromDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

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

function buildWeeklyProgressPoints(progressPct) {
  const todayIdx = getTodayWeekIndex();
  const points = [];

  for (let i = 0; i <= todayIdx; i++) {
    let pct;

    if (todayIdx === 0) {
      pct = progressPct;
    } else {
      const ratio = i / todayIdx;
      pct = Math.round(progressPct * ratio);
    }

    points.push({
      label: WEEK_DAY_LABELS[i],
      pct
    });
  }

  return points;
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

  progressHistory: [],

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

    progressHistory: [],

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
      } else {
        setDoc(doc(db, "projects", projectId), {
          manualProgress: 0,
          weekNote: "Ingen ukesnotat lagt inn ennå.",
          goalText: "Her kan prosjektets aktive delmål vises",
          startedAt: serverTimestamp(),
          durationDays: 90,
          milestoneTitle: "Prototype ferdig",
          milestoneStatus: "Pågår",
          createdAt: serverTimestamp()
        }).catch((e) => console.warn("Kunne ikke opprette prosjekt:", e));
      }

      const goalEl = document.getElementById("projectGoal");
      if (goalEl) goalEl.textContent = _state.goalText;

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
     2) PROGRESS HISTORY
  ------------------------- */
  _unsubs.push(onSnapshot(
    query(
      collection(db, "projects", projectId, "progressHistory"),
      orderBy("savedAt", "asc"),
      limit(30)
    ),
    (snap) => {
      const history = [];
      let latestSavedAt = null;

      snap.forEach((d) => {
        const data = d.data();
        const savedAt = data.savedAt?.toDate ? data.savedAt.toDate() : null;

        history.push({
          dayLabel: data.dayLabel || data.weekLabel || d.id,
          pct: typeof data.pct === "number" ? data.pct : 0,
          savedAt
        });

        if (savedAt && (!latestSavedAt || savedAt > latestSavedAt)) {
          latestSavedAt = savedAt;
        }
      });

      _state.progressHistory = history;
      _state.latestProgressAt = latestSavedAt;

      recomputeDerivedState();
      renderWidget();
    },
    () => {
      _state.progressHistory = [];
      recomputeDerivedState();
      renderWidget();
    }
  ));

  /* -------------------------
     3) FILES
  ------------------------- */
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let filesThisWeek = 0;
      let latestFileAt = null;

      snap.forEach((d) => {
        const data = d.data();
        const fileDate =
          data.createdAt?.toDate?.() ||
          data.dateUploaded?.toDate?.() ||
          null;

        if (fileDate) {
          if (fileDate.getTime() >= weekStart) {
            filesThisWeek++;
          }
          if (!latestFileAt || fileDate > latestFileAt) {
            latestFileAt = fileDate;
          }
        }
      });

      _state.totalFiles = snap.size;
      _state.filesThisWeek = filesThisWeek;
      _state.latestFileAt = latestFileAt;

      recomputeDerivedState();
      renderWidget();
    },
    (err) => {
      console.warn("Files listener:", err.code);
    }
  ));

  /* -------------------------
     4) MESSAGES (Realtime DB)
  ------------------------- */
  const chatKeyMap = {
    "PROJECT_ABC_123": "p1",
    "PROJECT_DEF_456": "p2",
    "PROJECT_GHI_789": "p3"
  };

  const chatKey = chatKeyMap[projectId] || projectId;
  const chatDbRef = ref(rtdb, "chats/" + chatKey);

  const stopChat = onValue(chatDbRef, (snapshot) => {
    const weekStart = getWeekStart().getTime();
    let count = 0;
    let latestMessageAt = null;

    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const msg = child.val();
        if (msg.time) {
          if (msg.time >= weekStart) count++;
          const msgDate = new Date(msg.time);
          if (!latestMessageAt || msgDate > latestMessageAt) {
            latestMessageAt = msgDate;
          }
        }
      });
    }

    _state.messagesCount = count;
    _state.latestMessageAt = latestMessageAt;

    recomputeDerivedState();
    renderWidget();
  });

  _unsubs.push(() => {
    if (typeof stopChat === "function") stopChat();
  });
}

/* =========================================================
   CHART
========================================================= */
function buildProgressChart() {
  const todayIdx = getTodayWeekIndex();
  const activePoints = buildWeeklyProgressPoints(_state.progressPct || 0);

  const W = 300;
  const H = 130;
  const PAD = { top: 14, right: 12, bottom: 30, left: 34 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const xPos = (i) => PAD.left + (i / 6) * iW;
  const yPos = (v) => PAD.top + iH - (clamp(v, 0, 100) / 100) * iH;

  const yTicks = [0, 25, 50, 75, 100];
  const grid = yTicks.map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}"
          x2="${PAD.left + iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left - 6}" y="${(yPos(v) + 4).toFixed(1)}"
          text-anchor="end" font-size="8"
          fill="rgba(255,255,255,0.40)">${v}%</text>
  `).join("");

  const coords = activePoints.map((p, i) => ({
    x: xPos(i),
    y: yPos(p.pct),
    label: p.label,
    pct: p.pct
  }));

  const linePath = coords.length > 1
    ? `M ${coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ")}`
    : `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  const areaPath = coords.length > 1
    ? `M ${coords[0].x.toFixed(1)},${(PAD.top + iH).toFixed(1)}
       L ${coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ")}
       L ${coords[coords.length - 1].x.toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`
    : "";

  const futureLine = todayIdx < 6
    ? `<line x1="${xPos(todayIdx).toFixed(1)}" y1="${yPos(_state.progressPct).toFixed(1)}"
             x2="${xPos(6).toFixed(1)}" y2="${yPos(_state.progressPct).toFixed(1)}"
             stroke="rgba(147,197,253,0.24)" stroke-width="1.5" stroke-dasharray="4,4"/>`
    : "";

  const dots = coords.map((c, i) => `
    <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}"
            r="${i === coords.length - 1 ? 5 : 3.5}"
            fill="${i === coords.length - 1 ? '#60a5fa' : '#93c5fd'}"
            stroke="rgba(255,255,255,0.92)" stroke-width="1.5">
      <title>${c.label}: ${c.pct}%</title>
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
        <linearGradient id="progressAreaWeekly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(96,165,250,0.40)"/>
          <stop offset="100%" stop-color="rgba(96,165,250,0.00)"/>
        </linearGradient>
      </defs>

      ${grid}
      ${areaPath ? `<path d="${areaPath}" fill="url(#progressAreaWeekly)"/>` : ""}
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
        <div class="analytics-summary-title">Prosjektopsummering</div>
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
        <div class="analytics-chart-title">Prosjektprogresjon denne uken</div>
        <div class="analytics-chart-inner">${buildProgressChart()}</div>
        <p class="analytics-chart-sub">Viser progresjon gjennom inneværende uke</p>
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
   ADMIN MODAL
========================================================= */
function openAdminModal() {
  const existing = document.getElementById("adminModal");
  if (existing) {
    existing.remove();
    return;
  }

  const modal = document.createElement("div");
  modal.id = "adminModal";
  modal.innerHTML = `
    <div class="admin-backdrop"></div>
    <div class="admin-panel">
      <div class="admin-title">⚙️ Rediger prosjekt</div>

      <label class="admin-label">Nåværende delmål</label>
      <input id="adminGoal" class="admin-input"
             value="${_state.goalText}" placeholder="F.eks. Implementering av prototype"/>

      <label class="admin-label">Ukesnotat</label>
      <textarea id="adminNote" class="admin-input admin-textarea"
                placeholder="Beskriv hva som skjedde denne uken…">${_state.weekDescription === "Ingen ukesnotat lagt inn ennå." ? "" : _state.weekDescription}</textarea>

      <label class="admin-label">Fremdrift % (0–100)</label>
      <div class="admin-progress-row">
        <input id="adminPct" type="range" min="0" max="100"
               value="${_state.progressPct}" class="admin-slider"/>
        <span id="adminPctVal" class="admin-pct-val">${_state.progressPct}%</span>
      </div>

      <label class="admin-label">Prosjektstart (dato)</label>
      <input id="adminStart" type="date" class="admin-input"
             value="${_state.startedAt ? _state.startedAt.toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}"/>

      <label class="admin-label">Total varighet (dager)</label>
      <input id="adminDuration" type="number" class="admin-input"
             value="${_state.durationDays || 90}" placeholder="90" min="1"/>

      <label class="admin-label">Neste milepæl</label>
      <input id="adminMilestoneTitle" class="admin-input"
             value="${_state.milestoneTitle || ""}" placeholder="F.eks. Prototype ferdig"/>

      <label class="admin-label">Milepæl dato</label>
      <input id="adminMilestoneDate" type="date" class="admin-input"
             value="${_state.milestoneDate ? new Date(_state.milestoneDate?.toDate ? _state.milestoneDate.toDate() : _state.milestoneDate).toISOString().slice(0,10) : ""}"/>

      <label class="admin-label">Milepæl status</label>
      <input id="adminMilestoneStatus" class="admin-input"
             value="${_state.milestoneStatus || "Pågår"}" placeholder="Pågår / Ferdig / Forsinket"/>

      <div class="admin-actions">
        <button id="adminSave" class="admin-btn primary">Lagre til Firebase</button>
        <button id="adminClose" class="admin-btn">Avbryt</button>
      </div>
      <p id="adminStatus" class="admin-status"></p>
    </div>
  `;

  document.body.appendChild(modal);

  // Slider live preview
  document.getElementById("adminPct").addEventListener("input", (e) => {
    document.getElementById("adminPctVal").textContent = e.target.value + "%";
  });

  // Lukk
  modal.querySelector(".admin-backdrop").addEventListener("click", () => modal.remove());
  document.getElementById("adminClose").addEventListener("click", () => modal.remove());

  // Lagre
  document.getElementById("adminSave").addEventListener("click", async () => {
    const goalText = document.getElementById("adminGoal").value.trim();
    const weekNote = document.getElementById("adminNote").value.trim();
    const pct = parseInt(document.getElementById("adminPct").value, 10);
    const startStr = document.getElementById("adminStart").value;
    const duration = parseInt(document.getElementById("adminDuration").value, 10);
    const milestoneTitle = document.getElementById("adminMilestoneTitle").value.trim();
    const milestoneDate = document.getElementById("adminMilestoneDate").value;
    const milestoneStatus = document.getElementById("adminMilestoneStatus").value.trim();
    const statusEl = document.getElementById("adminStatus");

    if (!_currentProjectId) {
      statusEl.textContent = "Ingen prosjekt valgt.";
      return;
    }

    statusEl.textContent = "Lagrer…";

    try {
      const projectStartDate = startStr ? new Date(startStr) : new Date();
      const currentDayNumber = Math.max(
        0,
        Math.floor((Date.now() - projectStartDate.getTime()) / 86400000)
      );

      await setDoc(doc(db, "projects", _currentProjectId), {
        goalText,
        weekNote: weekNote || "Ingen ukesnotat lagt inn ennå.",
        manualProgress: pct,
        startedAt: startStr ? Timestamp.fromDate(projectStartDate) : serverTimestamp(),
        durationDays: isNaN(duration) ? 90 : duration,
        milestoneTitle: milestoneTitle || "Ikke satt",
        milestoneDate: milestoneDate ? Timestamp.fromDate(new Date(milestoneDate)) : null,
        milestoneStatus: milestoneStatus || "Pågår",
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(
        doc(db, "projects", _currentProjectId, "progressHistory", getHistoryKeyFromDate(new Date())),
        {
          pct,
          dayLabel: getProjectDayLabel(currentDayNumber),
          weekNote: weekNote || "",
          savedAt: serverTimestamp()
        }
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

// Eksponér slik at index.html kan koble knapp
window.openAdminModal = openAdminModal;

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