import { db } from "./firebase-auth.js";

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

const secondaryApp =
  getApps().find(app => app.name === "SecondaryEmployeeApp") ||
  initializeApp(firebaseConfig, "SecondaryEmployeeApp");

const secondaryAuth = getAuth(secondaryApp);

const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const modal = document.getElementById("createEmployeeModal");
const closeBtn = document.getElementById("closeEmployeeModalX");
const cancelBtn = document.getElementById("cancelEmployeeModal");
const saveBtn = document.getElementById("createEmployeeSaveBtn");

const nameInput = document.getElementById("employeeNameInput");
const emailInput = document.getElementById("employeeEmailInput");
const passwordInput = document.getElementById("employeePasswordInput");

function openModal() {
  modal?.classList.remove("is-hidden");
}

function closeModal() {
  modal?.classList.add("is-hidden");
}

function clearForm() {
  if (nameInput) nameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
}

createEmployeeBtn?.addEventListener("click", openModal);
closeBtn?.addEventListener("click", closeModal);
cancelBtn?.addEventListener("click", closeModal);

modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

saveBtn?.addEventListener("click", async () => {
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

    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    const newUser = userCredential.user;

    await setDoc(doc(db, "users", newUser.uid), {
      name,
      email,
      role: "employee",
      projectIds: [],
      createdAt: serverTimestamp(),
      createdBy: localStorage.getItem("employee_uid") || null
    });

    await signOut(secondaryAuth);

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