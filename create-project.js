import { db } from "./firebase-auth.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const createProjectBtn = document.getElementById("createProjectBtn");
const createProjectModal = document.getElementById("createProjectModal");
const closeProjectModal = document.getElementById("closeProjectModal");
const cancelProjectModal = document.getElementById("cancelProjectModal");
const saveProjectBtn = document.getElementById("saveProjectBtn");

const projectTitleInput = document.getElementById("projectTitleInput");
const projectCustomerInput = document.getElementById("projectCustomerInput");
const projectDescriptionInput = document.getElementById("projectDescriptionInput");
const projectGoalInput = document.getElementById("projectGoalInput");

function openProjectModal() {
  createProjectModal?.classList.remove("is-hidden");
}

function closeProjectModalFn() {
  createProjectModal?.classList.add("is-hidden");
}

function clearProjectForm() {
  if (projectTitleInput) projectTitleInput.value = "";
  if (projectCustomerInput) projectCustomerInput.value = "";
  if (projectDescriptionInput) projectDescriptionInput.value = "";
  if (projectGoalInput) projectGoalInput.value = "";
}

createProjectBtn?.addEventListener("click", openProjectModal);
closeProjectModal?.addEventListener("click", closeProjectModalFn);
cancelProjectModal?.addEventListener("click", closeProjectModalFn);

createProjectModal?.addEventListener("click", (e) => {
  if (e.target === createProjectModal) {
    closeProjectModalFn();
  }
});

saveProjectBtn?.addEventListener("click", async () => {
  const title = projectTitleInput?.value.trim();
  const customer = projectCustomerInput?.value.trim();
  const description = projectDescriptionInput?.value.trim();
  const goal = projectGoalInput?.value.trim();

  if (!title || !customer || !description || !goal) {
    alert("Fyll ut alle feltene.");
    return;
  }

  try {
    saveProjectBtn.disabled = true;
    saveProjectBtn.textContent = "Oppretter...";

    const docRef = await addDoc(collection(db, "projects"), {
      name: title,
      customerName: customer,
      description: description,
      goal: goal,
      goalText: goal,
      status: "Aktiv",
      manualProgress: 0,
      durationDays: 90,
      createdAt: serverTimestamp(),
      createdBy: localStorage.getItem("employee_uid") || null,
      employeeIds: [],
      customerIds: []
    });

    alert(`Prosjekt opprettet! Prosjekt-ID: ${docRef.id}`);

    clearProjectForm();
    closeProjectModalFn();

    window.location.reload();

  } catch (error) {
    console.error("Feil ved oppretting av prosjekt:", error);
    alert("Kunne ikke opprette prosjekt.");
  } finally {
    saveProjectBtn.disabled = false;
    saveProjectBtn.textContent = "Opprett prosjekt";
  }
});