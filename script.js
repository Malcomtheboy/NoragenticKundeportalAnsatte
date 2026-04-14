import { auth } from "./firebase-auth.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =========================================================
   SIDE-DETEKSJON
========================================================= */
const isDashboardPage = !!document.getElementById("projectName");
const userRole = localStorage.getItem("employee_role");

/* =========================================================
   ROUTE GUARD
========================================================= */
onAuthStateChanged(auth, (user) => {
  const path = (window.location.pathname || "").toLowerCase();
  const onLogin = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");

  if (onDashboard && !user) {
    window.location.href = "login.html";
    return;
  }

  if (onLogin && user) {
    window.location.href = "index.html";
  }
});

/* =========================================================
   DASHBOARD
========================================================= */
if (isDashboardPage) {
  const createCustomerBtn = document.getElementById("createCustomerBtn");
  const createProjectBtn = document.getElementById("createProjectBtn");
  const createEmployeeBtn = document.getElementById("createEmployeeBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const editBtn = document.getElementById("heroEditBtn");

  const projectDescription = document.getElementById("projectDescription");
  const customerDescription = document.getElementById("customerDescription");

  let currentProjectId = null;

  function loadDescription(projectId) {
    if (!projectId) return;

    if (projectDescription) {
      projectDescription.textContent =
        localStorage.getItem(`employee_projectDescription_${projectId}`) || "";
    }

    if (customerDescription) {
      customerDescription.textContent =
        localStorage.getItem(`employee_customerDescription_${projectId}`) || "";
    }
  }

  function saveDescription(projectId) {
    if (!projectId) return;

    if (projectDescription) {
      localStorage.setItem(
        `employee_projectDescription_${projectId}`,
        projectDescription.textContent.trim()
      );
    }

    if (customerDescription) {
      localStorage.setItem(
        `employee_customerDescription_${projectId}`,
        customerDescription.textContent.trim()
      );
    }
  }

  if (projectDescription) {
    projectDescription.addEventListener("blur", () => {
      saveDescription(currentProjectId);
    });
  }

  if (customerDescription) {
    customerDescription.addEventListener("blur", () => {
      saveDescription(currentProjectId);
    });
  }

  // Lytt på prosjektbytte fra project.js
  window.addEventListener("projectChanged", (event) => {
    currentProjectId = event.detail.projectId;
    loadDescription(currentProjectId);
  });

  // Vis owner-knapper kun for owner
  if (userRole === "owner") {
    if (createCustomerBtn) createCustomerBtn.classList.remove("hidden");
    if (createProjectBtn) createProjectBtn.classList.remove("hidden");
    if (createEmployeeBtn) createEmployeeBtn.classList.remove("hidden");
  }

  /* Logg ut */
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Feil ved logout:", error);
      }

      localStorage.removeItem("employee_logged_in");
      localStorage.removeItem("employee_uid");
      localStorage.removeItem("employee_role");
      localStorage.removeItem("employee_name");
      localStorage.removeItem("employee_email");

      window.location.href = "login.html";
    });
  }

  /* Rediger-knapp i hero */
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      if (window.openAdminModal) {
        window.openAdminModal();
      }
    });
  }
}