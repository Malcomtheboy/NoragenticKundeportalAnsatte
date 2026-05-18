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
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase-konfigurasjon
const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

// Oppretter sekundær Firebase-app for å kunne lage brukere
// uten å logge ut brukeren som allerede er innlogget
const secondaryApp =
  getApps().find(app => app.name === "SecondaryCustomerApp") ||
  initializeApp(firebaseConfig, "SecondaryCustomerApp");

// Authentication-instans for sekundær app
const secondaryAuth = getAuth(secondaryApp);

// Knapper og modal-elementer
const createCustomerBtn = document.getElementById("createCustomerBtn");
const createCustomerModal = document.getElementById("createCustomerModal");
const closeCustomerModal = document.getElementById("closeCustomerModal");
const cancelCustomerModal = document.getElementById("cancelCustomerModal");
const saveCustomerBtn = document.getElementById("saveCustomerBtn");

// Tabs for valg mellom firma og kontaktperson
const companyTabBtn = document.getElementById("companyTabBtn");
const contactTabBtn = document.getElementById("contactTabBtn");

// Skjemaer
const companyForm = document.getElementById("companyForm");
const contactForm = document.getElementById("contactForm");

// Inputfelt for firma
const companyNameInput = document.getElementById("companyNameInput");

// Inputfelt for kontaktperson
const customerNameInput = document.getElementById("customerNameInput");
const customerEmailInput = document.getElementById("customerEmailInput");
const customerPasswordInput = document.getElementById("customerPasswordInput");

// Dropdown for valg av firma
const customerCompanySelect = document.getElementById("customerCompanySelect");

// Felt for statusmeldinger
const customerModalState = document.getElementById("customerModalState");

// Holder styr på hvilken modus som er aktiv
let activeMode = "company";

// Bytter mellom firma-modus og kontaktperson-modus
function setMode(mode) {

  activeMode = mode;

  if (mode === "company") {

    // Aktiverer firma-tab
    companyTabBtn.classList.add("is-active");
    contactTabBtn.classList.remove("is-active");

    // Viser firma-skjema
    companyForm.classList.remove("hidden");

    // Skjuler kontaktperson-skjema
    contactForm.classList.add("hidden");

    saveCustomerBtn.textContent = "Opprett firma";

  } else {

    // Aktiverer kontaktperson-tab
    contactTabBtn.classList.add("is-active");
    companyTabBtn.classList.remove("is-active");

    // Viser kontaktperson-skjema
    contactForm.classList.remove("hidden");

    // Skjuler firma-skjema
    companyForm.classList.add("hidden");

    saveCustomerBtn.textContent = "Opprett kontaktperson";

    // Laster inn firmaer i dropdown
    loadCompaniesIntoDropdown();
  }

  customerModalState.textContent = "";
}

// Henter alle firmaer fra Firestore og legger dem inn i dropdown
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

// Åpner modal
function openCustomerModal() {

  createCustomerModal.classList.remove("is-hidden");

  // Standardmodus er firma
  setMode("company");
}

// Lukker modal
function closeCustomerModalFn() {

  createCustomerModal.classList.add("is-hidden");

  clearForms();
}

// Nullstiller alle inputfelt
function clearForms() {

  if (companyNameInput) companyNameInput.value = "";

  if (customerNameInput) customerNameInput.value = "";

  if (customerEmailInput) customerEmailInput.value = "";

  if (customerPasswordInput) customerPasswordInput.value = "";

  if (customerCompanySelect) customerCompanySelect.value = "";

  if (customerModalState) customerModalState.textContent = "";
}

// Oppretter nytt firma i Firestore
async function createCompany() {

  const companyName = companyNameInput.value.trim();

  // Sjekker at firmanavn er fylt inn
  if (!companyName) {

    customerModalState.textContent = "Skriv inn firmanavn.";

    return;
  }

  saveCustomerBtn.disabled = true;
  saveCustomerBtn.textContent = "Oppretter...";

  try {

    // Lagrer firma i Firestore
    await addDoc(collection(db, "companies"), {

      name: companyName,

      kundeBeskrivelse: "",

      createdAt: serverTimestamp(),

      createdBy: localStorage.getItem("employee_uid") || null

    });

    customerModalState.textContent = "Firma opprettet.";

    companyNameInput.value = "";

    // Oppdaterer dropdown
    await loadCompaniesIntoDropdown();

  } catch (error) {

    console.error("Feil ved oppretting av firma:", error);

    customerModalState.textContent = "Kunne ikke opprette firma.";

  } finally {

    saveCustomerBtn.disabled = false;

    saveCustomerBtn.textContent = "Opprett firma";
  }
}

// Oppretter ny kontaktperson
async function createContactPerson() {

  const name = customerNameInput.value.trim();
  const email = customerEmailInput.value.trim();
  const password = customerPasswordInput.value.trim();
  const companyId = customerCompanySelect.value;

  // Validering av felter
  if (!name || !email || !password || !companyId) {

    customerModalState.textContent = "Fyll ut alle feltene.";

    return;
  }

  saveCustomerBtn.disabled = true;
  saveCustomerBtn.textContent = "Oppretter...";

  try {

    // Oppretter bruker i Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    const customerUser = userCredential.user;

    // Lagrer brukerdata i Firestore
    await setDoc(doc(db, "users", customerUser.uid), {

      name,

      email,

      role: "customer",

      companyId,

      projectIds: [],

      createdAt: serverTimestamp(),

      createdBy: localStorage.getItem("employee_uid") || null

    });

    // Logger ut sekundær auth
    await signOut(secondaryAuth);

    customerModalState.textContent = "Kontaktperson opprettet.";

    // Nullstiller inputfelt
    customerNameInput.value = "";
    customerEmailInput.value = "";
    customerPasswordInput.value = "";
    customerCompanySelect.value = "";

  } catch (error) {

    console.error("Feil ved oppretting av kontaktperson:", error);

    customerModalState.textContent =
      "Kunne ikke opprette kontaktperson: " + error.message;

  } finally {

    saveCustomerBtn.disabled = false;

    saveCustomerBtn.textContent = "Opprett kontaktperson";
  }
}

// Åpner modal
if (createCustomerBtn) {
  createCustomerBtn.addEventListener("click", openCustomerModal);
}

// Lukker modal
if (closeCustomerModal) {
  closeCustomerModal.addEventListener("click", closeCustomerModalFn);
}

// Avbryt-knapp
if (cancelCustomerModal) {
  cancelCustomerModal.addEventListener("click", closeCustomerModalFn);
}

// Bytter til firma-modus
if (companyTabBtn) {
  companyTabBtn.addEventListener("click", () => setMode("company"));
}

// Bytter til kontaktperson-modus
if (contactTabBtn) {
  contactTabBtn.addEventListener("click", () => setMode("contact"));
}

// Lukker modal ved klikk utenfor boksen
if (createCustomerModal) {

  createCustomerModal.addEventListener("click", (e) => {

    if (e.target === createCustomerModal) {
      closeCustomerModalFn();
    }
  });
}

// Oppretter firma eller kontaktperson basert på valgt modus
if (saveCustomerBtn) {

  saveCustomerBtn.addEventListener("click", async () => {

    if (activeMode === "company") {

      await createCompany();

    } else {

      await createContactPerson();
    }
  });
}