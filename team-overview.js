/* =========================================================
   IMPORTS
========================================================= */
// Henter Firebase auth + Firestore-instans
import { auth, db } from "./firebase-auth.js";

// Firestore-funksjoner som brukes i filen
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   ELEMENTER
========================================================= */
// DOM-elementer fra HTML
const teamPlaceholder = document.getElementById("teamPlaceholder");
const addEmployeeBtn = document.getElementById("addEmployeeBtn");
const addEmployeeModal = document.getElementById("addEmployeeModal");
const closeEmployeeModalBtn = document.getElementById("closeEmployeeModalBtn");
const cancelEmployeeModalBtn = document.getElementById("cancelEmployeeModalBtn");
const saveEmployeeBtn = document.getElementById("saveEmployeeBtn");
const employeeSelect = document.getElementById("employeeSelect");
const employeeModalState = document.getElementById("employeeModalState");
const employeeSearchInput = document.getElementById("employeeSearchInput");

// Global state
let currentProjectId = null;
let allEmployees = [];

/* =========================================================
   HELPERS
========================================================= */

/**
 * Escaper HTML for å unngå XSS
 */
function escapeHtml(text) {
  if (!text) return "";

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Gjør interne roller mer lesbare
 */
function normalizeRole(role) {
  if (role === "owner") return "Owner";
  if (role === "employee") return "Ansatt";

  return "Ansatt";
}

/**
 * Lager initialer fra navn
 * "Ola Nordmann" -> "ON"
 */
function getInitials(name) {
  if (!name) return "U";

  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Sjekker om rolle er gyldig
 */
function isAllowedRole(role) {
  return role === "employee" || role === "owner";
}

/**
 * Sjekker om bruker er på prosjektet
 */
function isUserOnProject(user, projectId) {
  return user.projectIds?.includes(projectId);
}

/* =========================================================
   RENDER STATES
========================================================= */

/**
 * Viser loading-state
 */
function renderLoading() {
  teamPlaceholder.className = "team-loading";
  teamPlaceholder.innerHTML = "Laster ansatte...";
}

/**
 * Viser tom-state
 */
function renderEmpty() {
  teamPlaceholder.className = "team-empty";
  teamPlaceholder.innerHTML = "Ingen ansatte på prosjektet.";
}

/**
 * Viser feilmelding
 */
function renderError() {
  teamPlaceholder.className = "team-error";
  teamPlaceholder.innerHTML = "Kunne ikke laste ansatte.";
}

/* =========================================================
   RENDER MEMBERS
========================================================= */

/**
 * Renderer liste over medlemmer
 * Har støtte for "vis flere/færre"
 */
function renderMembers(members, showAll = false) {
  const MAX = 3;

  // Viser kun MAX medlemmer hvis showAll=false
  const visibleMembers = showAll
    ? members
    : members.slice(0, MAX);

  const hiddenCount = members.length - MAX;

  // Bygger HTML
  let html = `
    <div class="team-list">
      ${visibleMembers.map(member => renderMember(member)).join("")}
    </div>
  `;

  // Vis "Vis flere"-knapp hvis nødvendig
  if (members.length > MAX) {
    html += `
      <button id="toggleMembersBtn" class="btn small team-show-more-btn">
        ${showAll ? "Vis færre" : `Vis flere (${hiddenCount})`}
      </button>
    `;
  }

  // Oppdater UI
  teamPlaceholder.className = "";
  teamPlaceholder.innerHTML = html;

  /* REMOVE EVENTS */
  document.querySelectorAll(".remove-employee-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await removeEmployeeFromProject(
        btn.dataset.userId,
        btn.dataset.userName
      );
    });
  });

  /* TOGGLE EVENTS */
  const toggleBtn = document.getElementById("toggleMembersBtn");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      renderMembers(members, !showAll);
    });
  }
}

/**
 * Renderer én ansatt
 */
function renderMember(member) {
  const initials = getInitials(member.name);

  return `
    <div class="team-member">

      <div class="team-member-main">

        <!-- Avatar -->
        <div class="team-avatar">
          ${initials}
        </div>

        <!-- Info -->
        <div class="team-member-info">

          <div class="team-member-name">
            ${escapeHtml(member.name)}
          </div>

          <div class="team-member-meta">
            ${escapeHtml(member.email)}
          </div>

        </div>
      </div>

      <!-- Actions -->
      <div class="team-member-actions">

        <div class="team-member-role">
          ${normalizeRole(member.role)}
        </div>

        <button
          class="remove-employee-btn"
          data-user-id="${member.id}"
          data-user-name="${escapeHtml(member.name)}"
        >
          Fjern
        </button>

      </div>
    </div>
  `;
}

/* =========================================================
   DATA
========================================================= */

/**
 * Henter alle ansatte fra Firestore
 */
async function fetchAllEmployees() {
  const snapshot = await getDocs(collection(db, "users"));

  const employees = [];

  snapshot.forEach(docSnap => {
    const user = docSnap.data();

    // Hopper over ugyldige roller
    if (!isAllowedRole(user.role)) return;

    employees.push({
      id: docSnap.id,
      name: user.name,
      email: user.email,
      role: user.role,
      projectIds: user.projectIds || []
    });
  });

  // Sorterer alfabetisk
  return employees.sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Laster teamoversikt for prosjekt
 */
async function loadTeamOverview(projectId) {
  if (!projectId) return;

  currentProjectId = projectId;

  renderLoading();

  try {
    // Hent ansatte
    allEmployees = await fetchAllEmployees();

    // Filtrer ansatte på prosjekt
    const members = allEmployees.filter(user =>
      isUserOnProject(user, projectId)
    );

    // Hvis ingen ansatte
    if (!members.length) {
      renderEmpty();
      return;
    }

    // Render liste
    renderMembers(members);

  } catch (err) {
    console.error(err);

    renderError();
  }
}

/* =========================================================
   MODAL
========================================================= */

/**
 * Åpner modal
 */
function openEmployeeModal() {

  // Nullstill søk
  if (employeeSearchInput) {
    employeeSearchInput.value = "";
  }

  // Render ansatte
  renderEmployeeOptions();

  // Vis modal
  addEmployeeModal.classList.remove("is-hidden");

  // Fokus på søkefelt
  setTimeout(() => {
    employeeSearchInput?.focus();
  }, 0);
}

/**
 * Lukker modal
 */
function closeEmployeeModal() {
  addEmployeeModal.classList.add("is-hidden");
}

/* =========================================================
   ADD / REMOVE
========================================================= */

/**
 * Legger ansatt til prosjekt
 */
async function addEmployeeToProject() {

  const userId = employeeSelect.value;

  // Ingen valgt
  if (!userId) {
    employeeModalState.textContent = "Velg ansatt.";
    return;
  }

  // Finn bruker
  const user = allEmployees.find(u => u.id === userId);

  if (!user) return;

  // Oppdater brukerens projectIds
  const updated = [...user.projectIds, currentProjectId];

  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  // Hent prosjektdata
  const projectSnap = await getDoc(
    doc(db, "projects", currentProjectId)
  );

  const projectData = projectSnap.exists()
    ? projectSnap.data()
    : {};

  const employeeIds = Array.isArray(projectData.employeeIds)
    ? projectData.employeeIds
    : [];

  // Oppdater prosjektets employeeIds
  await updateDoc(doc(db, "projects", currentProjectId), {
    employeeIds: employeeIds.includes(userId)
      ? employeeIds
      : [...employeeIds, userId]
  });

  // Lukk modal og reload UI
  closeEmployeeModal();

  loadTeamOverview(currentProjectId);
}

/**
 * Fjerner ansatt fra prosjekt
 */
async function removeEmployeeFromProject(userId, userName) {

  // Bekreftelse
  if (!confirm(`Fjern ${userName}?`)) return;

  // Finn bruker
  const user = allEmployees.find(u => u.id === userId);

  if (!user) return;

  // Fjern prosjekt-ID
  const updated = user.projectIds.filter(
    id => id !== currentProjectId
  );

  // Oppdater bruker
  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  // Hent prosjekt
  const projectSnap = await getDoc(
    doc(db, "projects", currentProjectId)
  );

  const projectData = projectSnap.exists()
    ? projectSnap.data()
    : {};

  const employeeIds = Array.isArray(projectData.employeeIds)
    ? projectData.employeeIds
    : [];

  // Fjern ansatt fra prosjekt
  await updateDoc(doc(db, "projects", currentProjectId), {
    employeeIds: employeeIds.filter(
      id => id !== userId
    )
  });

  // Reload UI
  loadTeamOverview(currentProjectId);
}

/**
 * Renderer dropdown med ansatte
 */
function renderEmployeeOptions(searchTerm = "") {

  // Nullstill select
  employeeSelect.innerHTML =
    `<option value="">Velg ansatt</option>`;

  const search = searchTerm
    .trim()
    .toLowerCase();

  // Filtrer ansatte
  const available = allEmployees.filter(user => {

    // Skjul ansatte allerede på prosjekt
    if (isUserOnProject(user, currentProjectId)) {
      return false;
    }

    const name = (user.name || "").toLowerCase();
    const email = (user.email || "").toLowerCase();

    // Match søk
    return (
      !search ||
      name.includes(search) ||
      email.includes(search)
    );
  });

  // Legg til options
  available.forEach(user => {

    const option = document.createElement("option");

    option.value = user.id;

    option.textContent =
      `${user.name} (${user.email})`;

    employeeSelect.appendChild(option);
  });

  // Statusmelding
  employeeModalState.textContent = available.length
    ? ""
    : search
      ? "Ingen ansatte matcher søket."
      : "Alle ansatte er lagt til.";
}

/* =========================================================
   EVENTS
========================================================= */

// Når prosjekt endres
window.addEventListener("projectChanged", (e) => {
  loadTeamOverview(e.detail.projectId);
});

// Modal-knapper
addEmployeeBtn?.addEventListener(
  "click",
  openEmployeeModal
);

closeEmployeeModalBtn?.addEventListener(
  "click",
  closeEmployeeModal
);

cancelEmployeeModalBtn?.addEventListener(
  "click",
  closeEmployeeModal
);

// Lagre ansatt
saveEmployeeBtn?.addEventListener(
  "click",
  addEmployeeToProject
);

// Klikk utenfor modal lukker modal
addEmployeeModal?.addEventListener("click", (e) => {
  if (e.target === addEmployeeModal) {
    closeEmployeeModal();
  }
});

// Live s øk
employeeSearchInput?.addEventListener("input", () => {
  renderEmployeeOptions(employeeSearchInput.value);
});

/* =========================================================
   INIT
========================================================= */

// Last team
if (window.currentProjectId) {
  loadTeamOverview(window.currentProjectId);
}
