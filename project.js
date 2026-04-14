import { auth, db } from "./firebase-auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const projectTabs = document.getElementById("projectTabs");
const projectName = document.getElementById("projectName");
const projectGoal = document.getElementById("projectGoal");

onAuthStateChanged(auth, async (user) => {
  if (!user || !projectTabs) return;

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) {
    console.error("Fant ikke brukerdata.");
    return;
  }

  const userData = userSnap.data();
  const role = userData.role || "";
  const projectIds = userData.projectIds || [];

  let projects = [];

  if (role === "owner") {
    const allProjectsSnap = await getDocs(collection(db, "projects"));
    allProjectsSnap.forEach((docSnap) => {
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

  renderProjects(projects);
});

function renderProjects(projects) {
  projectTabs.innerHTML = "";

  if (!projects.length) {
    projectTabs.innerHTML = `<span class="tabs-loading">Ingen prosjekter tilgjengelig</span>`;
    if (projectName) projectName.textContent = "Ingen prosjekter";
    if (projectGoal) projectGoal.textContent = "Du har ikke tilgang til noen prosjekter.";
    return;
  }

  projects.forEach((project, index) => {
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.textContent = project.name || "Uten navn";
    btn.dataset.projectId = project.id;

    if (index === 0) {
      btn.classList.add("is-active");
      setActiveProject(project);
    }

    btn.addEventListener("click", () => {
      document.querySelectorAll("#projectTabs .tab").forEach((tab) => {
        tab.classList.remove("is-active");
      });

      btn.classList.add("is-active");
      setActiveProject(project);
    });

    projectTabs.appendChild(btn);
  });
}

function setActiveProject(project) {
  if (!project) return;

  if (projectName) {
    projectName.textContent = project.name || "Prosjekt";
  }

  if (projectGoal) {
    projectGoal.textContent = project.goal || "Ingen delmål registrert";
  }

  window.currentProjectId = project.id;

  window.dispatchEvent(
    new CustomEvent("projectChanged", {
      detail: {
        projectId: project.id,
        projectData: project
      }
    })
  );

  console.log("Aktivt prosjekt:", project.id, project.name);
}