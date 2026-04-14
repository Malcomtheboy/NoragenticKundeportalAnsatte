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
  const projects = {
    p1: {
      name: "Prosjekt 1",
      goal: "Her kan prosjektets aktive delmål vises",
      id: "PROJECT_ABC_123"
    },
    p2: {
      name: "Prosjekt 2",
      goal: "Her kan status for prosjekt 2 vises",
      id: "PROJECT_DEF_456"
    },
    p3: {
      name: "Prosjekt 3",
      goal: "Her kan status for prosjekt 3 vises",
      id: "PROJECT_GHI_789"
    }
  };

  let currentProject = "p1";

  const projectName = document.getElementById("projectName");
  const projectGoal = document.getElementById("projectGoal");
  const tabs = document.querySelectorAll(".tab[data-project]");

  const createCustomerBtn = document.getElementById("createCustomerBtn");
  const createProjectBtn = document.getElementById("createProjectBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const editBtn = document.getElementById("heroEditBtn");
  const projectDescription = document.getElementById("projectDescription");
  const customerDescription = document.getElementById("customerDescription");


  function renderProject(project) {
    if (projectName) projectName.textContent = project.name;
    if (projectGoal) projectGoal.textContent = project.goal;
  }
  function loadDescription(projectKey) {
  if (projectDescription) {
    projectDescription.textContent = localStorage.getItem(`employee_projectDescription_${projectKey}`) || "";
  }

  if (customerDescription) {
    customerDescription.textContent = localStorage.getItem(`employee_customerDescription_${projectKey}`) || "";
  }
  }

function saveDescription(projectKey) {
  if (projectDescription) {
    localStorage.setItem(`employee_projectDescription_${projectKey}`, projectDescription.textContent.trim());
  }

  if (customerDescription) {
    localStorage.setItem(`employee_customerDescription_${projectKey}`, customerDescription.textContent.trim());
  }
  }

  if (projectDescription) {
  projectDescription.addEventListener("blur", () => {
    saveDescription(currentProject);
  });
  }

  if (customerDescription) {
  customerDescription.addEventListener("blur", () => {
    saveDescription(currentProject);
  });
  }

  function updateFileManager(projectId) {
    window.currentProjectId = projectId;

    window.dispatchEvent(
      new CustomEvent("projectChanged", {
        detail: { projectId }
      })
    );
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      currentProject = tab.dataset.project;
      const project = projects[currentProject];

      if (!project) return;

      renderProject(project);
      loadDescription(currentProject);
      updateFileManager(project.id);
    });
  });

  // Vis owner-knapper kun for owner
  if (userRole === "owner") {
    if (createCustomerBtn) {
      createCustomerBtn.classList.remove("hidden");
    }

    if (createProjectBtn) {
      createProjectBtn.classList.remove("hidden");
    }
  }

  // Init første prosjekt
  renderProject(projects[currentProject]);
  loadDescription(currentProject);
  updateFileManager(projects[currentProject].id);

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