// Importerer Firebase Authentication fra felles firebase-fil
import { auth } from "./firebase-auth.js";

// Firebase-funksjoner for logout og auth-state
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Henter relevante knapper fra HTML
const logoutBtn = document.getElementById("logoutBtn");
const createCustomerBtn = document.getElementById("createCustomerBtn");
const createProjectBtn = document.getElementById("createProjectBtn");
const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const editBtn = document.getElementById("heroEditBtn");

// Lytter etter endringer i innloggingsstatus
onAuthStateChanged(auth, (user) => {

  // Henter nåværende URL-path
  const path = window.location.pathname.toLowerCase();

  // Sjekker hvilke sider brukeren befinner seg på
  const onLogin = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");
  const onLanding = path.endsWith("landing.html"); //@aslak la til enda en side den må sjekke

  // Hvis bruker ikke er logget inn og prøver å åpne dashboard/landing
  if ((onDashboard || onLanding) && !user) {
    window.location.href = "login.html";
    return;
  }

  // Hvis bruker allerede er logget inn og åpner login-siden
  if (onLogin && user) {
    window.location.href = "landing.html"; //@Aslak endet den til landingssiden
    return;
  }

  // Henter rolle lagret i localStorage
  const role = localStorage.getItem("employee_role");

  // Kun owner får tilgang til admin-knappene
  if (role === "owner") {
    createCustomerBtn?.classList.remove("hidden");
    createProjectBtn?.classList.remove("hidden");
    createEmployeeBtn?.classList.remove("hidden");
  }
});

// Logout-funksjon
if (logoutBtn) {

  logoutBtn.addEventListener("click", async () => {

    try {

      // Logger ut brukeren via Firebase Authentication
      await signOut(auth);

    } catch (error) {

      // Logger eventuell feil i console
      console.error("Feil ved logout:", error);
    }

    // Fjerner kun innloggings-/brukerdata, ikke varselhistorikk
    [
      "employee_uid",
      "employee_name",
      "employee_email",
      "employee_role",
      "selected_project_id"
    ].forEach(key => localStorage.removeItem(key));

    // Sender brukeren tilbake til login-siden
    window.location.href = "login.html";
  });
}

// Åpner admin/modal-vindu for redigering av prosjekt
if (editBtn) {

  editBtn.addEventListener("click", () => {

    // Kjører global modal-funksjon dersom den finnes
    if (window.openAdminModal) {
      window.openAdminModal();
    }
  });
}

/* =========================================================
   TILBAKE TIL LANDINGSSIDE @aslak
========================================================= */

// Knapp for å gå tilbake til landing-siden
const backToLandingBtn = document.getElementById("backToLandingBtn");

if (backToLandingBtn) {

  backToLandingBtn.addEventListener("click", () => {

    // Sender brukeren tilbake til landing.html
    window.location.href = "landing.html";
  });
}

/* =========================================================
   VARSLER
========================================================= */

// Henter tidligere kjente prosjekt-ID-er fra localStorage
function getStoredProjectIds(userId) {

  const key = `known_project_ids_${userId}`;
  const stored = localStorage.getItem(key);

  if (!stored) return [];

  try {

    // Konverterer JSON-streng tilbake til array
    return JSON.parse(stored);

  } catch {

    // Returnerer tom liste dersom parsing feiler
    return [];
  }
}

// Lagrer prosjekt-ID-er i localStorage
function saveCurrentProjectIds(userId, projectIds) {

  const key = `known_project_ids_${userId}`;

  localStorage.setItem(key, JSON.stringify(projectIds));
}

// Viser varsler dersom brukeren har blitt lagt til i nye prosjekter
function renderProjectNotifications(userId, projects) {

  // Stopper dersom notification-elementene ikke finnes
  if (!notificationBox || !notificationList) return;

  // Henter alle nåværende prosjekt-ID-er
  const currentProjectIds = projects.map(project => project.id);

  // Henter tidligere lagrede prosjekt-ID-er
  const knownProjectIds = getStoredProjectIds(userId);

  // Finner prosjekter brukeren ikke hadde fra før
  const newProjects = projects.filter(project => {
    return !knownProjectIds.includes(project.id);
  });

  // Første gang brukeren logger inn → ingen varsler vises
  if (knownProjectIds.length === 0) {

    saveCurrentProjectIds(userId, currentProjectIds);

    notificationBox.classList.add("is-hidden");

    return;
  }

  // Hvis ingen nye prosjekter finnes → skjul varsler
  if (newProjects.length === 0) {

    notificationBox.classList.add("is-hidden");

    saveCurrentProjectIds(userId, currentProjectIds);

    return;
  }

  // Lager HTML for varsler
  notificationList.innerHTML = newProjects.map(project => `
    <div class="notification-item">
      Du har blitt lagt til i prosjektet
      <strong>${escapeHtml(project.name || "Uten navn")}</strong>.
    </div>
  `).join("");

  // Viser varslingsboksen
  notificationBox.classList.remove("is-hidden");

  // Oppdaterer lagrede prosjekt-ID-er
  saveCurrentProjectIds(userId, currentProjectIds);
}