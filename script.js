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
      goal: "Her kan prosjektets aktive delmål vises"
    },
    p2: {
      name: "Prosjekt 2",
      goal: "Her kan status for prosjekt 2 vises"
    },
    p3: {
      name: "Prosjekt 3",
      goal: "Her kan status for prosjekt 3 vises"
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

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      currentProject = tab.dataset.project;
      renderProject(projects[currentProject]);
    });
  });

  renderProject(projects[currentProject]);
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
