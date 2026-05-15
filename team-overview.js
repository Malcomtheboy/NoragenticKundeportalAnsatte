import { auth, db } from "./firebase-auth.js";

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
const teamPlaceholder = document.getElementById("teamPlaceholder");
const addEmployeeBtn = document.getElementById("addEmployeeBtn");
const addEmployeeModal = document.getElementById("addEmployeeModal");
const closeEmployeeModalBtn = document.getElementById("closeEmployeeModalBtn");
const cancelEmployeeModalBtn = document.getElementById("cancelEmployeeModalBtn");
const saveEmployeeBtn = document.getElementById("saveEmployeeBtn");
const employeeSelect = document.getElementById("employeeSelect");
const employeeModalState = document.getElementById("employeeModalState");
const employeeSearchInput = document.getElementById("employeeSearchInput");

let currentProjectId = null;
let allEmployees = [];

/* =========================================================
   HELPERS
========================================================= */
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRole(role) {
  if (role === "owner") return "Owner";
  if (role === "employee") return "Ansatt";
  return "Ansatt";
}

function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isAllowedRole(role) {
  return role === "employee" || role === "owner";
}

function isUserOnProject(user, projectId) {
  return user.projectIds?.includes(projectId);
}

/* =========================================================
   RENDER STATES
========================================================= */
function renderLoading() {
  teamPlaceholder.className = "team-loading";
  teamPlaceholder.innerHTML = "Laster ansatte...";
}

function renderEmpty() {
  teamPlaceholder.className = "team-empty";
  teamPlaceholder.innerHTML = "Ingen ansatte på prosjektet.";
}

function renderError() {
  teamPlaceholder.className = "team-error";
  teamPlaceholder.innerHTML = "Kunne ikke laste ansatte.";
}

/* =========================================================
   RENDER MEMBERS + VIS MER / FÆRRE
========================================================= */
function renderMembers(members, showAll = false) {
  const MAX = 3;

  const visibleMembers = showAll ? members : members.slice(0, MAX);
  const hiddenCount = members.length - MAX;

  let html = `
    <div class="team-list">
      ${visibleMembers.map(member => renderMember(member)).join("")}
    </div>
  `;

  if (members.length > MAX) {
    html += `
      <button id="toggleMembersBtn" class="btn small team-show-more-btn">
        ${showAll ? "Vis færre" : `Vis flere (${hiddenCount})`}
      </button>
    `;
  }

  teamPlaceholder.className = "";
  teamPlaceholder.innerHTML = html;

  /* REMOVE */
  document.querySelectorAll(".remove-employee-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await removeEmployeeFromProject(
        btn.dataset.userId,
        btn.dataset.userName
      );
    });
  });

  /* TOGGLE */
  const toggleBtn = document.getElementById("toggleMembersBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      renderMembers(members, !showAll);
    });
  }
}

function renderMember(member) {
  const initials = getInitials(member.name);

  return `
    <div class="team-member">
      <div class="team-member-main">
        <div class="team-avatar">${initials}</div>

        <div class="team-member-info">
          <div class="team-member-name">
            ${escapeHtml(member.name)}
          </div>
          <div class="team-member-meta">
            ${escapeHtml(member.email)}
          </div>
        </div>
      </div>

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
async function fetchAllEmployees() {
  const snapshot = await getDocs(collection(db, "users"));

  const employees = [];

  snapshot.forEach(docSnap => {
    const user = docSnap.data();

    if (!isAllowedRole(user.role)) return;

    employees.push({
      id: docSnap.id,
      name: user.name,
      email: user.email,
      role: user.role,
      projectIds: user.projectIds || []
    });
  });

  return employees.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTeamOverview(projectId) {
  if (!projectId) return;

  currentProjectId = projectId;
  renderLoading();

  try {
    allEmployees = await fetchAllEmployees();

    const members = allEmployees.filter(user =>
      isUserOnProject(user, projectId)
    );

    if (!members.length) {
      renderEmpty();
      return;
    }

    renderMembers(members);

  } catch (err) {
    console.error(err);
    renderError();
  }
}

/* =========================================================
   MODAL
========================================================= */
function openEmployeeModal() {
  if (employeeSearchInput) {
    employeeSearchInput.value = "";
  }

  renderEmployeeOptions();

  addEmployeeModal.classList.remove("is-hidden");

  setTimeout(() => {
    employeeSearchInput?.focus();
  }, 0);
}

function closeEmployeeModal() {
  addEmployeeModal.classList.add("is-hidden");
}

/* =========================================================
   ADD / REMOVE
========================================================= */
async function addEmployeeToProject() {
  const userId = employeeSelect.value;

  if (!userId) {
    employeeModalState.textContent = "Velg ansatt.";
    return;
  }

  const user = allEmployees.find(u => u.id === userId);
  if (!user) return;

  const updated = [...user.projectIds, currentProjectId];

  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  const projectSnap = await getDoc(doc(db, "projects", currentProjectId));
  const projectData = projectSnap.exists() ? projectSnap.data() : {};
  const employeeIds = Array.isArray(projectData.employeeIds) ? projectData.employeeIds : [];

  await updateDoc(doc(db, "projects", currentProjectId), {
    employeeIds: employeeIds.includes(userId)
      ? employeeIds
      : [...employeeIds, userId]
  });


  closeEmployeeModal();
  loadTeamOverview(currentProjectId);
}

async function removeEmployeeFromProject(userId, userName) {
  if (!confirm(`Fjern ${userName}?`)) return;

  const user = allEmployees.find(u => u.id === userId);
  if (!user) return;

  const updated = user.projectIds.filter(id => id !== currentProjectId);

  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  const projectSnap = await getDoc(doc(db, "projects", currentProjectId));
  const projectData = projectSnap.exists() ? projectSnap.data() : {};
  const employeeIds = Array.isArray(projectData.employeeIds) ? projectData.employeeIds : [];

  await updateDoc(doc(db, "projects", currentProjectId), {
    employeeIds: employeeIds.filter(id => id !== userId)
  });


  loadTeamOverview(currentProjectId);
}
function renderEmployeeOptions(searchTerm = "") {
  employeeSelect.innerHTML = `<option value="">Velg ansatt</option>`;

  const search = searchTerm.trim().toLowerCase();

  const available = allEmployees.filter(user => {
    if (isUserOnProject(user, currentProjectId)) return false;

    const name = (user.name || "").toLowerCase();
    const email = (user.email || "").toLowerCase();

    return !search || name.includes(search) || email.includes(search);
  });

  available.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} (${user.email})`;
    employeeSelect.appendChild(option);
  });

  employeeModalState.textContent = available.length
    ? ""
    : search
      ? "Ingen ansatte matcher søket."
      : "Alle ansatte er lagt til.";
}
/* =========================================================
   EVENTS
========================================================= */
window.addEventListener("projectChanged", (e) => {
  loadTeamOverview(e.detail.projectId);
});

addEmployeeBtn?.addEventListener("click", openEmployeeModal);
closeEmployeeModalBtn?.addEventListener("click", closeEmployeeModal);
cancelEmployeeModalBtn?.addEventListener("click", closeEmployeeModal);
saveEmployeeBtn?.addEventListener("click", addEmployeeToProject);

addEmployeeModal?.addEventListener("click", (e) => {
  if (e.target === addEmployeeModal) closeEmployeeModal();
});

employeeSearchInput?.addEventListener("input", () => {
  renderEmployeeOptions(employeeSearchInput.value);
});
/* =========================================================
   INIT
========================================================= */
if (window.currentProjectId) {
  loadTeamOverview(window.currentProjectId);
}

