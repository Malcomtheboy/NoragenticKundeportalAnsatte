import { auth, db } from "./firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  updateDoc
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

let currentProjectId = null;
let allEmployees = [];

/* =========================================================
   HELPERS
========================================================= */
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRole(role) {
  if (!role) return "Ansatt";
  if (role === "owner") return "Owner";
  if (role === "employee") return "Ansatt";
  return role;
}

function getInitials(name) {
  if (!name || !name.trim()) return "U";

  return name
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isAllowedRole(role) {
  return role === "employee" || role === "owner";
}

function isUserOnProject(user, projectId) {
  if (!user || !projectId) return false;

  if (Array.isArray(user.projectIds) && user.projectIds.includes(projectId)) {
    return true;
  }

  return false;
}

/* =========================================================
   RENDER
========================================================= */
function renderLoading() {
  if (!teamPlaceholder) return;
  teamPlaceholder.className = "team-loading";
  teamPlaceholder.innerHTML = "Laster ansatte...";
}

function renderError() {
  if (!teamPlaceholder) return;
  teamPlaceholder.className = "team-error";
  teamPlaceholder.innerHTML = "Kunne ikke laste ansatte.";
}

function renderEmpty() {
  if (!teamPlaceholder) return;
  teamPlaceholder.className = "team-empty";
  teamPlaceholder.innerHTML = "Ingen ansatte på prosjektet.";
}

/* =========================================================
   VIS MAX 4 + VIS MER
========================================================= */
function renderMembers(members) {
  if (!teamPlaceholder) return;

  const MAX = 4;
  const visibleMembers = members.slice(0, MAX);
  const hiddenMembers = members.slice(MAX);

  let html = `
    <div class="team-list">
      ${visibleMembers.map(member => renderMember(member)).join("")}
  `;

  if (hiddenMembers.length > 0) {
    html += `
      <div id="hiddenMembers" style="display:none;">
        ${hiddenMembers.map(member => renderMember(member)).join("")}
      </div>

      <button id="showMoreBtn" class="btn small">
        Vis flere (${hiddenMembers.length})
      </button>
    `;
  }

  html += `</div>`;

  teamPlaceholder.className = "";
  teamPlaceholder.innerHTML = html;

  /* REMOVE BUTTONS */
  teamPlaceholder.querySelectorAll(".remove-employee-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await removeEmployeeFromProject(
        btn.dataset.userId,
        btn.dataset.userName
      );
    });
  });

  /* VIS MER */
  const showMoreBtn = document.getElementById("showMoreBtn");
  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      document.getElementById("hiddenMembers").style.display = "block";
      showMoreBtn.remove();
    });
  }
}

function renderMember(member) {
  const initials = getInitials(member.name);

  return `
    <div class="team-member">
      <div class="team-member-main">
        <div class="team-avatar">${escapeHtml(initials)}</div>

        <div class="team-member-info">
          <div class="team-member-name">
            ${escapeHtml(member.name || "Ukjent")}
          </div>
          <div class="team-member-meta">
            ${escapeHtml(member.email || "")}
          </div>
        </div>
      </div>

      <div class="team-member-actions">
        <div class="team-member-role">
          ${escapeHtml(normalizeRole(member.role))}
        </div>

        <button
          class="remove-employee-btn"
          data-user-id="${member.id}"
          data-user-name="${escapeHtml(member.name || "Ansatt")}"
          type="button"
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
      name: user.name || "",
      email: user.email || "",
      role: user.role || "employee",
      projectIds: Array.isArray(user.projectIds) ? user.projectIds : []
    });
  });

  employees.sort((a, b) =>
    (a.name || "").localeCompare((b.name || ""), "no")
  );

  return employees;
}

async function loadTeamOverview(projectId) {
  if (!projectId || !teamPlaceholder) return;

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

  } catch (error) {
    console.error("Team overview error:", error);
    renderError();
  }
}

/* =========================================================
   MODAL
========================================================= */
function openEmployeeModal() {
  if (!addEmployeeModal || !employeeSelect) return;

  employeeModalState.textContent = "";
  employeeSelect.innerHTML = `<option value="">Velg ansatt</option>`;

  const available = allEmployees.filter(
    user => !isUserOnProject(user, currentProjectId)
  );

  available.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} (${user.email})`;
    employeeSelect.appendChild(option);
  });

  if (!available.length) {
    employeeModalState.textContent = "Alle ansatte er allerede lagt til.";
  }

  addEmployeeModal.classList.remove("is-hidden");
}

function closeEmployeeModal() {
  addEmployeeModal?.classList.add("is-hidden");
}

/* =========================================================
   ADD / REMOVE
========================================================= */
async function addEmployeeToProject() {
  const selectedUserId = employeeSelect.value;

  if (!selectedUserId) {
    employeeModalState.textContent = "Velg en ansatt.";
    return;
  }

  const user = allEmployees.find(u => u.id === selectedUserId);
  if (!user) return;

  try {
    saveEmployeeBtn.disabled = true;

    const updated = [...user.projectIds, currentProjectId];

    await updateDoc(doc(db, "users", selectedUserId), {
      projectIds: updated
    });

    closeEmployeeModal();
    await loadTeamOverview(currentProjectId);

  } catch (err) {
    console.error(err);
    employeeModalState.textContent = "Feil ved lagring.";
  } finally {
    saveEmployeeBtn.disabled = false;
  }
}

async function removeEmployeeFromProject(userId, userName) {
  const confirmed = confirm(`Fjern ${userName}?`);
  if (!confirmed) return;

  const user = allEmployees.find(u => u.id === userId);
  if (!user) return;

  const updated = user.projectIds.filter(id => id !== currentProjectId);

  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  await loadTeamOverview(currentProjectId);
}

/* =========================================================
   EVENTS
========================================================= */
window.addEventListener("projectChanged", async (event) => {
  await loadTeamOverview(event.detail?.projectId);
});

addEmployeeBtn?.addEventListener("click", openEmployeeModal);
closeEmployeeModalBtn?.addEventListener("click", closeEmployeeModal);
cancelEmployeeModalBtn?.addEventListener("click", closeEmployeeModal);
saveEmployeeBtn?.addEventListener("click", addEmployeeToProject);

addEmployeeModal?.addEventListener("click", (e) => {
  if (e.target === addEmployeeModal) closeEmployeeModal();
});

/* =========================================================
   INIT
========================================================= */
if (window.currentProjectId) {
  loadTeamOverview(window.currentProjectId);
}