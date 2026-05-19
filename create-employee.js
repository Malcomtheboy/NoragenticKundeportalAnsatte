// Importerer Firestore-database fra firebase-auth.js
import { db } from "./firebase-auth.js";

// Firebase App-importer
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

// Firebase Authentication-funksjoner
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firestore-funksjoner
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { showError } from "./popup-manager.js";

// Firebase-konfigurasjon
const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

// Oppretter en sekundær Firebase-app for ansattopprettelse
// Dette gjør at owner-brukeren ikke logges ut når en ny ansatt opprettes
const secondaryApp =
  getApps().find(app => app.name === "SecondaryEmployeeApp") ||
  initializeApp(firebaseConfig, "SecondaryEmployeeApp");

// Authentication-instans for sekundær app
const secondaryAuth = getAuth(secondaryApp);

// Henter modal og knapper fra HTML
const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const modal = document.getElementById("createEmployeeModal");
const closeBtn = document.getElementById("closeEmployeeModalX");
const cancelBtn = document.getElementById("cancelEmployeeModal");
const saveBtn = document.getElementById("createEmployeeSaveBtn");

// Inputfelter for ansattdata
const nameInput = document.getElementById("employeeNameInput");
const emailInput = document.getElementById("employeeEmailInput");
const passwordInput = document.getElementById("employeePasswordInput");

// Åpner modal for å opprette ansatt
function openModal() {
  modal?.classList.remove("is-hidden");
}

// Lukker modal
function closeModal() {
  modal?.classList.add("is-hidden");
}

// Nullstiller inputfeltene
function clearForm() {
  if (nameInput) nameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
}

// Åpner modal når owner trykker på "+ Ansatt"
createEmployeeBtn?.addEventListener("click", openModal);

// Lukker modal via X-knapp eller avbryt-knapp
closeBtn?.addEventListener("click", closeModal);
cancelBtn?.addEventListener("click", closeModal);

// Lukker modal dersom brukeren klikker utenfor modal-kortet
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// Oppretter ny ansatt
saveBtn?.addEventListener("click", async () => {
  const name = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  const password = passwordInput?.value.trim();

  // Sjekker at alle feltene er fylt ut
  if (!name || !email || !password) {
    showError("Fyll ut alle felt");
    return;
  }

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "Oppretter...";

    // Oppretter ansatt i Firebase Authentication via sekundær app
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    const newUser = userCredential.user;

    // Lagrer ansattdata i Firestore
    await setDoc(doc(db, "users", newUser.uid), {
      name,
      email,
      role: "employee",
      projectIds: [],
      createdAt: serverTimestamp(),
      createdBy: localStorage.getItem("employee_uid") || null
    });

    // Logger ut sekundær auth slik at den ikke holder ny bruker aktiv
    await signOut(secondaryAuth);

    showError("Ansatt opprettet.");

    clearForm();
    closeModal();

  } catch (err) {
    console.error("Feil ved oppretting:", err);
    showError("Kunne ikke opprette ansatt.");

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Opprett ansatt";
  }
});