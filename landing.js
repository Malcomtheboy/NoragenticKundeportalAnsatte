/* =========================================================
   IMPORTS
   - Firebase auth + firestore
   - Laster inn nødvendige Firebase-funksjoner
========================================================= */
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

/* =========================================================
   DOM ELEMENTER
   Henter elementer fra HTML som brukes senere i UI
========================================================= */
const notificationBox = document.getElementById("notificationBox");
const notificationList = document.getElementById("notificationList");
const landingProjectsGrid = document.getElementById("landingProjectsGrid");
const welcomeText = document.getElementById("welcomeText");
const openHiddenProjectsBtn = document.getElementById("openHiddenProjectsBtn");
const hiddenProjectsModal = document.getElementById("hiddenProjectsModal");
const closeHiddenProjectsBtn = document.getElementById("closeHiddenProjectsBtn");
const hiddenProjectsList = document.getElementById("hiddenProjectsList");

/* =========================================================
   GLOBAL STATE
   Holder styr på prosjekter, varsler og aktive listeners
========================================================= */
let allLoadedProjects = [];
let currentUserId = null;

let chatUnsubscribers = [];
let initializedChatProjects = new Set();
let allNotificationsExpanded = false;

/* =========================================================
   HELPERS
========================================================= */

/**
 * Konverterer meldingstidspunkt til Date-objekt
 */
function getMessageDate(message) {
  const value = message.createdAt || message.time;

  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Henter tidspunkt for sist sett melding
 * Lagres i localStorage
 */
function getLastSeenMessageAt(userId, projectId) {
  const key = `last_seen_message_${userId}_${projectId}`;
  return Number(localStorage.getItem(key) || 0);
}

/**
 * Lagrer tidspunkt for sist sett melding
 */
function saveLastSeenMessageAt(userId, projectId, timestamp = Date.now()) {
  const key = `last_seen_message_${userId}_${projectId}`;
  localStorage.setItem(key, String(timestamp));
}

/**
 * Hindrer HTML injection/XSS
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Konverterer Firebase timestamp eller dato til Date
 */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Viser feilmelding i prosjekt-grid
 */
function renderError(message = "Kunne ikke laste prosjekter.") {
  if (!landingProjectsGrid) return;

  landingProjectsGrid.innerHTML = `
    <div class="error-state">${escapeHtml(message)}</div>
  `;
}

/**
 * Viser tom-state når ingen prosjekter finnes
 */
function renderEmpty(message = "Ingen prosjekter funnet.") {
  if (!landingProjectsGrid) return;

  landingProjectsGrid.innerHTML = `
    <div class="empty-state">${escapeHtml(message)}</div>
  `;
}

/**
 * Setter velkomsttekst basert på navn lagret i localStorage
 */
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
   Beregner prosjektstatus, fremdrift og risiko
========================================================= */

/**
 * Returnerer risikoanalyse for et prosjekt
 */
function getProjectRisk(project) {

  // Henter milepæler
  const milestones = Array.isArray(project.milestones) ? project.milestones : [];

  // Antall milepæler totalt
  const total = milestones.length;

  // Antall fullførte milepæler
  const done = milestones.filter(m => m.done).length;

  // Beregner progresjon basert på milepæler
  const milestoneProgress = total > 0
    ? Math.round((done / total) * 100)
    : null;

  // Fallback progresjon dersom milepæler mangler
  const fallbackProgress =
    typeof project.manualProgress === "number"
      ? project.manualProgress
      : typeof project.progress === "number"
        ? project.progress
        : 0;

  // Endelig progressverdi
  const progress = milestoneProgress !== null
    ? milestoneProgress
    : fallbackProgress;

  // Prosjektets startdato
  const startedAt = toDate(project.startedAt || project.createdAt);

  // Varighet i dager
  const durationDays =
    typeof project.durationDays === "number"
      ? project.durationDays
      : 90;

  // Hvor mange dager som er brukt
  const daysUsed = startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 86400000))
    : 0;

  // Hvor mange dager som gjenstår
  const daysLeft = Math.max(0, durationDays - daysUsed);

  // Forventet progresjon basert på tidsbruk
  const expectedPct =
    durationDays > 0
      ? Math.round((daysUsed / durationDays) * 100)
      : 0;

  // Neste ufullførte milepæl
  const nextMilestone = milestones.find(m => !m.done);

  // Dato for neste milepæl
  const nextDate = toDate(nextMilestone?.date);

  let daysToNext = null;

  if (nextDate) {
    daysToNext = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
  }

  // Standard risiko-status
  let risk = "low";
  let label = "På plan";
  let message = "Prosjektet ser ut til å være på plan.";

  // Risikoanalyse basert på progresjon og tidsfrister
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

  // Returnerer risiko-data
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
   Håndterer prosjekter brukeren har valgt å skjule
========================================================= */

/**
 * Henter skjulte prosjekter for valgt bruker
 */
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

/**
 * Lagrer liste med skjulte prosjekt-IDer
 */
function saveHiddenProjects(userId, ids) {
  const key = `hidden_projects_${userId}`;
  localStorage.setItem(key, JSON.stringify(ids));
}

/**
 * Skjuler et prosjekt for brukeren
 */
function hideProject(userId, projectId) {
  const hiddenProjects = getHiddenProjects(userId);

  if (!hiddenProjects.includes(projectId)) {
    hiddenProjects.push(projectId);
    saveHiddenProjects(userId, hiddenProjects);
  }
}

/* =========================================================
   NOTIFICATIONS
   Håndterer visning av varsler på landingssiden
========================================================= */

/**
 * Viser varselboksen
 */
function showNotificationBox() {
  if (!notificationBox) return;
  notificationBox.classList.remove("is-hidden");
}

/**
 * Viser maks 3 varsler, med mindre brukeren utvider listen
 */
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

/**
 * Legger til knapp for å vise flere/færre varsler
 */
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

/**
 * Legger til et nytt varsel i toppen av listen
 */
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

/**
 * Henter prosjekter brukeren allerede kjenner til
 */
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

/**
 * Lagrer nåværende prosjekt-IDer
 */
function saveCurrentProjectIds(userId, projectIds) {
  const key = `known_project_ids_${userId}`;
  localStorage.setItem(key, JSON.stringify(projectIds));
}

/**
 * Viser varsel når brukeren har blitt lagt til i nye prosjekter
 */
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
/**
 * Viser varsler for prosjekter med høy risiko
 */
function renderDeadlineNotifications(visibleProjects) {

  // Filtrerer ut prosjekter med høy risiko
  const riskyProjects = visibleProjects
    .map(project => ({
      project,
      risk: getProjectRisk(project)
    }))
    .filter(item => {

      // Kun høy risiko
      if (item.risk.risk !== "high") return false;

      // Ignorerer enkelte meldinger
      return item.risk.message !== "Fremdriften ligger bak forventet nivå basert på tidsbruk.";
    });

  riskyProjects.forEach(({ project, risk }) => {

    // Lager unik nøkkel for sessionStorage
    const key = `risk_notification_${currentUserId}_${project.id}_${risk.label}`;

    // Sjekker om varselet allerede er vist
    const alreadyShown = sessionStorage.getItem(key);

    if (alreadyShown) return;

    // Legger til varsel
    addNotification(`
      <strong>${escapeHtml(project.name || "Uten navn")}</strong>:
      ${escapeHtml(risk.message)}
    `, `risk-${risk.risk}`);

    // Lagrer at varselet er vist
    sessionStorage.setItem(key, "true");
  });
}

/* =========================================================
   CHAT NOTIFICATIONS
   Håndterer varsler fra prosjekt-chat
========================================================= */

/**
 * Stopper alle aktive Firebase listeners for chat
 */
function stopChatNotifications() {
  chatUnsubscribers.forEach(unsub => unsub());
  chatUnsubscribers = [];
  initializedChatProjects = new Set();
}

/**
 * Ber brukeren om tillatelse til desktop-varsler
 */
function requestNotificationPermission() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/**
 * Viser desktop notification i nettleseren
 */
function showDesktopNotification(message, project) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const sender = message.username || message.name || "Ny melding";
  const projectName = project.name || "Prosjekt";

  new Notification(`${sender} – ${projectName}`, {
    body: message.text || "Du har fått en ny melding."
  });
}

/**
 * Renderer chat-varsel i varsel-listen
 */
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

/**
 * Starter live-lytting på meldinger for alle synlige prosjekter
 */
function startChatNotifications(visibleProjects, userId) {

  // Stopper gamle listeners først
  stopChatNotifications();

  visibleProjects.forEach(project => {

    // Query mot messages collection
    const messagesQuery = query(
      collection(db, "messages"),
      where("projectId", "==", project.id)
    );

    // Oppretter realtime listener
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {

      // Sjekker om prosjektet allerede er initialisert
      const projectInitialized = initializedChatProjects.has(project.id);

      // Henter tidspunkt for sist sett melding
      const lastSeenAt = getLastSeenMessageAt(userId, project.id);

      let latestUnreadMessage = null;
      let latestUnreadTime = 0;

      snapshot.docChanges().forEach(change => {

        // Kun nye meldinger
        if (change.type !== "added") return;

        const message = {
          id: change.doc.id,
          ...change.doc.data()
        };

        // Ignorer egne meldinger
        if (message.uid === userId) return;

        // Henter meldingstid
        const messageDate = getMessageDate(message);
        const messageTime = messageDate ? messageDate.getTime() : 0;

        if (!messageTime) return;

        // Dersom prosjekt allerede er initialisert
        // vis varsler direkte
        if (projectInitialized) {
          renderChatNotification(message, project);
          showDesktopNotification(message, project);
          return;
        }

        // Finner nyeste uleste melding
        if (messageTime > lastSeenAt && messageTime > latestUnreadTime) {
          latestUnreadMessage = message;
          latestUnreadTime = messageTime;
        }
      });

      // Viser siste uleste melding ved første load
      if (!projectInitialized && latestUnreadMessage) {
        renderChatNotification(latestUnreadMessage, project);
      }

      // Marker prosjekt som initialisert
      initializedChatProjects.add(project.id);

    }, (error) => {
      console.warn("Kunne ikke lytte på chat-varsler:", error);
    });

    // Lagrer unsubscribe-funksjonen
    chatUnsubscribers.push(unsubscribe);
  });
}

/* =========================================================
   PROJECT CARDS
   Renderer prosjektkort på landingssiden
========================================================= */

/**
 * Renderer alle synlige prosjektkort
 */
function renderProjects(projects, userId) {
  if (!landingProjectsGrid) return;

  // Dersom ingen prosjekter finnes
  if (!projects.length) {
    renderEmpty("Alle prosjekter er skjult.");
    return;
  }

  // Lager HTML for hvert prosjekt
  landingProjectsGrid.innerHTML = projects.map(project => {

    // Henter risiko-data
    const projectRisk = getProjectRisk(project);

    // Prosent ferdig
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
    // Legger click-event på hvert prosjektkort
  landingProjectsGrid.querySelectorAll(".landing-project-card").forEach(card => {
    card.addEventListener("click", (e) => {

      // Stopper åpning av prosjekt dersom brukeren trykker på Skjul-knappen
      if (e.target.closest(".hide-project-btn")) return;

        const projectId = card.dataset.projectId;

        // Lagrer valgt prosjekt
        localStorage.setItem("selected_project_id", projectId);

        // Marker siste melding som sett
        saveLastSeenMessageAt(userId, projectId);

        // Sender brukeren til prosjekt-siden
        window.location.href = "index.html";
    });
  });

  // Legger click-event på Skjul-knapper
  landingProjectsGrid.querySelectorAll(".hide-project-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {

      // Hindrer at prosjektkortet også åpnes
      e.stopPropagation();

      const projectId = btn.dataset.projectId;

      // Skjuler prosjektet for brukeren
      hideProject(userId, projectId);

      const card = btn.closest(".landing-project-card");

      if (card) {

        // Starter fade-out animasjon
        card.classList.add("fade-out");

        setTimeout(() => {

          // Fjerner kortet fra DOM
          card.remove();

          // Sjekker om alle prosjekter nå er skjult
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
   Laster inn prosjekter fra Firestore for innlogget bruker
========================================================= */

/**
 * Laster prosjekter basert på brukerrolle
 */
async function loadProjectsForUser(user) {

  // Henter brukerdata fra Firestore
  const userSnap = await getDoc(doc(db, "users", user.uid));

  // Stopper dersom brukerdata ikke finnes
  if (!userSnap.exists()) {
    renderError("Fant ikke brukerdata.");
    return;
  }

  const userData = userSnap.data();
  const role = userData.role || "";
  const projectIds = Array.isArray(userData.projectIds) ? userData.projectIds : [];

  let projects = [];

  // Owner får tilgang til alle prosjekter
  if (role === "owner") {
    const snapshot = await getDocs(collection(db, "projects"));

    snapshot.forEach(docSnap => {
      projects.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

  // Andre roller får kun prosjektene de er tilknyttet
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

  // Sorterer prosjektene alfabetisk
  projects.sort((a, b) =>
    (a.name || "").localeCompare((b.name || ""), "no")
  );

  // Viser tom-state dersom ingen prosjekter finnes
  if (!projects.length) {
    renderEmpty();
    return;
  }

  // Lagrer bruker og prosjekter globalt
  currentUserId = user.uid;
  allLoadedProjects = projects;

  // Henter skjulte prosjekter
  const hiddenProjects = getHiddenProjects(user.uid);

  // Filtrerer bort skjulte prosjekter
  const visibleProjects = projects.filter(project => {
    return !hiddenProjects.includes(project.id);
  });

  // Viser varsler og prosjekter
  renderProjectNotifications(user.uid, projects);
  renderDeadlineNotifications(visibleProjects);
  startChatNotifications(visibleProjects, user.uid);
  renderProjects(visibleProjects, user.uid);
}
/* =========================================================
   HIDDEN PROJECTS MODAL
   Håndterer modalvinduet for skjulte prosjekter
========================================================= */

/**
 * Viser alle skjulte prosjekter i modal
 */
function renderHiddenProjectsModal() {
  if (!hiddenProjectsList || !currentUserId) return;

  // Henter ID-er til skjulte prosjekter
  const hiddenIds = getHiddenProjects(currentUserId);

  // Finner prosjektdata for skjulte prosjekter
  const hiddenProjects = allLoadedProjects.filter(project =>
    hiddenIds.includes(project.id)
  );

  // Viser tom-state dersom ingen prosjekter er skjult
  if (!hiddenProjects.length) {
    hiddenProjectsList.innerHTML = `
      <div class="empty-state">Ingen skjulte prosjekter.</div>
    `;
    return;
  }

  // Lager HTML for hvert skjulte prosjekt
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

  // Gjør skjulte prosjekter synlige igjen
  hiddenProjectsList.querySelectorAll(".show-project-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const projectId = btn.dataset.projectId;

      // Fjerner prosjektet fra listen over skjulte prosjekter
      const hiddenIds = getHiddenProjects(currentUserId).filter(id => id !== projectId);

      saveHiddenProjects(currentUserId, hiddenIds);

      // Oppdaterer synlige prosjekter
      const visibleProjects = allLoadedProjects.filter(project =>
        !hiddenIds.includes(project.id)
      );

      // Starter varsler på nytt for oppdatert prosjektliste
      stopChatNotifications();
      renderProjects(visibleProjects, currentUserId);
      renderDeadlineNotifications(visibleProjects);
      startChatNotifications(visibleProjects, currentUserId);
      renderHiddenProjectsModal();
    });
  });
}

/**
 * Åpner modal for skjulte prosjekter
 */
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

/**
 * Lukker modal via lukkeknapp
 */
if (closeHiddenProjectsBtn) {
  closeHiddenProjectsBtn.addEventListener("click", () => {
    hiddenProjectsModal.classList.add("is-hidden");
  });
}

/**
 * Lukker modal når brukeren klikker utenfor modal-kortet
 */
if (hiddenProjectsModal) {
  hiddenProjectsModal.addEventListener("click", (e) => {
    if (e.target === hiddenProjectsModal) {
      hiddenProjectsModal.classList.add("is-hidden");
    }
  });
}

/* =========================================================
   AUTH
   Sjekker innlogging og starter lasting av prosjekter
========================================================= */

/**
 * Kjører når Firebase auth-status endrer seg
 */
onAuthStateChanged(auth, async (user) => {

  // Sender brukeren til login dersom ingen er innlogget
  if (!user) {
    stopChatNotifications();
    window.location.href = "login.html";
    return;
  }

  // Setter opp UI for innlogget bruker
  setWelcomeText();
  requestNotificationPermission();

  try {
    // Laster prosjektene til brukeren
    await loadProjectsForUser(user);
  } catch (error) {
    // Logger feilen og viser feilmelding
    console.error("Landing project load error:", error);
    renderError();
  }
});