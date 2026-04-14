import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

  if (typeof user.projectId === "string" && user.projectId === projectId) {
    return true;
  }

  return false;
}

async function ensureFirebaseLogin() {
  try {
    if (!auth.currentUser) {
      await signInWithEmailAndPassword(auth, "test@test.no", "123456");
    }
  } catch (e) {
    console.error("Firebase login feilet:", e);
  }
}

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
  teamPlaceholder.innerHTML = "Ingen ansatte er koblet til dette prosjektet ennå.";
}

function renderMembers(members) {
  if (!teamPlaceholder) return;

  const html = `
    <div class="team-list">
      ${members.map((member) => {
        const initials = getInitials(member.name);

        return `
          <div class="team-member">
            <div class="team-member-main">
              <div class="team-avatar">${escapeHtml(initials)}</div>

              <div class="team-member-info">
                <div class="team-member-name">
                  ${escapeHtml(member.name || "Ukjent navn")}
                </div>
                <div class="team-member-meta">
                  ${escapeHtml(member.email || "Ingen e-post registrert")}
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
      }).join("")}
    </div>
  `;

  teamPlaceholder.className = "";
  teamPlaceholder.innerHTML = html;

  teamPlaceholder.querySelectorAll(".remove-employee-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await removeEmployeeFromProject(
        btn.dataset.userId,
        btn.dataset.userName
      );
    });
  });
}

async function fetchAllEmployees() {
  const snapshot = await getDocs(collection(db, "users"));
  const employees = [];

  snapshot.forEach((docSnap) => {
    const user = docSnap.data();

    if (!isAllowedRole(user.role)) return;

    employees.push({
      id: docSnap.id,
      name: user.name || "",
      email: user.email || "",
      role: user.role || "employee",
      projectIds: Array.isArray(user.projectIds) ? user.projectIds : [],
      projectId: typeof user.projectId === "string" ? user.projectId : ""
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
    await ensureFirebaseLogin();

    allEmployees = await fetchAllEmployees();

    const members = allEmployees.filter((user) =>
      isUserOnProject(user, projectId)
    );

    if (members.length === 0) {
      renderEmpty();
      return;
    }

    renderMembers(members);
  } catch (error) {
    console.error("Team overview error:", error);
    renderError();
  }
}

function openEmployeeModal() {
  if (!addEmployeeModal || !employeeSelect) return;

  employeeModalState.textContent = "";
  employeeSelect.innerHTML = `<option value="">Velg ansatt</option>`;

  const availableEmployees = allEmployees.filter(
    (user) => !isUserOnProject(user, currentProjectId)
  );

  availableEmployees.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name || "Ukjent navn"} (${user.email || "ingen e-post"})`;
    employeeSelect.appendChild(option);
  });

  if (availableEmployees.length === 0) {
    employeeModalState.textContent = "Alle ansatte er allerede lagt til på dette prosjektet.";
  }

  addEmployeeModal.classList.remove("is-hidden");
}

function closeEmployeeModal() {
  if (!addEmployeeModal) return;
  addEmployeeModal.classList.add("is-hidden");
}

async function addEmployeeToProject() {
  if (!employeeSelect || !currentProjectId) return;

  const selectedUserId = employeeSelect.value;

  if (!selectedUserId) {
    employeeModalState.textContent = "Velg en ansatt først.";
    return;
  }

  const selectedUser = allEmployees.find((user) => user.id === selectedUserId);

  if (!selectedUser) {
    employeeModalState.textContent = "Fant ikke valgt ansatt.";
    return;
  }

  try {
    saveEmployeeBtn.disabled = true;
    employeeModalState.textContent = "Lagrer...";

    const currentIds = Array.isArray(selectedUser.projectIds)
      ? [...selectedUser.projectIds]
      : [];

    if (!currentIds.includes(currentProjectId)) {
      currentIds.push(currentProjectId);
    }

    await updateDoc(doc(db, "users", selectedUserId), {
      projectIds: currentIds
    });

    closeEmployeeModal();
    await loadTeamOverview(currentProjectId);
  } catch (error) {
    console.error("Add employee error:", error);
    employeeModalState.textContent = "Kunne ikke legge til ansatt.";
  } finally {
    saveEmployeeBtn.disabled = false;
  }
}

async function removeEmployeeFromProject(userId, userName) {
  if (!userId || !currentProjectId) return;

  const confirmed = confirm(`Fjern ${userName || "den ansatte"} fra prosjektet?`);
  if (!confirmed) return;

  const selectedUser = allEmployees.find((user) => user.id === userId);
  if (!selectedUser) return;

  try {
    const currentIds = Array.isArray(selectedUser.projectIds)
      ? [...selectedUser.projectIds]
      : [];

    const updatedIds = currentIds.filter((projectId) => projectId !== currentProjectId);

    await updateDoc(doc(db, "users", userId), {
      projectIds: updatedIds
    });

    await loadTeamOverview(currentProjectId);
  } catch (error) {
    console.error("Remove employee error:", error);
    alert("Kunne ikke fjerne ansatt fra prosjektet.");
  }
}

window.addEventListener("projectChanged", async (event) => {
  const projectId = event.detail?.projectId;
  await loadTeamOverview(projectId);
});

if (addEmployeeBtn) {
  addEmployeeBtn.addEventListener("click", openEmployeeModal);
}

if (closeEmployeeModalBtn) {
  closeEmployeeModalBtn.addEventListener("click", closeEmployeeModal);
}

if (cancelEmployeeModalBtn) {
  cancelEmployeeModalBtn.addEventListener("click", closeEmployeeModal);
}

if (saveEmployeeBtn) {
  saveEmployeeBtn.addEventListener("click", addEmployeeToProject);
}

if (addEmployeeModal) {
  addEmployeeModal.addEventListener("click", (event) => {
    if (event.target === addEmployeeModal) {
      closeEmployeeModal();
    }
  });
}

async function initTeamOverview() {
  await ensureFirebaseLogin();

  if (window.currentProjectId) {
    await loadTeamOverview(window.currentProjectId);
  }
}

initTeamOverview();