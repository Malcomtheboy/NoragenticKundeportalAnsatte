// ============================================================
// tasks.js – Ansattportal
// Ansvarlig: Gruppemedlem
//
// Denne filen håndterer alt som har med oppgaver (tasks) å gjøre
// i ansattportalen. Hovedfunksjoner:
//   – Vise og oppdatere oppgaver koblet til en valgt milepæl
//   – Legge til nye oppgaver med kobling til milepæl-ID
//   – Automatisk fullføre en milepæl når alle oppgaver er krysset av
//   – Lagre completedAt-timestamp som brukes i Analytics.js
//     for å vise historisk fremdrift i grafen per milepæl
//
// Dataflyt:
//   project.js → dispatches "projectChanged" event
//   tasks.js   → lytter på event → starter listenProject()
//   Firestore  → onSnapshot → renderTasks() → oppdaterer UI
// ============================================================

import { auth, db } from "./firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   DOM-REFERANSER
   Henter HTML-elementer én gang ved oppstart.
   Disse er statiske i index.html og endres ikke under kjøring.
========================================================= */
const taskInput        = document.getElementById("taskInput");
const addTaskBtn       = document.getElementById("addTaskBtn");
const taskList         = document.getElementById("taskList");
const taskSectionTitle = document.getElementById("taskSectionTitle");
const toggleDoneBtn    = document.getElementById("toggleDoneBtn");
const clearDoneBtn     = document.getElementById("clearDoneBtn");

/* =========================================================
   TILSTANDSVARIABLER (STATE)
   Holder modulens tilstand mellom funksjonsKall og
   Firestore-oppdateringer.
========================================================= */
let showDone          = false;  // Om fullførte oppgaver er synlige i listen
let currentProjectId  = window.currentProjectId || null; // Aktivt prosjekt
let currentMilestones = [];     // Alle milepæler for gjeldende prosjekt
let activeMilestoneId = null;   // ID på milepælen valgt i dropdown
let unsubscribeTasks  = null;   // Stopper task-lytteren ved milepælbytte
let unsubscribeProject = null;  // Stopper prosjekt-lytteren ved prosjektbytte

/* =========================================================
   MILEPÆL-DROPDOWN
   Viser en select-meny der ansatt velger hvilken milepæl
   de vil se og legge til oppgaver i.
   Fullførte milepæler vises med ✓, aktive med ○.
========================================================= */

/** Hjelpefunksjon som returnerer dropdown-elementet fra DOM */
function getMilestoneSelector() {
  return document.getElementById("milestoneSelector");
}

/**
 * Bygger og setter inn milepæl-dropdown dynamisk i DOM-en.
 * Kalles når prosjektdokumentet oppdateres i Firestore,
 * slik at dropdown alltid reflekterer gjeldende milepæler.
 *
 * @param {Array} milestones - Array av milepæl-objekter fra Firestore
 *                             Format: [{ id, title, done, date }]
 */
function renderMilestoneSelector(milestones) {
  // Finn eller opprett wrapper-div over oppgave-inputfeltet
  let wrap = document.getElementById("milestoneSelectorWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "milestoneSelectorWrap";
    wrap.style.cssText = "margin-bottom:10px;";
    const taskBox = document.querySelector(".task-input-row");
    if (taskBox) taskBox.parentElement.insertBefore(wrap, taskBox);
  }

  // Bygg option-elementer – tom melding hvis ingen milepæler finnes ennå
  const options = milestones.length === 0
    ? `<option value="">Ingen milepæler – legg til i ✏️</option>`
    : milestones.map(m =>
        `<option value="${m.id}" ${m.id === activeMilestoneId ? "selected" : ""}>
          ${m.done ? "✓ Fullført –" : "○ Aktiv –"} ${m.title}
         </option>`
      ).join("");

  wrap.innerHTML = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                letter-spacing:.05em;color:rgba(255,255,255,0.50);margin-bottom:6px">
      Legg til task til milepæl:
    </div>
    <select id="milestoneSelector" style="
      width:100%; padding:8px 10px; border-radius:10px;
      border:1px solid rgba(74,222,128,0.40);
      background:rgba(74,222,128,0.07); color:rgba(255,255,255,0.90);
      font-size:13px; outline:none; cursor:pointer;">
      ${options}
    </select>`;

  // Oppdater aktiveMilestoneId og last nye oppgaver når ansatt bytter milepæl
  const sel = document.getElementById("milestoneSelector");
  sel?.addEventListener("change", () => {
    activeMilestoneId = sel.value || null;
    if (currentProjectId) listenTasks(currentProjectId);
  });

  // Sett første ikke-fullførte milepæl som default ved prosjektlasting
  if (!activeMilestoneId || !milestones.find(m => m.id === activeMilestoneId)) {
    const first = milestones.find(m => !m.done) || milestones[0];
    activeMilestoneId = first?.id || null;
    if (sel) sel.value = activeMilestoneId || "";
  }
}

/* =========================================================
   FREMDRIFTSBAR FOR OPPGAVER
   Viser en grønn bar med antall fullførte/totale oppgaver
   i den valgte milepælen. Kalles etter hver snapshot-oppdatering.
========================================================= */

/**
 * Oppdaterer fremdriftsbaren dynamisk basert på fullførte oppgaver.
 * Oppretter wrapper-elementet i DOM hvis det ikke allerede finnes.
 *
 * @param {number} done  - Antall fullførte oppgaver
 * @param {number} total - Totalt antall oppgaver i milepælen
 */
function renderTaskProgressBar(done, total) {
  let barWrap = document.getElementById("taskProgressWrap");
  if (!barWrap) {
    barWrap = document.createElement("div");
    barWrap.id = "taskProgressWrap";
    barWrap.style.cssText = "margin-bottom:10px;";
    const taskBox = document.querySelector(".task-input-row");
    if (taskBox) taskBox.parentElement.insertBefore(barWrap, taskBox);
  }

  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = "rgba(74,222,128,0.85)"; // Alltid grønn uavhengig av prosent

  barWrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:11px;
                color:rgba(255,255,255,0.55);margin-bottom:4px">
      <span>Tasks fullført</span>
      <span>${done} / ${total} (${pct}%)</span>
    </div>
    <div style="background:rgba(255,255,255,0.08);border-radius:999px;height:6px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};
                  border-radius:999px;transition:width 0.8s ease"></div>
    </div>`;
}

/* =========================================================
   RENDER TASKS – VIS OPPGAVELISTEN
   Kalles automatisk av onSnapshot-lytteren i listenTasks()
   hver gang oppgavedataene endres i Firestore (sanntid).
   Bygger hele oppgavelisten på nytt ved hver oppdatering.
========================================================= */

/**
 * Renderer oppgavelisten basert på et Firestore QuerySnapshot.
 * Teller fullførte vs. totale oppgaver og sjekker auto-fullføring av milepæl.
 *
 * @param {QuerySnapshot} snapshot - Firestore snapshot for oppgaver i aktiv milepæl
 */
function renderTasks(snapshot) {
  if (!taskList) return;
  taskList.innerHTML = ""; // Tøm listen før gjenoppbygging

  let total     = 0;
  let doneCount = 0;
  const allDone = [];

  snapshot.forEach((d) => {
    const t = d.data();
    total++;
    if (t.done) {
      doneCount++;
      allDone.push(d.id);
    }

    // Hopp over fullførte hvis "Vis fullførte" ikke er aktiv
    if (!showDone && t.done) return;

    // Bygg oppgave-rad med checkbox og slett-knapp
    const row = document.createElement("div");
    row.className = `task-item ${t.done ? "done" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${t.done ? "checked" : ""} data-id="${d.id}">
      <span>${t.title || ""}</span>
      <button class="btn small delete-task-btn" data-id="${d.id}" type="button">Slett</button>
    `;
    taskList.appendChild(row);

    // Checkbox-handler: oppdater done-status og completedAt i Firestore.
    // completedAt = serverTimestamp() når avkrysset, null når åpnet igjen.
    // Denne verdien brukes i Analytics.js for å vise ekte historisk
    // fremdriftskurve per milepæl i grafen.
    row.querySelector("input").addEventListener("change", async (e) => {
      const checked = e.target.checked;
      await updateDoc(doc(db, "projects", currentProjectId, "tasks", d.id), {
        done:        checked,
        completedAt: checked ? serverTimestamp() : null
      });
      // Sjekk om alle oppgaver nå er fullført → eventuelt auto-fullfør milepælen
      await syncMilestoneStatusFromTasks(currentProjectId, activeMilestoneId);
    });

    // Slett-knapp: fjern oppgaven permanent fra Firestore
    row.querySelector(".delete-task-btn")?.addEventListener("click", async () => {
      await deleteDoc(doc(db, "projects", currentProjectId, "tasks", d.id));
      await syncMilestoneStatusFromTasks(currentProjectId, activeMilestoneId);
    });
  });

  // Oppdater tittel med teller, f.eks. "Tasks (3/5 ferdig)"
  if (taskSectionTitle) {
    taskSectionTitle.textContent = `Tasks (${doneCount}/${total} ferdig)`;
  }

  renderTaskProgressBar(doneCount, total);

  // Trigger auto-fullføring hvis alle oppgaver er krysset av
  if (total > 0 && doneCount === total) {
    syncMilestoneStatusFromTasks(currentProjectId, activeMilestoneId);
  }
}

/* =========================================================
   AUTO-FULLFØR MILEPÆL
   Sjekker om alle oppgaver i en milepæl er fullført.
   Oppdaterer milestone.done i prosjektdokumentet automatisk.
   Dette utløser prosjekt-lytteren i Analytics.js, som igjen
   oppdaterer fremgangsprosenten og grafen i sanntid.
========================================================= */

/**
 * Synkroniserer milepæl-status basert på oppgavestatus.
 * Henter alle oppgaver for milepælen og setter done = true
 * hvis alle er fullført, eller false hvis minst én er åpen.
 * Unngår unødvendige Firestore-skrivinger ved å sammenligne
 * eksisterende verdi før oppdatering.
 *
 * @param {string} projectId   - ID på gjeldende prosjekt
 * @param {string} milestoneId - ID på milepælen som skal sjekkes
 */
async function syncMilestoneStatusFromTasks(projectId, milestoneId) {
  if (!projectId || !milestoneId) return;

  try {
    // Hent alle oppgaver koblet til denne milepælen via delmalId
    const snap = await getDocs(query(
      collection(db, "projects", projectId, "tasks"),
      where("delmalId", "==", milestoneId)
    ));

    const total = snap.size;
    const done  = snap.docs.filter(d => d.data().done).length;

    // Hent prosjektdokumentet for å lese eksisterende milepæler
    const projSnap = await getDoc(doc(db, "projects", projectId));
    if (!projSnap.exists()) return;

    const milestones = projSnap.data().milestones || [];
    const idx        = milestones.findIndex(m => m.id === milestoneId);
    if (idx === -1) return;

    const shouldBeDone = total > 0 && done === total;

    // Avbryt hvis status ikke har endret seg – sparer Firestore-skriving
    if (milestones[idx].done === shouldBeDone) return;

    milestones[idx].done = shouldBeDone;

    // Lagre oppdatert milepæl-array til Firestore med merge
    // Dette utløser prosjekt-lytteren i Analytics.js automatisk
    await setDoc(doc(db, "projects", projectId), {
      milestones,
      updatedAt: serverTimestamp()
    }, { merge: true });

  } catch (err) {
    console.error("syncMilestoneStatusFromTasks feilet:", err);
  }
}

/* =========================================================
   LYTT PÅ OPPGAVER (SANNTID)
   Starter en Firestore onSnapshot-lytter filtrert på
   aktiveMilestoneId. Lytteren stoppes og restartes
   automatisk når ansatt bytter milepæl i dropdown.
========================================================= */

/**
 * Starter eller restarter sanntidslytting på oppgaver for aktiv milepæl.
 * Bruker onSnapshot slik at listen oppdateres automatisk
 * uten sideoppdatering når data endres i Firestore.
 *
 * @param {string} projectId - ID på gjeldende prosjekt
 */
function listenTasks(projectId) {
  // Vis tom liste og nullstill bar hvis ingen milepæl er valgt
  if (!projectId || !activeMilestoneId) {
    if (taskList) taskList.innerHTML = "";
    renderTaskProgressBar(0, 0);
    return;
  }

  // Stopp forrige lytter for å unngå doble abonnementer og minnelekkasje
  if (unsubscribeTasks) unsubscribeTasks();

  // Filtrer oppgaver på delmalId – henter kun oppgaver for valgt milepæl
  const q = query(
    collection(db, "projects", projectId, "tasks"),
    where("delmalId", "==", activeMilestoneId)
  );

  // Start sanntidslytter – renderTasks kalles automatisk ved endringer
  unsubscribeTasks = onSnapshot(q, renderTasks, (err) => {
    console.error("Task listener error:", err);
  });
}

/* =========================================================
   LYTT PÅ PROSJEKTDOKUMENT
   Lytter på endringer i prosjektets milepæl-array slik at
   dropdown alltid er oppdatert, f.eks. når en ansatt legger
   til eller redigerer milepæler via admin-modalen.
========================================================= */

/**
 * Starter sanntidslytting på prosjektdokumentet.
 * Oppdaterer milepæl-dropdown og restarter task-lytteren
 * automatisk ved endringer i Firestore.
 *
 * @param {string} projectId - ID på prosjektet det lyttes på
 */
function listenProject(projectId) {
  if (!projectId) return;
  if (unsubscribeProject) unsubscribeProject(); // Stopp forrige lytter

  unsubscribeProject = onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (!snap.exists()) return;
      currentMilestones = snap.data().milestones || [];
      renderMilestoneSelector(currentMilestones); // Oppdater dropdown med nye milepæler
      listenTasks(projectId);                      // Last oppgaver for aktiv milepæl
    },
    (err) => console.warn("Project listener (tasks):", err.code)
  );
}

/* =========================================================
   LEGG TIL OPPGAVE
   Oppretter en ny oppgave i Firestore-subkoleksjonen
   projects/{id}/tasks og kobler den til aktiv milepæl.
   completedAt settes til null og oppdateres ved avkryssing.
========================================================= */

/**
 * Leser tittel fra inputfeltet og lagrer ny oppgave til Firestore.
 * Validerer at prosjekt og milepæl er valgt før lagring.
 * Tømmer inputfeltet etter vellykket lagring.
 */
async function addTask() {
  const projectId = window.currentProjectId || currentProjectId;
  if (!projectId)         { alert("Fant ikke aktivt prosjekt-id"); return; }
  if (!activeMilestoneId) { alert("Velg en milepæl først"); return; }

  const title = taskInput?.value.trim();
  if (!title) { alert("Skriv task-navn først"); return; }

  try {
    await addDoc(collection(db, "projects", projectId, "tasks"), {
      title,
      done:        false,
      delmalId:    activeMilestoneId, // Kobler oppgaven til valgt milepæl-ID
      completedAt: null,              // Settes til serverTimestamp() når avkrysset
      createdAt:   serverTimestamp(), // Tidsstempel for opprettelse
      createdBy:   auth.currentUser?.uid || "unknown" // UID til innlogget ansatt
    });
    taskInput.value = ""; // Tøm felt etter vellykket lagring
  } catch (err) {
    console.error("Kunne ikke lagre task:", err);
    alert("Feil ved lagring: " + (err.message || err));
  }
}

/* =========================================================
   EVENT LISTENERS – BRUKERINTERAKSJONER
   Kobler HTML-knapper og inputfelter til funksjoner.
========================================================= */

// Legg til oppgave ved klikk
addTaskBtn?.addEventListener("click", addTask);

// Legg til oppgave ved Enter-tast i inputfeltet
taskInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

// Vis/skjul fullførte oppgaver – toggler showDone-flagget
toggleDoneBtn?.addEventListener("click", () => {
  showDone = !showDone;
  toggleDoneBtn.textContent = showDone ? "Skjul fullførte" : "Vis fullførte";
  if (currentProjectId) listenTasks(currentProjectId);
});

// Slett alle fullførte oppgaver for aktiv milepæl
clearDoneBtn?.addEventListener("click", async () => {
  if (!currentProjectId || !activeMilestoneId) return;

  // Hent alle fullførte oppgaver for milepælen
  const snap = await getDocs(query(
    collection(db, "projects", currentProjectId, "tasks"),
    where("delmalId", "==", activeMilestoneId),
    where("done", "==", true)
  ));

  // Slett én etter én (Firestore web-SDK støtter ikke batch-delete direkte)
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "projects", currentProjectId, "tasks", d.id));
  }

  // Oppdater milepæl-status etter at oppgaver er slettet
  await syncMilestoneStatusFromTasks(currentProjectId, activeMilestoneId);
});

// Lytter på projectChanged-eventet som sendes fra project.js
// når ansatt bytter prosjekt via dropdown i hero-seksjonen
window.addEventListener("projectChanged", (e) => {
  currentProjectId  = e.detail?.projectId || null;
  activeMilestoneId = null; // Nullstill milepælvalg ved prosjektbytte
  listenProject(currentProjectId);
});

/* =========================================================
   INIT – OPPSTART
   Starter direkte hvis prosjekt allerede er satt i window
   (f.eks. ved sideoppdatering der prosjekt er lagret i minnet)
========================================================= */
if (window.currentProjectId) {
  currentProjectId = window.currentProjectId;
  listenProject(currentProjectId);
}