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
  collection,
  getDocs,
  updateDoc,
  arrayUnion,
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
  getApps().find(app => app.name === "SecondaryCustomerApp") ||
  initializeApp(firebaseConfig, "SecondaryCustomerApp");

const secondaryAuth = getAuth(secondaryApp);

const createCustomerBtn = document.getElementById("createCustomerBtn");
const createCustomerModal = document.getElementById("createCustomerModal");
const closeCustomerModal = document.getElementById("closeCustomerModal");
const cancelCustomerModal = document.getElementById("cancelCustomerModal");
const saveCustomerBtn = document.getElementById("saveCustomerBtn");

const customerNameInput = document.getElementById("customerNameInput");
const customerEmailInput = document.getElementById("customerEmailInput");
const customerPasswordInput = document.getElementById("customerPasswordInput");
const customerProjectSelect = document.getElementById("customerProjectSelect");

async function loadProjectsIntoDropdown() {
  if (!customerProjectSelect) return;

  customerProjectSelect.innerHTML = `<option value="">Velg prosjekt</option>`;

  const snapshot = await getDocs(collection(db, "projects"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = data.name || "Uten navn";

    customerProjectSelect.appendChild(option);
  });
}

async function openCustomerModal() {
  createCustomerModal.classList.remove("is-hidden");
  await loadProjectsIntoDropdown();
}

function closeCustomerModalFn() {
  createCustomerModal.classList.add("is-hidden");
}

function clearCustomerForm() {
  customerNameInput.value = "";
  customerEmailInput.value = "";
  customerPasswordInput.value = "";
  customerProjectSelect.value = "";
}

if (createCustomerBtn) {
  createCustomerBtn.addEventListener("click", openCustomerModal);
}

if (closeCustomerModal) {
  closeCustomerModal.addEventListener("click", closeCustomerModalFn);
}

if (cancelCustomerModal) {
  cancelCustomerModal.addEventListener("click", closeCustomerModalFn);
}

if (createCustomerModal) {
  createCustomerModal.addEventListener("click", (e) => {
    if (e.target === createCustomerModal) {
      closeCustomerModalFn();
    }
  });
}

if (saveCustomerBtn) {
  saveCustomerBtn.addEventListener("click", async () => {
    const name = customerNameInput.value.trim();
    const email = customerEmailInput.value.trim();
    const password = customerPasswordInput.value.trim();
    const projectId = customerProjectSelect.value;

    if (!name || !email || !password || !projectId) {
      alert("Fyll ut alle feltene.");
      return;
    }

    try {
      saveCustomerBtn.disabled = true;
      saveCustomerBtn.textContent = "Oppretter...";

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );

      const customerUser = userCredential.user;

      await setDoc(doc(db, "users", customerUser.uid), {
        name,
        email,
        role: "customer",
        projectIds: [projectId],
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "projects", projectId), {
        customerIds: arrayUnion(customerUser.uid)
      });

      await signOut(secondaryAuth);

      alert("Kundekonto opprettet.");

      clearCustomerForm();
      closeCustomerModalFn();

    } catch (error) {
      console.error("Feil ved oppretting av kunde:", error);
      alert("Kunne ikke opprette kunde: " + error.message);
    } finally {
      saveCustomerBtn.disabled = false;
      saveCustomerBtn.textContent = "Opprett kunde";
    }
  });
}