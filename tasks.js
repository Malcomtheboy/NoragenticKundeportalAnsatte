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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const taskInput = document.getElementById("taskInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const taskList = document.getElementById("taskList");
const taskSectionTitle = document.getElementById("taskSectionTitle");
const toggleDoneBtn = document.getElementById("toggleDoneBtn");
const clearDoneBtn = document.getElementById("clearDoneBtn");

let showDone = false;



let currentProjectId = window.currentProjectId || null;
const currentDelmalId = "main_delmal";
let unsubscribeTasks = null;

function renderTasks(snapshot) {
  let total = 0;
  let doneCount = 0;
  if (!taskList) return;
  taskList.innerHTML = "";

  snapshot.forEach((d) => {
    const t = d.data();
    total += 1;
    if (t.done) doneCount += 1;
    if (!showDone && t.done) return;


    const row = document.createElement("div");
    row.className = `task-item ${t.done ? "done" : ""}`;
    row.innerHTML = `
  <input type="checkbox" ${t.done ? "checked" : ""} data-id="${d.id}">
  <span>${t.title || ""}</span>
  <button class="btn small delete-task-btn" data-id="${d.id}" type="button">Slett</button>
`;
    taskList.appendChild(row);

    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", async (e) => {
      await updateDoc(doc(db, "projects", currentProjectId, "tasks", d.id), {
        done: e.target.checked
      });
    });
  const deleteBtn = row.querySelector(".delete-task-btn");
  deleteBtn?.addEventListener("click", async () => {
  await deleteDoc(doc(db, "projects", currentProjectId, "tasks", d.id));
  });
  });




  if (taskSectionTitle) {
  taskSectionTitle.textContent = `Tasks (${doneCount}/${total} ferdig)`;
}

}

function listenTasks(projectId) {
  if (!projectId) return;
  if (unsubscribeTasks) unsubscribeTasks();

  const q = query(
    collection(db, "projects", projectId, "tasks"),
    where("delmalId", "==", currentDelmalId)
  );

  unsubscribeTasks = onSnapshot(
    q,
    renderTasks,
    (error) => {
      console.error("Task listener error:", error);
    }
  );
}

async function addTask() {
  const projectId =
    window.currentProjectId ||
    currentProjectId ||
    document.getElementById("projectSelector")?.value ||
    null;

  if (!projectId || !taskInput) {
    alert("Fant ikke aktivt prosjekt-id");
    return;
  }

  const title = taskInput.value.trim();
  if (!title) {
    alert("Skriv task-navn først");
    return;
  }

  try {
    await addDoc(collection(db, "projects", projectId, "tasks"), {
      title,
      done: false,
      delmalId: currentDelmalId,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || "unknown"
    });

    taskInput.value = "";
  } catch (error) {
    console.error("Kunne ikke lagre task:", error);
    alert("Feil ved lagring: " + (error.message || error));
  }
}



addTaskBtn?.addEventListener("click", async () => {
  console.log("Klikket Legg til");
  await addTask();
});


window.addEventListener("projectChanged", (e) => {
  currentProjectId = e.detail?.projectId || null;
  console.log("Task module aktivt prosjekt:", currentProjectId);
  listenTasks(currentProjectId);
});

toggleDoneBtn?.addEventListener("click", () => {
  showDone = !showDone;
  toggleDoneBtn.textContent = showDone ? "Skjul fullførte" : "Vis fullførte";
  if (currentProjectId) listenTasks(currentProjectId);
});

clearDoneBtn?.addEventListener("click", async () => {
  if (!currentProjectId) return;

  const snap = await getDocs(query(
    collection(db, "projects", currentProjectId, "tasks"),
    where("delmalId", "==", currentDelmalId),
    where("done", "==", true)
  ));

  for (const d of snap.docs) {
    await deleteDoc(doc(db, "projects", currentProjectId, "tasks", d.id));
  }
});


if (window.currentProjectId) {
  currentProjectId = window.currentProjectId;
  listenTasks(currentProjectId);
}


