import { auth, db } from "./firebase-auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot
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

let chatUnsubscribers = [];
let initializedChatProjects = new Set();
let allNotificationsExpanded = false;

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

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
   RISK / DEADLINE ANALYTICS
========================================================= */
function getProjectRisk(project) {
  const milestones = Array.isArray(project.milestones) ? project.milestones : [];
  const total = milestones.length;
  const done = milestones.filter(m => m.done).length;

  const milestoneProgress = total > 0
    ? Math.round((done / total) * 100)
    : null;

  const fallbackProgress =
    typeof project.manualProgress === "number"
      ? project.manualProgress
      : typeof project.progress === "number"
        ? project.progress
        : 0;

  const progress = milestoneProgress !== null
    ? milestoneProgress
    : fallbackProgress;

  const startedAt = toDate(project.startedAt || project.createdAt);

  const durationDays =
    typeof project.durationDays === "number"
      ? project.durationDays
      : 90;

  const daysUsed = startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 86400000))
    : 0;

  const daysLeft = Math.max(0, durationDays - daysUsed);

  const expectedPct =
    durationDays > 0
      ? Math.round((daysUsed / durationDays) * 100)
      : 0;

  const nextMilestone = milestones.find(m => !m.done);
  const nextDate = toDate(nextMilestone?.date);

  let daysToNext = null;

  if (nextDate) {
    daysToNext = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
  }

  let risk = "low";
  let label = "På plan";
  let message = "Prosjektet ser ut til å være på plan.";

  if (total > 0 && done === total) {
    risk = "low";
    label = "Fullført";
    message = "Alle milepæler er fullført.";
  } else if (daysToNext !== null && daysToNext <= 0) {
    risk = "high";
    label = "Milepæl overskredet";
    message = "En milepæl er overskredet.";
  } else if (daysToNext !== null && daysToNext <= 7 && progress < 75) {
    risk = "high";
    label = "Høy risiko";
    message = "Prosjektet nærmer seg frist og ligger i høy risiko.";
  } else if (daysLeft <= 7 && progress < 100) {
    risk = "high";
    label = "Lite tid igjen";
    message = `Prosjektet har ${daysLeft} dager igjen.`;
  } else if (daysToNext !== null && daysToNext <= 14 && progress < 50) {
    risk = "medium";
    label = "Moderat risiko";
    message = "Prosjektet nærmer seg frist og bør følges opp.";
  } else if (progress + 10 < expectedPct) {
    risk = "medium";
    label = "Bak skjema";
    message = "Fremdriften ligger bak forventet nivå basert på tidsbruk.";
  }

  return {
    risk,
    label,
    message,
    progress: Math.max(0, Math.min(100, progress)),
    done,
    total,
    daysLeft,
    daysUsed,
    expectedPct,
    nextMilestoneTitle: nextMilestone?.title || ""
  };
}

/* =========================================================
   HIDDEN PROJECTS
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
   NOTIFICATIONS
========================================================= */
function showNotificationBox() {
  if (!notificationBox) return;
  notificationBox.classList.remove("is-hidden");
}

function updateNotificationVisibility() {
  if (!notificationList) return;

  const items = [...notificationList.querySelectorAll(".notification-item")];
  const showMoreBtn = document.getElementById("showMoreNotificationsBtn");

  items.forEach((item, index) => {
    if (!allNotificationsExpanded && index >= 3) {
      item.classList.add("is-hidden");
    } else {
      item.classList.remove("is-hidden");
    }
  });

  if (showMoreBtn) {
    if (items.length <= 3) {
      showMoreBtn.remove();
    } else {
      showMoreBtn.textContent = allNotificationsExpanded
        ? "Vis færre"
        : `Vis flere (${items.length - 3})`;
    }
  }
}

function ensureShowMoreButton() {
  if (!notificationBox || !notificationList) return;

  const items = notificationList.querySelectorAll(".notification-item");
  let showMoreBtn = document.getElementById("showMoreNotificationsBtn");

  if (items.length <= 3) {
    showMoreBtn?.remove();
    updateNotificationVisibility();
    return;
  }

  if (!showMoreBtn) {
    showMoreBtn = document.createElement("button");
    showMoreBtn.id = "showMoreNotificationsBtn";
    showMoreBtn.className = "btn small show-more-notifications-btn";
    showMoreBtn.type = "button";

    showMoreBtn.addEventListener("click", () => {
      allNotificationsExpanded = !allNotificationsExpanded;
      updateNotificationVisibility();
    });

    notificationBox.appendChild(showMoreBtn);
  }

  updateNotificationVisibility();
}

function addNotification(html, extraClass = "") {
  if (!notificationBox || !notificationList) return;

  showNotificationBox();

  const item = document.createElement("div");
  item.className = `notification-item ${extraClass}`.trim();
  item.innerHTML = html;

  notificationList.prepend(item);

  const items = notificationList.querySelectorAll(".notification-item");

  if (items.length > 12) {
    items[items.length - 1].remove();
  }

  ensureShowMoreButton();
}

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

function renderProjectNotifications(userId, allProjects) {
  const currentProjectIds = allProjects.map(project => project.id);
  const knownProjectIds = getStoredProjectIds(userId);

  const newProjects = allProjects.filter(project => {
    return !knownProjectIds.includes(project.id);
  });

  if (knownProjectIds.length === 0) {
    saveCurrentProjectIds(userId, currentProjectIds);
    return;
  }

  newProjects.forEach(project => {
    addNotification(`
      Du har blitt lagt til i prosjektet
      <strong>${escapeHtml(project.name || "Uten navn")}</strong>.
    `);
  });

  saveCurrentProjectIds(userId, currentProjectIds);
}

function renderDeadlineNotifications(visibleProjects) {
  const riskyProjects = visibleProjects
    .map(project => ({
      project,
      risk: getProjectRisk(project)
    }))
    .filter(item => {
      if (item.risk.risk !== "high") return false;

      return item.risk.message !== "Fremdriften ligger bak forventet nivå basert på tidsbruk.";
    });

  riskyProjects.forEach(({ project, risk }) => {
    const key = `risk_notification_${currentUserId}_${project.id}_${risk.label}`;
    const alreadyShown = sessionStorage.getItem(key);

    if (alreadyShown) return;

    addNotification(`
      <strong>${escapeHtml(project.name || "Uten navn")}</strong>:
      ${escapeHtml(risk.message)}
    `, `risk-${risk.risk}`);

    sessionStorage.setItem(key, "true");
  });
}

/* =========================================================
   CHAT NOTIFICATIONS
========================================================= */
function stopChatNotifications() {
  chatUnsubscribers.forEach(unsub => unsub());
  chatUnsubscribers = [];
  initializedChatProjects = new Set();
}

function requestNotificationPermission() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function showDesktopNotification(message, project) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const sender = message.username || message.name || "Ny melding";
  const projectName = project.name || "Prosjekt";

  new Notification(`${sender} – ${projectName}`, {
    body: message.text || "Du har fått en ny melding."
  });
}

function renderChatNotification(message, project) {
  const sender = message.username || message.name || "Ukjent bruker";
  const text = message.text || "";
  const projectName = project.name || "Uten navn";

  addNotification(`
    <div>
      Ny melding i <strong>${escapeHtml(projectName)}</strong>
    </div>
    <div class="notification-preview">
      <strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}
    </div>
  `, "chat-notification");
}

function startChatNotifications(visibleProjects, userId) {
  stopChatNotifications();

  visibleProjects.forEach(project => {
    const messagesQuery = query(
      collection(db, "messages"),
      where("projectId", "==", project.id)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const projectInitialized = initializedChatProjects.has(project.id);

      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const message = {
          id: change.doc.id,
          ...change.doc.data()
        };

        if (!projectInitialized) return;
        if (message.uid === userId) return;

        renderChatNotification(message, project);
        showDesktopNotification(message, project);
      });

      initializedChatProjects.add(project.id);
    }, (error) => {
      console.warn("Kunne ikke lytte på chat-varsler:", error);
    });

    chatUnsubscribers.push(unsubscribe);
  });
}

/* =========================================================
   PROJECT CARDS
========================================================= */
function renderProjects(projects, userId) {
  if (!landingProjectsGrid) return;

  if (!projects.length) {
    renderEmpty("Alle prosjekter er skjult.");
    return;
  }

  landingProjectsGrid.innerHTML = projects.map(project => {
    const projectRisk = getProjectRisk(project);
    const safeProgress = projectRisk.progress;

    return `
      <div class="landing-project-card card fade-in risk-${projectRisk.risk}" data-project-id="${escapeHtml(project.id)}">
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

        <div class="landing-risk-badge risk-${projectRisk.risk}">
          ${escapeHtml(projectRisk.label)}
          ${
            projectRisk.total > 0
              ? ` · ${projectRisk.done}/${projectRisk.total} milepæler`
              : ""
          }
          · ${projectRisk.daysLeft} dager igjen
        </div>

        <div class="landing-project-bar">
          <div class="landing-project-bar-fill risk-${projectRisk.risk}" style="width:${safeProgress}%"></div>
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
    });
  });
}

/* =========================================================
   LOAD PROJECTS
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

  const hiddenProjects = getHiddenProjects(user.uid);
  const visibleProjects = projects.filter(project => {
    return !hiddenProjects.includes(project.id);
  });

  renderProjectNotifications(user.uid, projects);
  renderDeadlineNotifications(visibleProjects);
  startChatNotifications(visibleProjects, user.uid);
  renderProjects(visibleProjects, user.uid);
}

/* =========================================================
   HIDDEN PROJECTS MODAL
========================================================= */
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

      stopChatNotifications();
      renderProjects(visibleProjects, currentUserId);
      renderDeadlineNotifications(visibleProjects);
      startChatNotifications(visibleProjects, currentUserId);
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
    stopChatNotifications();
    window.location.href = "login.html";
    return;
  }

  setWelcomeText();
  requestNotificationPermission();

  try {
    await loadProjectsForUser(user);
  } catch (error) {
    console.error("Landing project load error:", error);
    renderError();
  }
});