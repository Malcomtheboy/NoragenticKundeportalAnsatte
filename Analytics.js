import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const db  = getFirestore(app);

/* =========================================================
   HJELPEFUNKSJONER
========================================================= */
const DAY_LABELS = ["Man","Tir","Ons","Tor","Fre","Lør","Søn"];
function jsToIdx(d) { return d === 0 ? 6 : d - 1; }
function todayIdx() { return jsToIdx(new Date().getDay()); }

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/* =========================================================
   STATE
========================================================= */
let _state = {
  allFiles: [], messagesCount: 0, totalFiles: 0,
  daysUsed: 0, progressPct: 0,
  weekDescription: "Ingen ukesnotat lagt inn ennå.",
  goalText: "Her kan prosjektets aktive delmål vises",
  startedAt: null
};
let _unsubs = [];
let _currentProjectId = null;

function stopAll() { _unsubs.forEach(u => u()); _unsubs = []; }

/* =========================================================
   START LIVE ANALYTICS
========================================================= */
function startLiveAnalytics(projectId) {
  stopAll();
  _currentProjectId = projectId;

  _state = {
    allFiles: [], messagesCount: 0, totalFiles: 0,
    daysUsed: 0, progressPct: 0,
    weekDescription: "Ingen ukesnotat lagt inn ennå.",
    goalText: "Her kan prosjektets aktive delmål vises",
    startedAt: null
  };

  showLoading();

  /* ---- 1. PROSJEKTDOKUMENT (live) ---- */
  _unsubs.push(onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();

        // Progress
        if (typeof d.manualProgress === "number") {
          _state.progressPct = Math.min(100, Math.max(0, d.manualProgress));
        }

        // startedAt + durationDays → dager brukt
        if (d.startedAt) {
          _state.startedAt = d.startedAt.toDate();
          _state.daysUsed  = Math.max(0,
            Math.floor((Date.now() - _state.startedAt.getTime()) / 86400000)
          );
          if (!d.manualProgress && d.durationDays) {
            _state.progressPct = Math.min(100,
              Math.round((_state.daysUsed / d.durationDays) * 100)
            );
          }
        }

        if (d.weekNote)  _state.weekDescription = d.weekNote;
        if (d.goalText)  _state.goalText         = d.goalText;
      } else {
        // Dokument finnes ikke — opprett det automatisk med defaults
        setDoc(doc(db, "projects", projectId), {
          manualProgress: 0,
          weekNote:       "Ingen ukesnotat lagt inn ennå.",
          goalText:       "Her kan prosjektets aktive delmål vises",
          startedAt:      serverTimestamp(),
          durationDays:   90,
          createdAt:      serverTimestamp()
        }).catch(e => console.warn("Kunne ikke opprette prosjekt:", e));
      }

      // Oppdater delmål i hero
      const goalEl = document.getElementById("projectGoal");
      if (goalEl) goalEl.textContent = _state.goalText;

      renderWidget();
    },
    (err) => { console.warn("Project listener:", err.code); renderWidget(); }
  ));

  /* ---- 2. FILER (live, filtrer dato i JS) ---- */
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      _state.totalFiles = snap.size;
      _state.allFiles   = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.createdAt?.toDate) {
          if (data.createdAt.toDate().getTime() >= weekStart)
            _state.allFiles.push(data);
        }
      });
      renderWidget();
    },
    (err) => { console.warn("Files listener:", err.code); renderWidget(); }
  ));

  /* ---- 3. MELDINGER (live, filtrer dato i JS) ---- */
  _unsubs.push(onSnapshot(
    query(collection(db, "messages"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let count = 0;
      snap.forEach(d => {
        const data = d.data();
        const t = data.createdAt?.toDate?.()?.getTime?.() ?? Date.now();
        if (t >= weekStart) count++;
      });
      _state.messagesCount = count;
      renderWidget();
    },
    (err) => { console.warn("Messages listener:", err.code); }
  ));
}

/* =========================================================
   SVG LINJEGRAF — alltid 7 dager
========================================================= */
function buildChart(allFiles) {
  const perDay = Array(7).fill(0);
  allFiles.forEach(f => {
    if (!f.createdAt?.toDate) return;
    perDay[jsToIdx(f.createdAt.toDate().getDay())]++;
  });

  const cumul = perDay.reduce((acc, v) => {
    acc.push((acc[acc.length - 1] || 0) + v);
    return acc;
  }, []);

  const today  = todayIdx();
  const W = 300, H = 130;
  const PAD = { top: 14, right: 16, bottom: 30, left: 30 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;
  const maxVal = Math.max(...cumul, 1);
  const xPos = i => PAD.left + (i / 6) * iW;
  const yPos = v => PAD.top + iH - (v / maxVal) * iH;

  const yTicks = [0, Math.ceil(maxVal / 2), maxVal];
  const grid = yTicks.map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}"
          x2="${PAD.left+iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left-6}" y="${(yPos(v)+4).toFixed(1)}"
          text-anchor="end" font-size="9" fill="rgba(255,255,255,0.40)">${v}</text>
  `).join("");

  const xLabels = DAY_LABELS.map((lbl, i) => `
    <text x="${xPos(i).toFixed(1)}" y="${(H-5).toFixed(1)}" text-anchor="middle"
          font-size="9"
          fill="${i <= today ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.25)'}"
          font-weight="${i === today ? '700' : '400'}">${lbl}</text>
  `).join("");

  const pts = cumul.slice(0, today + 1).map((v, i) =>
    `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`
  );

  const line = pts.length > 1 ? `M ${pts.join(" L ")}` : `M ${pts[0]}`;
  const area = `M ${xPos(0).toFixed(1)},${(PAD.top+iH).toFixed(1)} `
    + `L ${pts.join(" L ")} `
    + `L ${xPos(today).toFixed(1)},${(PAD.top+iH).toFixed(1)} Z`;

  const future = today < 6
    ? `<line x1="${xPos(today).toFixed(1)}" y1="${yPos(cumul[today]).toFixed(1)}"
             x2="${xPos(6).toFixed(1)}"      y2="${yPos(cumul[today]).toFixed(1)}"
             stroke="rgba(147,197,253,0.20)" stroke-width="1.5" stroke-dasharray="4,4"/>`
    : "";

  const dots = cumul.slice(0, today + 1).map((v, i) => `
    <circle cx="${xPos(i).toFixed(1)}" cy="${yPos(v).toFixed(1)}"
            r="${i === today ? 4.5 : 3.5}"
            fill="${i === today ? '#60a5fa' : '#93c5fd'}"
            stroke="rgba(255,255,255,0.90)" stroke-width="1.5"/>
  `).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:auto;display:block;overflow:visible">
      <defs>
        <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="rgba(96,165,250,0.35)"/>
          <stop offset="100%" stop-color="rgba(96,165,250,0.00)"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#aG)"/>
      <path d="${line}" fill="none" stroke="#60a5fa" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      ${future}${dots}${xLabels}
    </svg>`;
}

/* =========================================================
   RENDER WIDGET
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

function renderWidget() {
  const container = document.getElementById("weekPlaceholder");
  if (!container) return;

  const { allFiles, messagesCount, totalFiles, daysUsed, progressPct, weekDescription } = _state;
  const pct = progressPct || 0;

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

      <div class="analytics-stats">
        <div class="stat-card">
          <span class="stat-number">${allFiles.length}</span>
          <span class="stat-label">Filer denne uken</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${messagesCount}</span>
          <span class="stat-label">Meldinger denne uken</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${totalFiles}</span>
          <span class="stat-label">Filer totalt</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${daysUsed}</span>
          <span class="stat-label">Dager brukt</span>
        </div>
      </div>

      <div class="analytics-chart-wrap">
        <div class="analytics-chart-title">Filer lastet opp – denne uken</div>
        <div class="analytics-chart-inner">${buildChart(allFiles)}</div>
        <p class="analytics-chart-sub">Oppdateres i sanntid</p>
      </div>

    </div>`;

  animateBar("innerBar", pct);
  animateBar("heroProgressBar", pct);
  const heroPctEl = document.getElementById("heroProgressPct");
  if (heroPctEl) heroPctEl.textContent = pct + "%";
}

/* =========================================================
   ADMIN MODAL – rediger prosjekt direkte fra portalen
========================================================= */
function openAdminModal() {
  const existing = document.getElementById("adminModal");
  if (existing) { existing.remove(); return; }

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
             value="90" placeholder="90" min="1"/>

      <div class="admin-actions">
        <button id="adminSave" class="admin-btn primary">Lagre til Firebase</button>
        <button id="adminClose" class="admin-btn">Avbryt</button>
      </div>
      <p id="adminStatus" class="admin-status"></p>
    </div>`;

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
    const goalText   = document.getElementById("adminGoal").value.trim();
    const weekNote   = document.getElementById("adminNote").value.trim();
    const pct        = parseInt(document.getElementById("adminPct").value, 10);
    const startStr   = document.getElementById("adminStart").value;
    const duration   = parseInt(document.getElementById("adminDuration").value, 10);
    const statusEl   = document.getElementById("adminStatus");

    if (!_currentProjectId) {
      statusEl.textContent = "Ingen prosjekt valgt.";
      return;
    }

    statusEl.textContent = "Lagrer…";
    try {
      await setDoc(doc(db, "projects", _currentProjectId), {
        goalText,
        weekNote:       weekNote || "Ingen ukesnotat lagt inn ennå.",
        manualProgress: pct,
        startedAt:      startStr ? Timestamp.fromDate(new Date(startStr)) : serverTimestamp(),
        durationDays:   isNaN(duration) ? 90 : duration,
        updatedAt:      serverTimestamp()
      }, { merge: true });

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
    if (e.detail?.projectId) startLiveAnalytics(e.detail.projectId);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics);
} else {
  initAnalytics();
}