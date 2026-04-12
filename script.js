/* =========================================================
   SIDE-DETEKSJON
========================================================= */
const isLoginPage = !!document.getElementById("loginForm");
const isDashboardPage = !!document.getElementById("projectName");
const userRole = localStorage.getItem("employee_role");

/* =========================================================
   ROUTE GUARD (midlertidig frontend-flow)
========================================================= */
(function guardPages() {
  const path = (window.location.pathname || "").toLowerCase();
  const onLogin = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");

  const loggedIn = localStorage.getItem("employee_logged_in") === "true";

  if (onDashboard && !loggedIn) window.location.href = "login.html";
  if (onLogin && loggedIn) window.location.href = "index.html";
})();

/* =========================================================
   LOGIN
========================================================= */
if (isLoginPage) {
  const form = document.getElementById("loginForm");
  const hint = document.getElementById("hint");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    localStorage.setItem("employee_logged_in", "true");

    hint.textContent = "Logger inn…";
    setTimeout(() => {
      window.location.href = "index.html";
    }, 300);
  });
}

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

  const projectDescription = document.getElementById("projectDescription");
  const customerDescription = document.getElementById("customerDescription");

  const createCustomerBtn = document.getElementById("createCustomerBtn");
  const createProjectBtn = document.getElementById("createProjectBtn");

  function renderProject(project) {
    projectName.textContent = project.name;
    projectGoal.textContent = project.goal;
  }

  function loadDescription(projectKey) {
    if (projectDescription) {
      projectDescription.textContent =
        localStorage.getItem(`employee_projectDescription_${projectKey}`) || "";
    }

    if (customerDescription) {
      customerDescription.textContent =
        localStorage.getItem(`employee_customerDescription_${projectKey}`) || "";
    }
  }

  function saveDescription(projectKey) {
    if (projectDescription) {
      localStorage.setItem(
        `employee_projectDescription_${projectKey}`,
        projectDescription.textContent.trim()
      );
    }

    if (customerDescription) {
      localStorage.setItem(
        `employee_customerDescription_${projectKey}`,
        customerDescription.textContent.trim()
      );
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

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      currentProject = tab.dataset.project;
      renderProject(projects[currentProject]);
      loadDescription(currentProject);
      updateFileManager(projects[currentProject].id);
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

  renderProject(projects[currentProject]);
  loadDescription(currentProject);
  updateFileManager(projects[currentProject].id);
}

/* =========================================================
   LOGG UT
========================================================= */
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("employee_logged_in");
    window.location.href = "login.html";
  });
}
