import { auth, db } from "./firebase-auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const notificationBox = document.getElementById("notificationBox");
const notificationList = document.getElementById("notificationList");
const landingProjectsGrid = document.getElementById("landingProjectsGrid");
const welcomeText = document.getElementById("welcomeText");
const openHiddenProjectsBtn = document.getElementById("openHiddenProjectsBtn");
const hiddenProjectsModal = document.getElementById("hiddenProjectsModal");
const closeHiddenProjectsBtn = document.getElementById("closeHiddenProjectsBtn");
const hiddenProjectsList = document.getElementById("hiddenProjectsList");

let allLoadedProjects = [];
let currentUserId = null;

function escapeHtml(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderError(message = "Kunne ikke laste prosjekter.") {
  if (!landingProjectsGrid) return;

  landingProjectsGrid.innerHTML = `
    <div class="error-state">${escapeHtml(message)}</div>
  `;
}

function renderEmpty(message = "Ingen prosjekter funnet.") {
  if (!landingProjectsGrid) return;

  landingProjectsGrid.innerHTML = `
    <div class="empty-state">${escapeHtml(message)}</div>
  `;
}

function setWelcomeText() {
  if (!welcomeText) return;

  const name = localStorage.getItem("employee_name") || "";

  if (!name.trim()) {
    welcomeText.textContent = "Velkommen";
    return;
  }

  const firstName = name.trim().split(" ")[0];
  welcomeText.textContent = `Velkommen ${firstName}`;
}

/* =========================================================
   SKJULTE PROSJEKTER
========================================================= */
function getHiddenProjects(userId) {
  const key = `hidden_projects_${userId}`;
  const stored = localStorage.getItem(key);

  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveHiddenProjects(userId, ids) {
  const key = `hidden_projects_${userId}`;
  localStorage.setItem(key, JSON.stringify(ids));
}

function hideProject(userId, projectId) {
  const hiddenProjects = getHiddenProjects(userId);

  if (!hiddenProjects.includes(projectId)) {
    hiddenProjects.push(projectId);
    saveHiddenProjects(userId, hiddenProjects);
  }
}

/* =========================================================
   PROSJEKTKORT
========================================================= */
function renderProjects(projects, userId) {
  if (!landingProjectsGrid) return;

  if (!projects.length) {
    renderEmpty("Alle prosjekter er skjult.");
    return;
  }

  landingProjectsGrid.innerHTML = projects.map(project => {
    const progress =
      typeof project.manualProgress === "number"
        ? project.manualProgress
        : typeof project.progress === "number"
          ? project.progress
          : 0;

    const safeProgress = Math.max(0, Math.min(100, progress));

    return `
      <div class="landing-project-card card fade-in" data-project-id="${escapeHtml(project.id)}">
        <div class="landing-project-top">
          <div>
            <div class="landing-project-title">
              ${escapeHtml(project.name || "Uten navn")}
            </div>
            <div class="landing-project-customer">
              ${escapeHtml(project.customerName || "Ingen kunde registrert")}
            </div>
          </div>

          <div class="landing-project-percent">
            ${escapeHtml(safeProgress)}%
          </div>
        </div>

        <div class="landing-project-description">
          ${escapeHtml(project.description || project.goal || project.goalText || "Ingen beskrivelse lagt inn.")}
        </div>

        <div class="landing-project-bar">
          <div class="landing-project-bar-fill" style="width:${safeProgress}%"></div>
        </div>

        <div class="landing-project-bottom">
          <div class="landing-project-open">
            Åpne prosjekt →
          </div>

          <button class="btn small hide-project-btn" data-project-id="${escapeHtml(project.id)}" type="button">
            Skjul
          </button>
        </div>
      </div>
    `;
  }).join("");

  landingProjectsGrid.querySelectorAll(".landing-project-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".hide-project-btn")) return;

      localStorage.setItem("selected_project_id", card.dataset.projectId);
      window.location.href = "index.html";
    });
  });

  landingProjectsGrid.querySelectorAll(".hide-project-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const projectId = btn.dataset.projectId;
      hideProject(userId, projectId);

    const card = btn.closest(".landing-project-card");

    if (card) {
      card.classList.add("fade-out");

      setTimeout(() => {
        card.remove();

        const remaining = landingProjectsGrid.querySelectorAll(".landing-project-card");
        if (remaining.length === 0) {
          renderEmpty("Alle prosjekter er skjult.");
        }
      }, 200);
    }

      const remainingCards = landingProjectsGrid.querySelectorAll(".landing-project-card");

      if (remainingCards.length === 0) {
        renderEmpty("Alle prosjekter er skjult.");
      }
    });
  });
}

/* =========================================================
   VARSLER
========================================================= */
function getStoredProjectIds(userId) {
  const key = `known_project_ids_${userId}`;
  const stored = localStorage.getItem(key);

  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveCurrentProjectIds(userId, projectIds) {
  const key = `known_project_ids_${userId}`;
  localStorage.setItem(key, JSON.stringify(projectIds));
}

function renderProjectNotifications(userId, projects) {
  if (!notificationBox || !notificationList) return;

  const currentProjectIds = projects.map(project => project.id);
  const knownProjectIds = getStoredProjectIds(userId);

  const newProjects = projects.filter(project => {
    return !knownProjectIds.includes(project.id);
  });

  if (knownProjectIds.length === 0) {
    saveCurrentProjectIds(userId, currentProjectIds);
    notificationBox.classList.add("is-hidden");
    return;
  }

  if (newProjects.length === 0) {
    notificationBox.classList.add("is-hidden");
    saveCurrentProjectIds(userId, currentProjectIds);
    return;
  }

  notificationList.innerHTML = newProjects.map(project => `
    <div class="notification-item">
      Du har blitt lagt til i prosjektet
      <strong>${escapeHtml(project.name || "Uten navn")}</strong>.
    </div>
  `).join("");

  notificationBox.classList.remove("is-hidden");

  saveCurrentProjectIds(userId, currentProjectIds);
}

/* =========================================================
   LAST PROSJEKTER
========================================================= */
async function loadProjectsForUser(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (!userSnap.exists()) {
    renderError("Fant ikke brukerdata.");
    return;
  }

  const userData = userSnap.data();
  const role = userData.role || "";
  const projectIds = Array.isArray(userData.projectIds) ? userData.projectIds : [];

  let projects = [];

  if (role === "owner") {
    const snapshot = await getDocs(collection(db, "projects"));

    snapshot.forEach(docSnap => {
      projects.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
  } else {
    for (const projectId of projectIds) {
      const projectSnap = await getDoc(doc(db, "projects", projectId));

      if (projectSnap.exists()) {
        projects.push({
          id: projectSnap.id,
          ...projectSnap.data()
        });
      }
    }
  }

  projects.sort((a, b) =>
    (a.name || "").localeCompare((b.name || ""), "no")
  );

  if (!projects.length) {
    renderEmpty();
    return;
  }
  currentUserId = user.uid;
  allLoadedProjects = projects;
  renderProjectNotifications(user.uid, projects);

  const hiddenProjects = getHiddenProjects(user.uid);
  const visibleProjects = projects.filter(project => {
    return !hiddenProjects.includes(project.id);
  });

  renderProjects(visibleProjects, user.uid);
}
function renderHiddenProjectsModal() {
  if (!hiddenProjectsList || !currentUserId) return;

  const hiddenIds = getHiddenProjects(currentUserId);
  const hiddenProjects = allLoadedProjects.filter(project =>
    hiddenIds.includes(project.id)
  );

  if (!hiddenProjects.length) {
    hiddenProjectsList.innerHTML = `
      <div class="empty-state">Ingen skjulte prosjekter.</div>
    `;
    return;
  }

  hiddenProjectsList.innerHTML = hiddenProjects.map(project => `
    <div class="hidden-project-row">
      <div>
        <div class="hidden-project-title">${escapeHtml(project.name || "Uten navn")}</div>
        <div class="hidden-project-meta">${escapeHtml(project.customerName || "Ingen kunde registrert")}</div>
      </div>

      <button class="btn small show-project-btn" data-project-id="${escapeHtml(project.id)}" type="button">
        Gjør synlig
      </button>
    </div>
  `).join("");

  hiddenProjectsList.querySelectorAll(".show-project-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const projectId = btn.dataset.projectId;
      const hiddenIds = getHiddenProjects(currentUserId).filter(id => id !== projectId);

      saveHiddenProjects(currentUserId, hiddenIds);

      const visibleProjects = allLoadedProjects.filter(project =>
        !hiddenIds.includes(project.id)
      );

      renderProjects(visibleProjects, currentUserId);
      renderHiddenProjectsModal();
    });
  });
}

if (openHiddenProjectsBtn) {
  openHiddenProjectsBtn.addEventListener("click", () => {
    renderHiddenProjectsModal();

    hiddenProjectsModal.classList.remove("is-hidden");

    const modalCard = hiddenProjectsModal.querySelector(".team-modal-card");

    if (modalCard) {
      modalCard.classList.remove("fade-in");
      void modalCard.offsetWidth;
      modalCard.classList.add("fade-in");
    }
  });
}

if (closeHiddenProjectsBtn) {
  closeHiddenProjectsBtn.addEventListener("click", () => {
    hiddenProjectsModal.classList.add("is-hidden");
  });
}

if (hiddenProjectsModal) {
  hiddenProjectsModal.addEventListener("click", (e) => {
    if (e.target === hiddenProjectsModal) {
      hiddenProjectsModal.classList.add("is-hidden");
    }
  });
}

/* =========================================================
   AUTH
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  setWelcomeText();

  try {
    await loadProjectsForUser(user);
  } catch (error) {
    console.error("Landing project load error:", error);
    renderError();
  }
});