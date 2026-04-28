import { auth, db } from "./firebase-auth.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const createCustomerBtn = document.getElementById("createCustomerBtn");
const createCustomerModal = document.getElementById("createCustomerModal");
const closeCustomerModal = document.getElementById("closeCustomerModal");
const cancelCustomerModal = document.getElementById("cancelCustomerModal");
const saveCustomerBtn = document.getElementById("saveCustomerBtn");

const customerNameInput = document.getElementById("customerNameInput");
const customerEmailInput = document.getElementById("customerEmailInput");
const customerPasswordInput = document.getElementById("customerPasswordInput");
const customerProjectSelect = document.getElementById("customerProjectSelect");

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
  customerProjectIdInput.value = "";
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

      const ownerEmail = localStorage.getItem("employee_email");
      const ownerPassword = prompt("Skriv inn ditt eget passord for å fullføre opprettelsen:");

      if (!ownerPassword) {
        alert("Du må skrive inn passordet ditt.");
        return;
      }

      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCred.user;

    // Koble kunden til prosjektet også
    await setDoc(
    doc(db, "projects", projectId),
    {
    customerIds: [newUser.uid]
  },
  { merge: true }
);

      await signInWithEmailAndPassword(auth, ownerEmail, ownerPassword);

      alert("Kundekonto opprettet.");
      clearCustomerForm();
      closeCustomerModalFn();

    } catch (err) {
      console.error("Feil ved oppretting av kunde:", err);
      alert("Kunne ikke opprette kunde: " + err.message);
    } finally {
      saveCustomerBtn.disabled = false;
      saveCustomerBtn.textContent = "Opprett kunde";
    }
  });
}

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function loadProjectsIntoDropdown() {
  const select = document.getElementById("customerProjectSelect");

  if (!select) return;

  select.innerHTML = `<option value="">Velg prosjekt</option>`;

  const snapshot = await getDocs(collection(db, "projects"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = data.name || "Uten navn";

    select.appendChild(option);
  });
}