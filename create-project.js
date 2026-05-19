// Importerer Firestore-database fra firebase-auth.js
import { db } from "./firebase-auth.js";

// Firestore-funksjoner som brukes til å opprette prosjekt
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Henter knapper og modal-elementer fra HTML
const createProjectBtn = document.getElementById("createProjectBtn");
const createProjectModal = document.getElementById("createProjectModal");
const closeProjectModal = document.getElementById("closeProjectModal");
const cancelProjectModal = document.getElementById("cancelProjectModal");
const saveProjectBtn = document.getElementById("saveProjectBtn");

// Inputfelter for prosjektdata
const projectTitleInput = document.getElementById("projectTitleInput");
const projectCustomerInput = document.getElementById("projectCustomerInput");
const projectDescriptionInput = document.getElementById("projectDescriptionInput");

// Åpner modal for opprettelse av prosjekt
function openProjectModal() {
  createProjectModal?.classList.remove("is-hidden");
}

// Lukker modal
function closeProjectModalFn() {
  createProjectModal?.classList.add("is-hidden");
}

// Nullstiller alle inputfelter
function clearProjectForm() {
  if (projectTitleInput) projectTitleInput.value = "";
  if (projectCustomerInput) projectCustomerInput.value = "";
  if (projectDescriptionInput) projectDescriptionInput.value = "";
}

// Åpner modal når brukeren trykker på "+ Prosjekt"
createProjectBtn?.addEventListener("click", openProjectModal);

// Lukker modal via X-knapp eller avbryt-knapp
closeProjectModal?.addEventListener("click", closeProjectModalFn);
cancelProjectModal?.addEventListener("click", closeProjectModalFn);

// Lukker modal dersom brukeren klikker utenfor modal-kortet
createProjectModal?.addEventListener("click", (e) => {
  if (e.target === createProjectModal) {
    closeProjectModalFn();
  }
});

// Oppretter nytt prosjekt i Firestore
saveProjectBtn?.addEventListener("click", async () => {

  // Henter verdier fra inputfeltene
  const title = projectTitleInput?.value.trim();
  const customer = projectCustomerInput?.value.trim();
  const description = projectDescriptionInput?.value.trim();

  // Sjekker at alle feltene er fylt ut
  if (!title || !customer || !description) {
    alert("Fyll ut alle feltene.");
    return;
  }

  try {
    // Deaktiverer knapp mens prosjektet opprettes
    saveProjectBtn.disabled = true;
    saveProjectBtn.textContent = "Oppretter...";

    // Oppretter nytt dokument i projects-collection
    const docRef = await addDoc(collection(db, "projects"), {

      // Grunnleggende prosjektinformasjon
      name: title,
      customerName: customer,
      description: description,

      // Standardverdier ved opprettelse
      status: "Aktiv",
      manualProgress: 0,
      durationDays: 90,

      // Metadata
      createdAt: serverTimestamp(),
      createdBy: localStorage.getItem("employee_uid") || null,

      // Lister for ansatte og kunder koblet til prosjektet
      employeeIds: [],
      customerIds: []
    });

    // Viser prosjekt-ID til brukeren
    alert(`Prosjekt opprettet! Prosjekt-ID: ${docRef.id}`);

    // Nullstiller skjema og lukker modal
    clearProjectForm();
    closeProjectModalFn();

    // Oppdaterer siden slik at nytt prosjekt vises direkte
    window.location.reload();

  } catch (error) {

    // Logger feil i console og viser feilmelding
    console.error("Feil ved oppretting av prosjekt:", error);
    alert("Kunne ikke opprette prosjekt.");

  } finally {

    // Aktiverer knappen igjen etter prosessen er ferdig
    saveProjectBtn.disabled = false;
    saveProjectBtn.textContent = "Opprett prosjekt";
  }
});