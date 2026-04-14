import { auth, db } from "./firebase-auth.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   ELEMENTER
========================================================= */
const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const modal = document.getElementById("createEmployeeModal");
const closeBtn = document.getElementById("closeEmployeeModalX");
const cancelBtn = document.getElementById("cancelEmployeeModal");
const saveBtn = document.getElementById("createEmployeeSaveBtn");

const nameInput = document.getElementById("employeeNameInput");
const emailInput = document.getElementById("employeeEmailInput");
const passwordInput = document.getElementById("employeePasswordInput");

console.log("create-employee.js loaded");

/* =========================================================
   MODAL FUNKSJONER
========================================================= */
function openModal() {
  if (!modal) return;
  modal.classList.remove("is-hidden");
}

function closeModal() {
  if (!modal) return;
  modal.classList.add("is-hidden");
}

function clearForm() {
  if (nameInput) nameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
}

/* =========================================================
   EVENT LISTENERS
========================================================= */
if (createEmployeeBtn) {
  createEmployeeBtn.addEventListener("click", openModal);
}

if (closeBtn) closeBtn.addEventListener("click", closeModal);
if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

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

    if (!name || !email || !password) {
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

      // Opprett bruker i Firebase Auth
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCred.user;

      // Lagre i Firestore uten prosjektkobling
      await setDoc(doc(db, "users", newUser.uid), {
        name,
        email,
        role: "employee",
        projectIds: []
      });

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