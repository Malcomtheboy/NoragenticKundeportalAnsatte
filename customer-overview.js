import { db } from "./firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   ELEMENTER
========================================================= */
const customerPlaceholder = document.getElementById("customerPlaceholder");
const addCustomerToProjectBtn = document.getElementById("addCustomerToProjectBtn");
const addCustomerModal = document.getElementById("addCustomerModal");
const closeCustomerProjectModalBtn = document.getElementById("closeCustomerProjectModalBtn");
const cancelCustomerProjectModalBtn = document.getElementById("cancelCustomerProjectModalBtn");
const saveCustomerProjectBtn = document.getElementById("saveCustomerProjectBtn");
const customerProjectSelectModal = document.getElementById("customerProjectSelectModal");
const customerProjectModalState = document.getElementById("customerProjectModalState");

let currentProjectId = null;
let allCustomers = [];

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

function getInitials(name) {
  if (!name) return "K";
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isAllowedRole(role) {
  return role === "customer";
}

function isUserOnProject(user, projectId) {
  return user.projectIds?.includes(projectId);
}

/* =========================================================
   RENDER STATES
========================================================= */
function renderLoading() {
  customerPlaceholder.className = "team-loading";
  customerPlaceholder.innerHTML = "Laster kunder...";
}

function renderEmpty() {
  customerPlaceholder.className = "team-empty";
  customerPlaceholder.innerHTML = "Ingen kunder på prosjektet.";
}

function renderError() {
  customerPlaceholder.className = "team-error";
  customerPlaceholder.innerHTML = "Kunne ikke laste kunder.";
}

/* =========================================================
   RENDER MEMBERS
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
      <button id="toggleCustomersBtn" class="btn small team-show-more-btn">
        ${showAll ? "Vis færre" : `Vis flere (${hiddenCount})`}
      </button>
    `;
  }

  customerPlaceholder.className = "";
  customerPlaceholder.innerHTML = html;

  document.querySelectorAll(".remove-customer-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await removeCustomerFromProject(
        btn.dataset.userId,
        btn.dataset.userName
      );
    });
  });

  const toggleBtn = document.getElementById("toggleCustomersBtn");
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
          Kunde
        </div>

        <button
          class="remove-customer-btn"
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
async function fetchAllCustomers() {
  const snapshot = await getDocs(collection(db, "users"));

  const customers = [];

  snapshot.forEach(docSnap => {
    const user = docSnap.data();

    if (!isAllowedRole(user.role)) return;

    customers.push({
      id: docSnap.id,
      name: user.name,
      email: user.email,
      role: user.role,
      projectIds: user.projectIds || []
    });
  });

  return customers.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadCustomerOverview(projectId) {
  if (!projectId) return;

  currentProjectId = projectId;
  renderLoading();

  try {
    allCustomers = await fetchAllCustomers();

    const members = allCustomers.filter(user =>
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
function openCustomerModal() {
  customerProjectSelectModal.innerHTML = `<option value="">Velg kunde</option>`;

  const available = allCustomers.filter(
    user => !isUserOnProject(user, currentProjectId)
  );

  available.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} (${user.email})`;
    customerProjectSelectModal.appendChild(option);
  });

  if (!available.length) {
    customerProjectModalState.textContent = "Alle kunder er lagt til.";
  } else {
    customerProjectModalState.textContent = "";
  }

  addCustomerModal.classList.remove("is-hidden");
}

function closeCustomerModal() {
  addCustomerModal.classList.add("is-hidden");
}

/* =========================================================
   ADD / REMOVE
========================================================= */
async function addCustomerToProject() {
  const userId = customerProjectSelectModal.value;

  if (!userId) {
    customerProjectModalState.textContent = "Velg kunde.";
    return;
  }

  const user = allCustomers.find(u => u.id === userId);
  if (!user) return;

  const updated = [...user.projectIds, currentProjectId];

  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  closeCustomerModal();
  loadCustomerOverview(currentProjectId);
}

async function removeCustomerFromProject(userId, userName) {
  if (!confirm(`Fjern ${userName}?`)) return;

  const user = allCustomers.find(u => u.id === userId);
  if (!user) return;

  const updated = user.projectIds.filter(id => id !== currentProjectId);

  await updateDoc(doc(db, "users", userId), {
    projectIds: updated
  });

  loadCustomerOverview(currentProjectId);
}

/* =========================================================
   EVENTS
========================================================= */
window.addEventListener("projectChanged", (e) => {
  loadCustomerOverview(e.detail.projectId);
});

addCustomerToProjectBtn?.addEventListener("click", openCustomerModal);
closeCustomerProjectModalBtn?.addEventListener("click", closeCustomerModal);
cancelCustomerProjectModalBtn?.addEventListener("click", closeCustomerModal);
saveCustomerProjectBtn?.addEventListener("click", addCustomerToProject);

addCustomerModal?.addEventListener("click", (e) => {
  if (e.target === addCustomerModal) closeCustomerModal();
});

/* =========================================================
   INIT
========================================================= */
if (window.currentProjectId) {
  loadCustomerOverview(window.currentProjectId);
}
