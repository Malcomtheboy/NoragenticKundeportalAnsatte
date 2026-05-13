import { auth } from "./firebase-auth.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");
const createCustomerBtn = document.getElementById("createCustomerBtn");
const createProjectBtn = document.getElementById("createProjectBtn");
const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const editBtn = document.getElementById("heroEditBtn");

onAuthStateChanged(auth, (user) => {
  const path = window.location.pathname.toLowerCase();
  const onLogin = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");
  const onLanding = path.endsWith("landing.html");//@aslak la til enda en side den må sjekke

if ((onDashboard || onLanding) && !user) {
  window.location.href = "login.html";
  return;
}

  if (onLogin && user) {
    window.location.href = "landing.html";//@Aslak endet den til landingssiden
    return;
  }

  const role = localStorage.getItem("employee_role");

  if (role === "owner") {
    createCustomerBtn?.classList.remove("hidden");
    createProjectBtn?.classList.remove("hidden");
    createEmployeeBtn?.classList.remove("hidden");
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Feil ved logout:", error);
    }

    localStorage.clear();
    window.location.href = "login.html";
  });
}

if (editBtn) {
  editBtn.addEventListener("click", () => {
    if (window.openAdminModal) {
      window.openAdminModal();
    }
  });
}

/* =========================================================
   TILBAKE TIL LANDINGSSIDE @aslak
========================================================= */

const backToLandingBtn = document.getElementById("backToLandingBtn");

if (backToLandingBtn) {
  backToLandingBtn.addEventListener("click", () => {
    window.location.href = "landing.html";
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
