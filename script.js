/* =========================================================
   SIDE-DETEKSJON
========================================================= */
const isLoginPage = !!document.getElementById("loginForm");
const isDashboardPage = !!document.getElementById("projectName");

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
      id: "PROJECT_ABC_123" // @aslak
    },
    p2: {
      name: "Prosjekt 2",
      goal: "Her kan status for prosjekt 2 vises",
      id: "PROJECT_DEF_456" // @aslak
    },
    p3: {
      name: "Prosjekt 3",
      goal: "Her kan status for prosjekt 3 vises",
      id: "PROJECT_GHI_789" // @aslak
    }
  };

  let currentProject = "p1";

  const projectName = document.getElementById("projectName");
  const projectGoal = document.getElementById("projectGoal");
  const tabs = document.querySelectorAll(".tab[data-project]");

  function renderProject(project) {
    projectName.textContent = project.name;
    projectGoal.textContent = project.goal;
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

      updateFileManager(projects[currentProject].id);//@aslak
    });
  });

  renderProject(projects[currentProject]);
  updateFileManager(projects[currentProject].id);//@aslak
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
