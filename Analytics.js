// ============================================================
// Analytics.js – Ansattportal
// Ansvarlig: Gruppemedlem
//
// Denne filen håndterer all analyse og fremdriftsvisning
// for ansattportalen. Den lytter på sanntidsdata fra Firestore
// og bygger opp et interaktivt dashboard med:
//   – Milepæl-liste og oppgavefremdrift
//   – SVG-graf over prosjektfremgang over tid
//   – Varsler og risikoindikatorer
//   – Admin-modal for redigering av prosjekt og milepæler
// ============================================================

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

// Firebase-konfigurasjon – kobler til Noragentic sitt Firebase-prosjekt
const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  databaseURL: "https://noragenticportal-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151"
};

// Initialiserer Firebase kun én gang selv om modulen lastes på nytt
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* =========================================================
   HJELPEFUNKSJONER
   – Gjenbrukbare funksjoner for dato og tid
========================================================= */

// Returnerer mandagen i inneværende uke (kl. 00:00:00)
// Brukes til å filtrere data som er "denne uken"
function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Konverterer en JavaScript Date til ukedags-indeks (0=Man, 6=Søn)
// Brukes til å telle filer per ukedag for aktivitetsstatistikk
function getWeekDayIndexFromDate(date) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

// Genererer en nøkkel på formatet "YYYY-MM-DD" for dagens dato
// Brukes som dokument-ID i Firestore for daglige progress-snapshots
function getTodayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

// Formaterer en Firestore Timestamp eller vanlig Date til norsk datoformat (DD.MM.YYYY)
function formatDateNo(dateLike) {
  if (!dateLike) return "Ikke satt";
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("no-NO");
}

// Kortformat for datoer på x-aksen i grafen, f.eks. "29.4"
function fmtD(date) {
  if (!date) return "";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return `${d.getDate()}.${d.getMonth()+1}`;
}

// Beregner antall dager siden en gitt dato
// Brukes i varsler, f.eks. "Ingen nye filer de siste 7 dagene"
function daysSince(dateLike) {
  if (!dateLike) return null;
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

// Henter fullføringstidspunktet til en oppgave (task)
// completedAt settes i tasks.js når ansatt krysser av en oppgave
function getTaskCompletedDate(task) {
  return task.completedAt?.toDate?.() || task.completedAt || null;
}

/* =========================================================
   GLOBAL STATE
   – Ett sentralt objekt holder all data for dashboardet.
   – Oppdateres av Firestore-lyttere og brukes av renderWidget()
========================================================= */
let _state = {
  progressPct:      0,       // Prosent fullførte milepæler (beregnes automatisk)
  goalText:         "Her kan prosjektets aktive delmål vises",
  startedAt:        null,    // Prosjektets startdato (Firestore Timestamp → Date)
  daysUsed:         0,       // Antall dager siden prosjektstart
  durationDays:     90,      // Planlagt total varighet i dager
  daysLeft:         90,      // Gjenstående dager (durationDays - daysUsed)
  totalFiles:       0,       // Totalt antall filer på prosjektet
  filesThisWeek:    0,       // Filer lastet opp denne uken
  messagesCount:    0,       // Meldinger sendt denne uken
  weeklyFileCounts: [0,0,0,0,0,0,0], // Filer per ukedag (Man–Søn)
  milestones:          [],   // Array av milepæl-objekter fra Firestore
  milestonesDone:      0,    // Antall fullførte milepæler
  milestonesTotal:     0,    // Totalt antall milepæler
  currentMilestone:    "Ikke satt", // Tittel på første ikke-fullførte milepæl
  nextMilestoneDate:   null, // Dato for neste milepæl (brukes til risikoberegning)
  milestoneRisk:       "low",        // Risikonivå: "low", "medium" eller "high"
  milestoneRiskLabel:  "Lav risiko", // Tekstlig beskrivelse av risiko
  tasksByMilestone:    {},   // Oppgaver gruppert per milepæl-ID: { msId: { total, done, tasks[] } }
  latestFileAt:     null,    // Dato for siste filopplasting (for varsler)
  latestMessageAt:  null,    // Dato for siste melding (for varsler)
  latestProgressAt: null,    // Dato for siste oppdatering av prosjektdokumentet
  activityLabel:    "Lav aktivitet", // Tekstlig aktivitetsnivå
  activityTone:     "low",           // Fargetone for aktivitetsvisning
  summaryText:      "Ingen oppsummering tilgjengelig.", // Autogenerert prosjekttekst
  alerts:           []               // Liste med aktive varselmeldinger
};

// Referanser for å kunne stoppe lyttere og huske valgt tilstand
let _unsubs            = [];    // Lagrer unsubscribe-funksjoner for Firestore-lyttere
let _currentProjectId  = null;  // ID på prosjektet som vises nå
let _lastAutoSnapshotKey = null; // Dato for siste auto-snapshot (forhindrer dobbelskriving)
let _selectedChartMs   = null;  // Valgt milepæl i graf-dropdown (null = total fremgang)

// Stopper alle aktive Firestore-lyttere (kalles ved prosjektbytte)
function stopAll() { _unsubs.forEach(u => u()); _unsubs = []; }

/* =========================================================
   DERIVED STATE – BEREGN AUTOMATISK
   Kalles etter hver Firestore-oppdatering for å holde
   _state konsistent og oppdatert.
========================================================= */
function recomputeDerivedState() {
  // Beregn gjenstående dager
  _state.daysLeft = Math.max(0, (_state.durationDays || 0) - (_state.daysUsed || 0));

  const milestones = Array.isArray(_state.milestones) ? _state.milestones : [];
  const total      = milestones.length;
  const done       = milestones.filter(m => m.done).length;

  // Oppdater teller og prosent basert på antall fullførte milepæler
  _state.milestonesTotal = total;
  _state.milestonesDone  = done;
  _state.progressPct     = total > 0 ? Math.round((done / total) * 100) : 0;

  // Finn neste ufullendte milepæl (brukes i hero og milepæl-kortet)
  const next = milestones.find(m => !m.done);
  _state.currentMilestone  = next?.title || (total > 0 ? "Alle milepæler fullført ✓" : "Ingen milepæler");
  _state.nextMilestoneDate = next?.date  || null;

  // Beregn dager til neste milepæl (negativt tall = overskredet)
  let daysToNext = null;
  if (_state.nextMilestoneDate) {
    const mDate = _state.nextMilestoneDate?.toDate
      ? _state.nextMilestoneDate.toDate()
      : new Date(_state.nextMilestoneDate);
    daysToNext = Math.ceil((mDate.getTime() - Date.now()) / 86400000);
  }

  const pct = _state.progressPct;

  // Risikovurdering basert på tid til neste milepæl og gjeldende fremdrift
  if (done === total && total > 0) {
    _state.milestoneRisk = "low";    _state.milestoneRiskLabel = "Alle milepæler fullført ✓";
  } else if (daysToNext !== null && daysToNext <= 0) {
    _state.milestoneRisk = "high";   _state.milestoneRiskLabel = "Milepæl overskredet!";
  } else if (daysToNext !== null && daysToNext <= 7 && pct < 75) {
    _state.milestoneRisk = "high";   _state.milestoneRiskLabel = "Høy risiko";
  } else if (daysToNext !== null && daysToNext <= 14 && pct < 50) {
    _state.milestoneRisk = "medium"; _state.milestoneRiskLabel = "Moderat risiko";
  } else {
    _state.milestoneRisk = "low";    _state.milestoneRiskLabel = "Lav risiko";
  }

  // Aktivitetsnivå basert på antall filer og meldinger denne uken
  const filesThisWeek    = _state.filesThisWeek  || 0;
  const messagesThisWeek = _state.messagesCount   || 0;
  const activityScore    = filesThisWeek + messagesThisWeek;

  if (activityScore >= 8)      { _state.activityLabel = "Høy aktivitet";     _state.activityTone = "high"; }
  else if (activityScore >= 3) { _state.activityLabel = "Moderat aktivitet"; _state.activityTone = "medium"; }
  else                         { _state.activityLabel = "Lav aktivitet";     _state.activityTone = "low"; }

  // Generer varsler basert på tilstand
  const alerts = [];
  if (messagesThisWeek === 0) alerts.push("Ingen nye meldinger denne uken.");
  if (filesThisWeek    === 0) alerts.push("Ingen nye filer denne uken.");

  // Varsel hvis faktisk fremdrift er mer enn 10% bak forventet fremdrift basert på tid
  const expectedPct = _state.durationDays > 0
    ? Math.round((_state.daysUsed / _state.durationDays) * 100) : 0;
  if (pct + 10 < expectedPct) alerts.push("Fremdriften ligger bak forventet nivå basert på tidsbruk.");

  if (_state.milestoneRisk === "high" && done < total)
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);
  else if (_state.milestoneRisk === "medium")
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);

  // Varsler for lang inaktivitet (7+ dager uten filer, meldinger eller oppdateringer)
  const noFilesDays    = daysSince(_state.latestFileAt);
  const noMsgDays      = daysSince(_state.latestMessageAt);
  const noProgressDays = daysSince(_state.latestProgressAt);
  if (noFilesDays    !== null && noFilesDays    >= 7) alerts.push(`Ingen nye filer de siste ${noFilesDays} dagene.`);
  if (noMsgDays      !== null && noMsgDays      >= 7) alerts.push(`Ingen meldinger de siste ${noMsgDays} dagene.`);
  if (noProgressDays !== null && noProgressDays >= 7) alerts.push(`Milepæler ikke oppdatert på ${noProgressDays} dager.`);

  _state.alerts = alerts;

  // Autogenerer en oppsummeringstekst som vises øverst i dashboardet
  _state.summaryText = [
    `Prosjektet er ${pct}% ferdig (${done} av ${total} milepæler fullført).`,
    `${_state.daysUsed} dager er brukt og ${_state.daysLeft} dager gjenstår.`,
    `Aktivitetsnivået denne uken er ${_state.activityLabel.toLowerCase()}.`,
    filesThisWeek > 0 ? `${filesThisWeek} nye filer lastet opp.` : ""
  ].filter(Boolean).join(" ");
}

/* =========================================================
   LIVE-LYTTERE – FIRESTORE SANNTIDSDATA
   Starter fire parallelle onSnapshot-lyttere som holder
   dashboardet oppdatert uten sideoppdatering.
   Kalles ved prosjektvalg og prosjektbytte.
========================================================= */
function startLiveAnalytics(projectId) {
  stopAll();                    // Stopp lyttere fra forrige prosjekt
  _currentProjectId = projectId;
  _selectedChartMs  = null;    // Nullstill graf-valg ved prosjektbytte

  // Nullstill state slik at gammelt innhold ikke henger igjen
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

  showLoading(); // Vis spinner mens data lastes

  /* ---- Lytter 1: Prosjektdokument ----
     Henter grunndata: startdato, varighet, milepæler og delmål.
     Oppdaterer hero-seksjonen og lagrer daglig progress-snapshot. */
  _unsubs.push(onSnapshot(doc(db, "projects", projectId), (snap) => {
    if (snap.exists()) {
      const d = snap.data();

      // Beregn antall dager siden prosjektstart
      if (d.startedAt?.toDate) {
        _state.startedAt = d.startedAt.toDate();
        _state.daysUsed  = Math.max(0, Math.floor((Date.now() - _state.startedAt.getTime()) / 86400000));
      }
      if (typeof d.durationDays === "number") _state.durationDays = d.durationDays;
      if (d.goalText) _state.goalText = d.goalText;

      // Milepæler lagres som en array i Firestore: [{id, title, done, date}]
      _state.milestones       = Array.isArray(d.milestones) ? d.milestones : [];
      _state.latestProgressAt = d.updatedAt?.toDate?.() || d.createdAt?.toDate?.() || null;
    }

    recomputeDerivedState();

    // Oppdater hero med "X av Y fullført" istedet for delmål-tekst
    const goalEl = document.getElementById("projectGoal");
    if (goalEl) goalEl.textContent = `${_state.milestonesDone} av ${_state.milestonesTotal} fullført`;

    // Lagre dagens progress-% til Firestore én gang per dag.
    // Disse snapshotene brukes til å vise historisk fremgang i grafen.
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
  }, (err) => { console.warn("Project:", err.code); recomputeDerivedState(); renderWidget(); }));

  /* ---- Lytter 2: Filer ----
     Teller filer lastet opp denne uken og registrerer
     hvilken ukedag de ble lastet opp (for aktivitetsstatistikk).
     Filtrering skjer lokalt i JS for å unngå Firestore compound index. */
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart        = getWeekStart().getTime();
      let filesThisWeek      = 0;
      let latestFileAt       = null;
      const weeklyFileCounts = [0,0,0,0,0,0,0];

      snap.forEach(d => {
        const data     = d.data();
        // Støtter flere mulige datofelter siden ulike opplastinger bruker ulik feltnavngiving
        const fileDate = data.createdAt?.toDate?.()    ||
                         data.dateUploaded?.toDate?.() ||
                         (data.createdAt?.seconds   ? new Date(data.createdAt.seconds * 1000)   : null) ||
                         (data.dateUploaded?.seconds ? new Date(data.dateUploaded.seconds * 1000) : null) || null;
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
    }, (err) => { console.warn("Files:", err.code); }
  ));

  /* ---- Lytter 3: Meldinger ----
     Teller meldinger sendt i prosjektchatten denne uken.
     Brukes i aktivitetsnivå og oppsummeringstekst. */
  _unsubs.push(onSnapshot(
    query(collection(db, "messages"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let count = 0, latestMessageAt = null;

      snap.forEach(d => {
        const data    = d.data();
        // Støtter både Firestore Timestamp (createdAt) og RTDB-format (time)
        const msgDate = data.createdAt?.toDate?.() || (data.time ? new Date(data.time) : null) || null;
        if (msgDate) {
          if (msgDate.getTime() >= weekStart) count++;
          if (!latestMessageAt || msgDate > latestMessageAt) latestMessageAt = msgDate;
        }
      });

      _state.messagesCount   = count;
      _state.latestMessageAt = latestMessageAt;
      recomputeDerivedState();
      renderWidget();
    }, (err) => { console.warn("Messages:", err.code); }
  ));

  /* ---- Lytter 4: Oppgaver (tasks) ----
     Henter alle oppgaver for prosjektet og grupperer dem per milepæl.
     completedAt brukes til å vise ekte historisk fremdrift i grafen
     når en spesifikk milepæl er valgt i dropdown. */
  _unsubs.push(onSnapshot(
    collection(db, "projects", projectId, "tasks"),
    (snap) => {
      const byMs = {};
      snap.forEach(d => {
        const t  = d.data();
        // Oppgaven kobles til milepæl via delmalId (satt i tasks.js ved opprettelse)
        const id = t.delmalId || t.milestoneId || "ukjent";
        if (!byMs[id]) byMs[id] = { total: 0, done: 0, tasks: [] };
        const completedAt = getTaskCompletedDate(t);
        byMs[id].total++;
        if (t.done) byMs[id].done++;
        byMs[id].tasks.push({
          id: d.id,
          title: t.title || t.name || "Oppgave",
          done: !!t.done,
          completedAt  // Tidspunkt for fullføring (satt i tasks.js med serverTimestamp)
        });
      });
      _state.tasksByMilestone = byMs;
      renderWidget();
    }, (err) => { console.warn("Tasks:", err.code); }
  ));
}

/* =========================================================
   SVG GRAF – FREMDRIFTSVISUALISERING
   Bygger en SVG-linjegraf som enten viser:
   a) Total prosjektfremgang basert på milepæl-fullføringsdatoer (blå)
   b) Oppgavefremdrift for valgt milepæl basert på completedAt (grønn)

   Grafen bruker smooth bezier-kurver og har tegne-animasjon
   (stroke-dashoffset) som tegner linjen inn fra venstre.
========================================================= */
function buildProgressChart(msId) {
  const milestones = _state.milestones || [];
  const total      = milestones.length;
  let points    = [];
  let lineColor = "#60a5fa"; // Blå for total fremgang
  let gradStart = "rgba(96,165,250,0.40)";

  if (!msId) {
    // === TOTAL FREMGANG ===
    // Henter fullførte milepæler med datoer og sorterer kronologisk.
    // Hvert punkt på x-aksen er datoen en milepæl ble fullført.
    const doneWithDates = milestones
      .filter(m => m.done && m.date)
      .map(m => ({ date: m.date?.toDate ? m.date.toDate() : new Date(m.date), title: m.title }))
      .sort((a, b) => a.date - b.date);

    const today      = new Date();
    const currentPct = total > 0 ? Math.round((_state.milestonesDone / total) * 100) : 0;

    if (doneWithDates.length > 0) {
      // Startpunktet settes dagen før første milepæl på 0%
      const start = new Date(doneWithDates[0].date);
      start.setDate(start.getDate() - 1);
      points.push({ pct: 0, label: fmtD(start) });

      // Hvert fullført milepæl gir et steg opp i prosent
      doneWithDates.forEach((m, idx) => {
        points.push({ pct: Math.round(((idx+1) / total) * 100), label: fmtD(m.date), title: m.title });
      });
    } else {
      points.push({ pct: 0, label: "Start" });
    }
    // "I dag" er alltid siste punkt med live-prosent
    if (points[points.length-1].label !== fmtD(today))
      points.push({ pct: currentPct, label: "I dag", isToday: true });
    else points[points.length-1].isToday = true;

  } else {
    // === PER MILEPÆL – EKTE TASK-HISTORIKK ===
    // Bruker completedAt på hver task for å vise når oppgavene faktisk
    // ble fullført. Dette gir en realistisk kurve som varierer per milepæl.
    const taskGroup = _state.tasksByMilestone?.[msId] || { total: 0, done: 0, tasks: [] };
    const tasks     = taskGroup.tasks || [];
    const taskTotal = taskGroup.total || 0;

    if (taskTotal === 0) {
      return `<div style="padding:28px 0;text-align:center;color:rgba(255,255,255,0.55);font-size:13px">
        Ingen oppgaver registrert for denne milepælen ennå.</div>`;
    }

    const today     = new Date();
    // Startdato er prosjektstart, eller fallback til 20 dager siden
    const startDate = _state.startedAt
      ? new Date(_state.startedAt)
      : new Date(today.getTime() - Math.max(10, _state.daysUsed || 20) * 86400000);
    startDate.setDate(startDate.getDate() - 1);

    // Generer 10 jevnt fordelte datopunkter fra start til i dag
    const POINTS = 10;
    const dates  = Array.from({ length: POINTS }, (_, i) => {
      const d = new Date(startDate);
      const distanceDays = Math.max(1, Math.round((today - startDate) / 86400000));
      d.setDate(startDate.getDate() + Math.round((i / (POINTS-1)) * distanceDays));
      return d;
    });

    // For hvert datopunkt: tell hvor mange tasks var fullført innen den datoen
    points = dates.map((datePoint, i) => {
      const isLast    = i === POINTS - 1;
      const doneByDate = tasks.filter(t => {
        if (!t.done) return false;
        const completedAt = t.completedAt
          ? (t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt))
          : null;
        // Tasks uten completedAt (eldre data) telles kun på siste punkt
        if (!completedAt || Number.isNaN(completedAt.getTime())) return isLast;
        return completedAt <= datePoint;
      }).length;

      return {
        pct:     Math.round((doneByDate / taskTotal) * 100),
        label:   isLast ? "I dag" : fmtD(datePoint),
        isToday: isLast
      };
    });

    lineColor = "#4ade80"; // Grønn for per-milepæl visning
    gradStart = "rgba(74,222,128,0.40)";
  }

  /* ---- SVG-RENDERING ---- */
  const n = points.length;
  const W = 300, H = 130;
  const PAD = { top: 14, right: 16, bottom: 30, left: 40 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;

  // Funksjoner for å konvertere dataverdier til SVG-koordinater
  const xPos = i => PAD.left + (n === 1 ? iW/2 : (i/(n-1)) * iW);
  const yPos = v => PAD.top  + iH - (v/100) * iH;

  const pts = points.map((p, i) => ({ x: xPos(i), y: yPos(p.pct) }));

  // Smooth bezier-kurve: i stedet for rette linjer brukes kubiske
  // Bezier-kurver med kontrollpunkter midtveis mellom naboer.
  // Dette gir en mykere, mer profesjonell kurveform.
  function smoothPath(pts) {
    if (pts.length < 2) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i-1], p1 = pts[i];
      const cpX = ((p0.x + p1.x)/2).toFixed(1); // Kontrollpunkt midtveis
      d += ` C ${cpX},${p0.y.toFixed(1)} ${cpX},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    return d;
  }

  const linePath = smoothPath(pts);

  // Areal under kurven (fylt gradient-felt)
  const areaPath = pts.length > 1
    ? `M ${pts[0].x.toFixed(1)},${(PAD.top+iH).toFixed(1)} ` + linePath.replace(/^M[^C]+/, "") +
      ` L ${pts[pts.length-1].x.toFixed(1)},${(PAD.top+iH).toFixed(1)} Z` : "";

  // Beregn total linjelengde for stroke-dashoffset animasjon.
  // Animasjonen starter med hele linjen "skjult" og avslører den gradvis.
  const totalLen = Math.round(pts.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const dx = p.x - pts[i-1].x, dy = p.y - pts[i-1].y;
    return sum + Math.sqrt(dx*dx + dy*dy);
  }, 0)) + 50;

  // Horisontale rutenettlinjer og y-akse labels
  const grid = [0,25,50,75,100].map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}" x2="${PAD.left+iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left-5}" y="${(yPos(v)+4).toFixed(1)}" text-anchor="end" font-size="8"
          fill="rgba(255,255,255,0.40)">${v}%</text>`).join("");

  // X-akse datoetiketter – "I dag" vises i uthevet stil
  const xLabels = points.map((p, i) => `
    <text x="${xPos(i).toFixed(1)}" y="${(H-5).toFixed(1)}" text-anchor="middle" font-size="8"
          fill="${p.isToday ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.60)'}"
          font-weight="${p.isToday ? '700' : '400'}">${p.label}</text>`).join("");

  // Datapunkter – "I dag"-punktet har pulserende ring for å vise live-data
  const dots = points.map((p, i) => `
    <circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}"
            r="${p.isToday ? 5 : 3.5}"
            fill="${p.isToday ? lineColor : (msId ? '#86efac' : '#93c5fd')}"
            stroke="rgba(255,255,255,0.90)" stroke-width="1.5">
      <title>${p.label}: ${p.pct}%${p.title ? ` – ${p.title}` : ""}</title>
    </circle>
    ${p.isToday ? `<circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}"
      r="8" fill="none" stroke="${lineColor}" stroke-width="1" opacity="0.4">
      <animate attributeName="r" values="5;10;5" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
    </circle>` : ""}
  `).join("");

  const gradId = msId ? "msGradGreen" : "msGradBlue";

  // Returnerer komplett SVG med gradient, animert linje og pulserende punkt
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
       style="width:100%;height:auto;display:block;overflow:visible">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${gradStart}"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient></defs>
    ${grid}
    ${areaPath ? `<path d="${areaPath}" fill="url(#${gradId})" opacity="0">
      <animate attributeName="opacity" from="0" to="1" dur="0.8s" fill="freeze" begin="0.3s"/>
    </path>` : ""}
    <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round"
          stroke-dasharray="${totalLen}" stroke-dashoffset="${totalLen}">
      <animate attributeName="stroke-dashoffset" from="${totalLen}" to="0" dur="1.2s" fill="freeze"/>
    </path>
    ${dots}${xLabels}
  </svg>`;
}

/* =========================================================
   RENDER HELPERS – ENKLE UI-FUNKSJONER
========================================================= */

// Viser lasteindikator mens data hentes fra Firestore
function showLoading() {
  const c = document.getElementById("weekPlaceholder");
  if (c) c.innerHTML = `
    <div class="analytics-loading">
      <div class="analytics-spinner"></div>
      <span>Kobler til database…</span>
    </div>`;
}

// Animerer en progress-bar til en gitt bredde (prosent)
// Bruker dobbel requestAnimationFrame for å sikre at CSS-transisjonen kjører
function animateBar(id, pct) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + "%";
  }));
}

/* =========================================================
   RENDER WIDGET – HOVED-DASHBOARD
   Genererer all HTML for analysepanelet og setter det inn
   i #weekPlaceholder. Kalles etter hver Firestore-oppdatering.
   Alle data leses fra det globale _state-objektet.
========================================================= */
function renderWidget() {
  const container = document.getElementById("weekPlaceholder");
  if (!container) return;

  // Destrukturerer relevante verdier fra state for enklere bruk i templaten
  const { progressPct, daysUsed, daysLeft, milestones, milestonesDone,
          milestonesTotal, nextMilestoneDate, milestoneRisk, milestoneRiskLabel,
          activityLabel, activityTone, summaryText, alerts } = _state;
  const pct = progressPct || 0;

  // Finn aktiv milepæl og tilhørende oppgavedata for grønn task-bar
  const activeMilestone = milestones.find(m => !m.done);
  const activeTasks     = activeMilestone
    ? (_state.tasksByMilestone?.[activeMilestone.id] || { total: 0, done: 0, tasks: [] })
    : { total: 0, done: 0, tasks: [] };
  const activeTaskPct = activeTasks.total > 0
    ? Math.round((activeTasks.done / activeTasks.total) * 100) : 0;

  // Grønn task-bar vises kun når det finnes en aktiv (ikke-fullført) milepæl
  const activeTaskBar = activeMilestone ? `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;
                  color:rgba(255,255,255,0.55);margin-bottom:5px">
        <span>Oppgaver i <strong style="color:rgba(255,255,255,0.85)">${activeMilestone.title}</strong></span>
        <span>${activeTasks.done} / ${activeTasks.total} (${activeTaskPct}%)</span>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:999px;height:10px;overflow:hidden">
        <div style="width:${activeTaskPct}%;height:100%;
                    background:linear-gradient(90deg,rgba(74,222,128,0.90),rgba(134,239,172,0.95));
                    border-radius:999px;transition:width 0.7s ease;
                    box-shadow:0 0 10px rgba(74,222,128,0.45)"></div>
      </div>
    </div>` : "";

  // Generer milepæl-liste – fullførte vises med grønt ✓ og gjennomstreking
  const milestonesHtml = milestones.length > 0
    ? milestones.map((m, i) => `
        <div class="milestone-row ${m.done ? 'done' : ''}">
          <span class="milestone-check">${m.done ? '✓' : '○'}</span>
          <span class="milestone-title">${m.title || `Milepæl ${i+1}`}</span>
          ${m.date ? `<span class="milestone-date">${formatDateNo(m.date)}</span>` : ""}
        </div>`).join("")
    : `<div style="font-size:12px;color:rgba(255,255,255,0.45)">Ingen milepæler lagt inn ennå. Trykk Rediger for å legge til.</div>`;

  // Generer varsler – grønn "ingen varsler"-melding hvis listen er tom
  const alertsHtml = alerts.length
    ? alerts.map(a => `<div class="analytics-alert-item">${a}</div>`).join("")
    : `<div class="analytics-alert-item ok">Ingen varsler akkurat nå. Fremdrift og aktivitet ser stabile ut.</div>`;

  // Husk valgt milepæl i dropdown mellom re-rendringer
  const selectedMs      = _selectedChartMs;
  const selectedMsTitle = selectedMs ? milestones.find(m => m.id === selectedMs)?.title || "" : "";

  // Sett inn hele dashboard-HTML i én operasjon
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
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Nåværende milepæl</div>
          ${activeMilestone ? `
            <div class="analytics-mini-big">${activeMilestone.title}</div>
            <div class="analytics-mini-meta">${activeTasks.done} / ${activeTasks.total} oppgaver fullført</div>
            <div class="analytics-mini-meta">${activeTaskPct}% av milepælen</div>
          ` : `
            <div class="analytics-mini-big">Alle fullført ✓</div>
            <div class="analytics-mini-meta">${milestonesTotal} av ${milestonesTotal} milepæler er fullført</div>
            <div class="analytics-mini-meta">Prosjektet er ferdig</div>
          `}
        </div>
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Risiko</div>
          <div class="analytics-mini-big">${milestoneRiskLabel}</div>
          <div class="analytics-mini-meta">Neste: ${formatDateNo(nextMilestoneDate)}</div>
          <div class="analytics-mini-meta">${activityLabel}</div>
        </div>
      </div>

      ${activeTaskBar}
      <div class="analytics-milestone-box" style="margin-top:0">
        <div class="analytics-milestone-title" style="margin-bottom:8px">Milepæler (${milestonesDone}/${milestonesTotal})</div>
        <div class="analytics-milestone-list">${milestonesHtml}</div>
      </div>

      <div class="analytics-chart-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="analytics-chart-title" id="chartTitle">
            ${selectedMs ? `Oppgaver – ${selectedMsTitle}` : "Milepæl-fremgang over tid"}
          </div>
          <select id="chartMsSelect" style="font-size:11px;font-weight:600;padding:4px 8px;border-radius:8px;
            border:1px solid rgba(96,165,250,0.45);background:#1a2540;color:rgba(255,255,255,0.90);
            outline:none;cursor:pointer;max-width:150px">
            <option value="" style="background:#1a2540" ${!selectedMs ? "selected" : ""}>Total fremgang</option>
            ${milestones.map(m => `
              <option value="${m.id}" style="background:#1a2540;color:#fff" ${selectedMs === m.id ? "selected" : ""}>
                ${m.done ? "✓" : "○"} ${m.title}
              </option>`).join("")}
          </select>
        </div>
        <div class="analytics-chart-inner" id="chartInner">${buildProgressChart(selectedMs)}</div>
        <p class="analytics-chart-sub" id="chartSub">
          ${selectedMs
            ? `Viser ekte oppgavefremdrift for "${selectedMsTitle}" basert på fullføringstidspunkt`
            : "Blå linje viser total prosjektfremgang – stiger når en milepæl fullføres"}
        </p>
      </div>

      <div class="analytics-alert-box">
        <div class="analytics-alert-title">Varsler og risiko</div>
        <div class="analytics-alert-list">${alertsHtml}</div>
      </div>

      <div class="analytics-footer-stats">
        <span>Neste milepæl: <strong>${activeMilestone
          ? `${activeMilestone.title} – ${formatDateNo(activeMilestone.date)}`
          : "Alle milepæler fullført ✓"}</strong></span>
      </div>

    </div>`;

  // Animer hero-bar og prosent-badge til riktig verdi
  animateBar("heroProgressBar", pct);
  const heroPctEl = document.getElementById("heroProgressPct");
  if (heroPctEl) heroPctEl.textContent = pct + "%";

  // Koble opp graf-dropdown etter at HTML er satt inn i DOM.
  // Bytter mellom total fremgang og per-milepæl uten full re-render.
  const sel = document.getElementById("chartMsSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      _selectedChartMs = sel.value || null;
      const inner = document.getElementById("chartInner");
      const title = document.getElementById("chartTitle");
      const sub   = document.getElementById("chartSub");
      const ms    = _selectedChartMs ? milestones.find(m => m.id === _selectedChartMs) : null;
      if (inner) inner.innerHTML = buildProgressChart(_selectedChartMs);
      if (title) title.textContent = _selectedChartMs ? `Oppgaver – ${ms?.title||""}` : "Milepæl-fremgang over tid";
      if (sub)   sub.textContent   = _selectedChartMs
        ? `Viser ekte oppgavefremdrift for "${ms?.title||""}" basert på fullføringstidspunkt`
        : "Blå linje viser total prosjektfremgang – stiger når en milepæl fullføres";
    });
  }
}

/* =========================================================
   ADMIN MODAL – REDIGER PROSJEKT
   Dynamisk modal som lar ansatte oppdatere prosjektstart,
   varighet og milepæler direkte i portalen.
   Lagrer data til Firestore og utløser sanntidsoppdatering.
========================================================= */
function openAdminModal() {
  // Lukk modal hvis den allerede er åpen (toggle-funksjonalitet)
  const existing = document.getElementById("adminModal");
  if (existing) { existing.remove(); return; }

  const milestones = _state.milestones || [];
  const modal = document.createElement("div");
  modal.id = "adminModal";

  // Bygg modal-HTML med eksisterende milepæler forhåndsutfylt
  modal.innerHTML = `
    <div class="admin-backdrop"></div>
    <div class="admin-panel">
      <div class="admin-title">Rediger prosjekt</div>

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
                   value="${m.date ? (() => { try {
                     const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
                     return d.toISOString().slice(0,10);
                   } catch(e){ return ""; }})() : ""}"/>
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

  // Lukk modal ved klikk utenfor panelet eller på Avbryt
  modal.querySelector(".admin-backdrop").addEventListener("click", () => modal.remove());
  document.getElementById("adminClose").addEventListener("click",  () => modal.remove());

  // Koble fjern-knapper på eksisterende milepæl-rader
  modal.querySelectorAll(".admin-ms-remove").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".admin-milestone-row").remove());
  });

  // Legg til ny tom milepæl-rad i listen
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

  // Lagre alle endringer til Firestore
  document.getElementById("adminSave").addEventListener("click", async () => {
    const startStr = document.getElementById("adminStart").value;
    const duration = parseInt(document.getElementById("adminDuration").value, 10);
    const statusEl = document.getElementById("adminStatus");

    // Les alle milepæl-rader og bygg ny array
    const rows = document.querySelectorAll(".admin-milestone-row");
    const milestones = [];
    rows.forEach((row, i) => {
      const title   = row.querySelector("input[type=text]")?.value.trim();
      const done    = row.querySelector(".admin-ms-check")?.checked || false;
      const dateVal = row.querySelector(".admin-ms-date")?.value;
      if (title) {
        milestones.push({
          id: `ms_${i}`,  // Stabilt ID basert på indeks
          title, done,
          date: dateVal ? Timestamp.fromDate(new Date(dateVal)) : null
        });
      }
    });

    // Auto-sett goalText til første ufullendte milepæl
    const nextMs   = milestones.find(m => !m.done);
    const goalText = nextMs?.title || (milestones.length > 0 ? "Alle milepæler fullført ✓" : _state.goalText);
    if (!_currentProjectId) { statusEl.textContent = "Ingen prosjekt valgt."; return; }

    statusEl.textContent = "Lagrer…";
    try {
      // Skriv prosjektdata til Firestore med merge for å bevare andre felt
      await setDoc(doc(db, "projects", _currentProjectId), {
        startedAt:    startStr ? Timestamp.fromDate(new Date(startStr)) : serverTimestamp(),
        durationDays: isNaN(duration) ? 90 : duration,
        milestones,
        goalText,
        updatedAt:    serverTimestamp()
      }, { merge: true });

      // Lagre dagens progress-snapshot slik at grafen viser korrekt historikk
      const snapPct = milestones.length > 0
        ? Math.round(milestones.filter(m => m.done).length / milestones.length * 100) : 0;
      await setDoc(
        doc(db, "projects", _currentProjectId, "progressHistory", getTodayKey()),
        { pct: snapPct, savedAt: serverTimestamp() },
        { merge: true }
      );

      statusEl.style.color = "#86efac";
      statusEl.textContent = "✓ Lagret!";
      setTimeout(() => modal.remove(), 900); // Lukk automatisk etter bekreftelse
    } catch (err) {
      statusEl.style.color = "#f87171";
      statusEl.textContent = "Feil: " + err.message;
      console.error(err);
    }
  });
}

// Eksponerer openAdminModal globalt slik at script.js kan kalle den
// fra Rediger-knappen i index.html
window.openAdminModal = openAdminModal;

/* =========================================================
   INIT – OPPSTART
   Injiserer CSS, starter lyttere og lytter på projectChanged-
   eventet som sendes fra project.js ved prosjektbytte.
========================================================= */
function initAnalytics() {
  // Injiser CSS for admin-modal og milepæl-liste én gang ved sidelast
  if (!document.getElementById("adminModalStyles")) {
    const s = document.createElement("style");
    s.id = "adminModalStyles";
    s.textContent = `
      #adminModal { position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center; }
      .admin-backdrop { position:absolute;inset:0;background:rgba(0,0,0,0.60);backdrop-filter:blur(4px); }
      .admin-panel { position:relative;z-index:1;width:min(520px,94vw);background:rgba(14,18,30,0.97);
        border:1px solid rgba(255,255,255,0.16);border-radius:20px;padding:24px;
        box-shadow:0 24px 60px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:10px;
        max-height:90vh;overflow-y:auto; }
      .admin-title { font-size:16px;font-weight:800;color:rgba(255,255,255,0.95);margin-bottom:4px; }
      .admin-label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
        color:rgba(255,255,255,0.55);margin-top:4px; }
      .admin-input { width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.16);
        background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.92);font-size:13px;outline:none;font-family:inherit; }
      .admin-input:focus { border-color:rgba(96,165,250,0.60); }
      .admin-actions { display:flex;gap:8px;margin-top:6px; }
      .admin-btn { flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.16);
        background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.88);font-size:13px;font-weight:600;cursor:pointer; }
      .admin-btn.primary { background:#3b82f6;border-color:#60a5fa;color:#fff; }
      .admin-btn.primary:hover { background:#2563eb; }
      .admin-btn:hover { background:rgba(255,255,255,0.14); }
      .admin-status { font-size:12px;min-height:16px;margin:0;color:rgba(255,255,255,0.60); }
      .admin-milestone-list { display:flex;flex-direction:column;gap:6px; }
      .admin-milestone-row { display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:8px; }
      .admin-ms-check { width:16px;height:16px;cursor:pointer;accent-color:#60a5fa;flex-shrink:0; }
      .admin-ms-date { width:120px;flex-shrink:0; }
      .admin-ms-remove { background:none;border:none;color:rgba(255,255,255,0.40);cursor:pointer;font-size:14px;padding:2px 6px; }
      .admin-ms-remove:hover { color:#f87171; }
      .analytics-milestone-box { background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);
        border-radius:12px;padding:12px 14px; }
      .analytics-milestone-title { font-size:11px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:rgba(255,255,255,0.50);margin-bottom:8px; }
      .analytics-milestone-list { display:flex;flex-direction:column;gap:6px; }
      .milestone-row { display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.80); }
      .milestone-row.done { opacity:0.55;text-decoration:line-through; }
      .milestone-check { font-size:14px;color:#60a5fa;flex-shrink:0; }
      .milestone-row.done .milestone-check { color:#4ade80; }
      .milestone-title { flex:1; }
      .milestone-date { font-size:11px;color:rgba(255,255,255,0.45);white-space:nowrap; }
    `;
    document.head.appendChild(s);
  }

  showLoading();

  // Start lyttere for prosjektet som er valgt ved sidelast
  const projectId = window.currentProjectId;
  if (projectId) startLiveAnalytics(projectId);

  // Lytter på prosjektbytte fra project.js (CustomEvent dispatches ved dropdown-valg)
  window.addEventListener("projectChanged", (e) => {
    if (e.detail?.projectId) startLiveAnalytics(e.detail.projectId);
  });
}

// Støtter både rask og treg DOM-lasting
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics);
} else {
  initAnalytics();
}