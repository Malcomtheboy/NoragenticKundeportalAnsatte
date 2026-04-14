import { auth, db } from "./firebase-auth.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   ELEMENTER
========================================================= */
const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const modal = document.getElementById("createEmployeeModal");
const closeBtn = document.getElementById("closeEmployeeModalX");
const cancelBtn = document.getElementById("cancelEmployeeModal");
const saveBtn = document.getElementById("saveEmployeeSaveBtn");

const nameInput = document.getElementById("employeeNameInput");
const emailInput = document.getElementById("employeeEmailInput");
const passwordInput = document.getElementById("employeePasswordInput");
const projectSelect = document.getElementById("employeeProjectSelect");

console.log("create-employee.js loaded");

/* =========================================================
   LOAD PROSJEKTER I DROPDOWN
========================================================= */
async function loadProjects() {
  if (!projectSelect) {
    console.error("projectSelect finnes ikke");
    return;
  }

  projectSelect.innerHTML = `<option value="">Velg prosjekt</option>`;

  try {
    const snapshot = await getDocs(collection(db, "projects"));

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      const option = document.createElement("option");
      option.value = docSnap.id;
      option.textContent = data.name || "Uten navn";

      projectSelect.appendChild(option);
    });

  } catch (err) {
    console.error("Feil ved lasting av prosjekter:", err);
  }
}

/* =========================================================
   MODAL FUNKSJONER
========================================================= */
async function openModal() {
  if (!modal) return;

  modal.classList.remove("is-hidden");
  await loadProjects();
}

function closeModal() {
  if (!modal) return;
  modal.classList.add("is-hidden");
}

function clearForm() {
  if (nameInput) nameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
  if (projectSelect) projectSelect.value = "";
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

// Åpne
if (createEmployeeBtn) {
  createEmployeeBtn.addEventListener("click", openModal);
}

// Lukk
if (closeBtn) closeBtn.addEventListener("click", closeModal);
if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

// Klikk utenfor
if (modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

/* =========================================================
   OPPRETT ANSATT
========================================================= */
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    console.log("clicked save employee");

    const name = nameInput?.value.trim();
    const email = emailInput?.value.trim();
    const password = passwordInput?.value.trim();
    const projectId = projectSelect?.value;

    if (!name || !email || !password || !projectId) {
      alert("Fyll ut alle feltene.");
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Oppretter...";

      const ownerEmail = localStorage.getItem("employee_email");
      const ownerPassword = prompt("Skriv inn ditt eget passord:");

      if (!ownerPassword) {
        alert("Du må skrive inn passordet ditt.");
        return;
      }

      // Opprett bruker
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCred.user;

      // Lagre i Firestore
      await setDoc(doc(db, "users", newUser.uid), {
        name,
        email,
        role: "employee",
        projectIds: [projectId]
      });

      // Koble til prosjekt
      await setDoc(
        doc(db, "projects", projectId),
        {
          employeeIds: [newUser.uid]
        },
        { merge: true }
      );

      // Logg tilbake som owner
      await signInWithEmailAndPassword(auth, ownerEmail, ownerPassword);

      alert("Ansatt opprettet.");

      clearForm();
      closeModal();

    } catch (err) {
      console.error("Feil ved oppretting:", err);
      alert("Kunne ikke opprette ansatt: " + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Opprett ansatt";
    }
  });
}