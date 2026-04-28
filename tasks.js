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
   ELEMENTER
========================================================= */
const taskInput       = document.getElementById("taskInput");
const addTaskBtn      = document.getElementById("addTaskBtn");
const taskList        = document.getElementById("taskList");
const taskSectionTitle = document.getElementById("taskSectionTitle");
const toggleDoneBtn   = document.getElementById("toggleDoneBtn");
const clearDoneBtn    = document.getElementById("clearDoneBtn");

/* =========================================================
   STATE
========================================================= */
let showDone         = false;
let currentProjectId = window.currentProjectId || null;
let currentMilestones = [];          // alle milepæler for prosjektet
let activeMilestoneId = null;        // ID på valgt milepæl i dropdown
let unsubscribeTasks  = null;
let unsubscribeProject = null;

/* =========================================================
   MILESTONE-SELECTOR
   Mohamed – dropdown lar ansatt velge hvilken milepæl de jobber i
========================================================= */
function getMilestoneSelector() {
  return document.getElementById("milestoneSelector");
}

function renderMilestoneSelector(milestones) {
  let wrap = document.getElementById("milestoneSelectorWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "milestoneSelectorWrap";
    wrap.style.cssText = "margin-bottom:10px;";
    const taskBox = document.querySelector(".task-input-row");
    if (taskBox) taskBox.parentElement.insertBefore(wrap, taskBox);
  }

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

  const sel = document.getElementById("milestoneSelector");
  sel?.addEventListener("change", () => {
    activeMilestoneId = sel.value || null;
    if (currentProjectId) listenTasks(currentProjectId);
  });

  // Default: første ikke-fullførte milepæl
  if (!activeMilestoneId || !milestones.find(m => m.id === activeMilestoneId)) {
    const first = milestones.find(m => !m.done) || milestones[0];
    activeMilestoneId = first?.id || null;
    if (sel) sel.value = activeMilestoneId || "";
  }
}

/* =========================================================
   TASK PROGRESS BAR
   Mohamed – viser hvor mange tasks som er gjort i aktiv milepæl
========================================================= */
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
  const color = "rgba(74,222,128,0.85)"; // Mohamed – alltid grønn

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
   RENDER TASKS
========================================================= */
function renderTasks(snapshot) {
  if (!taskList) return;
  taskList.innerHTML = "";

  let total = 0;
  let doneCount = 0;
  const allDone = [];

  snapshot.forEach((d) => {
    const t = d.data();
    total++;
    if (t.done) {
      doneCount++;
      allDone.push(d.id);
    }
    if (!showDone && t.done) return;

    const row = document.createElement("div");
    row.className = `task-item ${t.done ? "done" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${t.done ? "checked" : ""} data-id="${d.id}">
      <span>${t.title || ""}</span>
      <button class="btn small delete-task-btn" data-id="${d.id}" type="button">Slett</button>
    `;
    taskList.appendChild(row);

    row.querySelector("input").addEventListener("change", async (e) => {
      await updateDoc(doc(db, "projects", currentProjectId, "tasks", d.id), {
        done: e.target.checked
      });
      // Mohamed – sjekk om alle tasks er done etter hver endring
      await checkAndCompleteMilestone(currentProjectId, activeMilestoneId);
    });

    row.querySelector(".delete-task-btn")?.addEventListener("click", async () => {
      await deleteDoc(doc(db, "projects", currentProjectId, "tasks", d.id));
    });
  });

  if (taskSectionTitle) {
    taskSectionTitle.textContent = `Tasks (${doneCount}/${total} ferdig)`;
  }

  renderTaskProgressBar(doneCount, total);

  // Mohamed – auto-fullfør milepæl hvis alle tasks er done og det finnes tasks
  if (total > 0 && doneCount === total) {
    checkAndCompleteMilestone(currentProjectId, activeMilestoneId);
  }
}

/* =========================================================
   AUTO-FULLFØR MILEPÆL
   Mohamed – når alle tasks i en milepæl er done, sett milestone.done = true
========================================================= */
async function checkAndCompleteMilestone(projectId, milestoneId) {
  if (!projectId || !milestoneId) return;

  try {
    // Hent alle tasks for denne milepælen
    const snap = await getDocs(query(
      collection(db, "projects", projectId, "tasks"),
      where("delmalId", "==", milestoneId)
    ));

    if (snap.empty) return;

    const total = snap.size;
    const done  = snap.docs.filter(d => d.data().done).length;

    if (done < total) return; // Ikke alle done ennå

    // Mohamed – hent prosjektdokument og oppdater milepælen
    const projSnap = await getDoc(doc(db, "projects", projectId));
    if (!projSnap.exists()) return;

    const milestones = projSnap.data().milestones || [];
    const idx = milestones.findIndex(m => m.id === milestoneId);
    if (idx === -1) return;
    if (milestones[idx].done) return; // Allerede ferdig

    milestones[idx].done = true;

    await setDoc(doc(db, "projects", projectId), {
      milestones,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`Mohamed – Milepæl "${milestones[idx].title}" auto-fullført! 🎉`);
  } catch (err) {
    console.error("Mohamed – checkAndCompleteMilestone feilet:", err);
  }
}

/* =========================================================
   LYTT PÅ TASKS
========================================================= */
function listenTasks(projectId) {
  if (!projectId || !activeMilestoneId) {
    if (taskList) taskList.innerHTML = "";
    renderTaskProgressBar(0, 0);
    return;
  }
  if (unsubscribeTasks) unsubscribeTasks();

  const q = query(
    collection(db, "projects", projectId, "tasks"),
    where("delmalId", "==", activeMilestoneId)
  );

  unsubscribeTasks = onSnapshot(q, renderTasks, (err) => {
    console.error("Task listener error:", err);
  });
}

/* =========================================================
   LYTT PÅ PROSJEKTDOKUMENT – oppdater milepæl-dropdown
========================================================= */
function listenProject(projectId) {
  if (!projectId) return;
  if (unsubscribeProject) unsubscribeProject();

  unsubscribeProject = onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (!snap.exists()) return;
      currentMilestones = snap.data().milestones || [];
      renderMilestoneSelector(currentMilestones);
      listenTasks(projectId);
    },
    (err) => console.warn("Project listener (tasks):", err.code)
  );
}

/* =========================================================
   LEGG TIL TASK
========================================================= */
async function addTask() {
  const projectId = window.currentProjectId || currentProjectId;
  if (!projectId) { alert("Fant ikke aktivt prosjekt-id"); return; }
  if (!activeMilestoneId) { alert("Velg en milepæl først"); return; }

  const title = taskInput?.value.trim();
  if (!title) { alert("Skriv task-navn først"); return; }

  try {
    await addDoc(collection(db, "projects", projectId, "tasks"), {
      title,
      done:      false,
      delmalId:  activeMilestoneId,  // Mohamed – koblet til milepæl-ID
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || "unknown"
    });
    taskInput.value = "";
  } catch (err) {
    console.error("Kunne ikke lagre task:", err);
    alert("Feil ved lagring: " + (err.message || err));
  }
}

/* =========================================================
   EVENT LISTENERS
========================================================= */
addTaskBtn?.addEventListener("click", addTask);

taskInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

toggleDoneBtn?.addEventListener("click", () => {
  showDone = !showDone;
  toggleDoneBtn.textContent = showDone ? "Skjul fullførte" : "Vis fullførte";
  if (currentProjectId) listenTasks(currentProjectId);
});

clearDoneBtn?.addEventListener("click", async () => {
  if (!currentProjectId || !activeMilestoneId) return;

  const snap = await getDocs(query(
    collection(db, "projects", currentProjectId, "tasks"),
    where("delmalId", "==", activeMilestoneId),
    where("done", "==", true)
  ));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "projects", currentProjectId, "tasks", d.id));
  }
});

window.addEventListener("projectChanged", (e) => {
  currentProjectId = e.detail?.projectId || null;
  activeMilestoneId = null; // reset ved prosjektbytte
  listenProject(currentProjectId);
});

// Init hvis prosjekt allerede er satt
if (window.currentProjectId) {
  currentProjectId = window.currentProjectId;
  listenProject(currentProjectId);
}