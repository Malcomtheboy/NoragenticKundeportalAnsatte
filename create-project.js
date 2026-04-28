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
const projectGoalInput = document.getElementById("projectGoalInput");

function openProjectModal() {
  createProjectModal.classList.remove("is-hidden");
}

function closeProjectModalFn() {
  createProjectModal.classList.add("is-hidden");
}

function clearProjectForm() {
  projectTitleInput.value = "";
  projectCustomerInput.value = "";
  projectDescriptionInput.value = "";
  projectGoalInput.value = "";
}

if (createProjectBtn) {
  createProjectBtn.addEventListener("click", openProjectModal);
}

if (closeProjectModal) {
  closeProjectModal.addEventListener("click", closeProjectModalFn);
}

if (cancelProjectModal) {
  cancelProjectModal.addEventListener("click", closeProjectModalFn);
}

if (createProjectModal) {
  createProjectModal.addEventListener("click", (e) => {
    if (e.target === createProjectModal) {
      closeProjectModalFn();
    }
  });
}

if (saveProjectBtn) {
  saveProjectBtn.addEventListener("click", async () => {
    const title = projectTitleInput.value.trim();
    const customer = projectCustomerInput.value.trim();
    const goal = projectGoalInput.value.trim();

    if (!title || !customer || !goal) {
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
        status: "Aktiv",
        createdAt: serverTimestamp(),
        createdBy: localStorage.getItem("employee_uid") || null,
        employeeIds: [],
        customerIds: []
      });

      alert(`Prosjekt opprettet! Prosjekt-ID: ${docRef.id}`);

      clearProjectForm();
      closeProjectModalFn();

    } catch (error) {
      console.error("Feil ved oppretting av prosjekt:", error);
      alert("Kunne ikke opprette prosjekt.");
    } finally {
      saveProjectBtn.disabled = false;
      saveProjectBtn.textContent = "Opprett prosjekt";
    }
  });
}
