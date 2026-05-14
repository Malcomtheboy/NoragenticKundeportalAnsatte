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
  addDoc,
  getDocs,
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

const companyTabBtn = document.getElementById("companyTabBtn");
const contactTabBtn = document.getElementById("contactTabBtn");
const companyForm = document.getElementById("companyForm");
const contactForm = document.getElementById("contactForm");

const companyNameInput = document.getElementById("companyNameInput");

const customerNameInput = document.getElementById("customerNameInput");
const customerEmailInput = document.getElementById("customerEmailInput");
const customerPasswordInput = document.getElementById("customerPasswordInput");
const customerCompanySelect = document.getElementById("customerCompanySelect");
const customerModalState = document.getElementById("customerModalState");

let activeMode = "company";

function setMode(mode) {
  activeMode = mode;

  if (mode === "company") {
    companyTabBtn.classList.add("is-active");
    contactTabBtn.classList.remove("is-active");
    companyForm.classList.remove("hidden");
    contactForm.classList.add("hidden");
    saveCustomerBtn.textContent = "Opprett firma";
  } else {
    contactTabBtn.classList.add("is-active");
    companyTabBtn.classList.remove("is-active");
    contactForm.classList.remove("hidden");
    companyForm.classList.add("hidden");
    saveCustomerBtn.textContent = "Opprett kontaktperson";
    loadCompaniesIntoDropdown();
  }

  customerModalState.textContent = "";
}

async function loadCompaniesIntoDropdown() {
  if (!customerCompanySelect) return;

  customerCompanySelect.innerHTML = `<option value="">Velg firma</option>`;

  const snapshot = await getDocs(collection(db, "companies"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = data.name || "Uten navn";

    customerCompanySelect.appendChild(option);
  });
}

function openCustomerModal() {
  createCustomerModal.classList.remove("is-hidden");
  setMode("company");
}

function closeCustomerModalFn() {
  createCustomerModal.classList.add("is-hidden");
  clearForms();
}

function clearForms() {
  if (companyNameInput) companyNameInput.value = "";
  if (customerNameInput) customerNameInput.value = "";
  if (customerEmailInput) customerEmailInput.value = "";
  if (customerPasswordInput) customerPasswordInput.value = "";
  if (customerCompanySelect) customerCompanySelect.value = "";
  if (customerModalState) customerModalState.textContent = "";
}

async function createCompany() {
  const companyName = companyNameInput.value.trim();

  if (!companyName) {
    customerModalState.textContent = "Skriv inn firmanavn.";
    return;
  }

  saveCustomerBtn.disabled = true;
  saveCustomerBtn.textContent = "Oppretter...";

  try {
    await addDoc(collection(db, "companies"), {
      name: companyName,
      kundeBeskrivelse: "",
      createdAt: serverTimestamp(),
      createdBy: localStorage.getItem("employee_uid") || null
    });

    customerModalState.textContent = "Firma opprettet.";
    companyNameInput.value = "";

    await loadCompaniesIntoDropdown();

  } catch (error) {
    console.error("Feil ved oppretting av firma:", error);
    customerModalState.textContent = "Kunne ikke opprette firma.";
  } finally {
    saveCustomerBtn.disabled = false;
    saveCustomerBtn.textContent = "Opprett firma";
  }
}

async function createContactPerson() {
  const name = customerNameInput.value.trim();
  const email = customerEmailInput.value.trim();
  const password = customerPasswordInput.value.trim();
  const companyId = customerCompanySelect.value;

  if (!name || !email || !password || !companyId) {
    customerModalState.textContent = "Fyll ut alle feltene.";
    return;
  }

  saveCustomerBtn.disabled = true;
  saveCustomerBtn.textContent = "Oppretter...";

  try {
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
      companyId,
      projectIds: [],
      createdAt: serverTimestamp(),
      createdBy: localStorage.getItem("employee_uid") || null
    });

    await signOut(secondaryAuth);

    customerModalState.textContent = "Kontaktperson opprettet.";

    customerNameInput.value = "";
    customerEmailInput.value = "";
    customerPasswordInput.value = "";
    customerCompanySelect.value = "";

  } catch (error) {
    console.error("Feil ved oppretting av kontaktperson:", error);
    customerModalState.textContent = "Kunne ikke opprette kontaktperson: " + error.message;
  } finally {
    saveCustomerBtn.disabled = false;
    saveCustomerBtn.textContent = "Opprett kontaktperson";
  }
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

if (companyTabBtn) {
  companyTabBtn.addEventListener("click", () => setMode("company"));
}

if (contactTabBtn) {
  contactTabBtn.addEventListener("click", () => setMode("contact"));
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
    if (activeMode === "company") {
      await createCompany();
    } else {
      await createContactPerson();
    }
  });
}