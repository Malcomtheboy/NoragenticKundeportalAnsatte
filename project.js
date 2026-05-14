import { auth, db } from "./firebase-auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


/* =========================================================
   ELEMENTER
========================================================= */
const projectSelectorContainer = document.getElementById("projectSelectorContainer");
const projectName = document.getElementById("projectName");
const projectGoal = document.getElementById("projectGoal");
const projectDescription = document.getElementById("projectDescription");
const customerDescription = document.getElementById("customerDescription");
const customerDescriptionModal = document.getElementById("customerDescriptionModal");
const customerDescriptionExpanded = document.getElementById("customerDescriptionExpanded");
const expandCustomerDescriptionBtn = document.getElementById("expandCustomerDescription");
const closeCustomerDescriptionBtn = document.getElementById("closeCustomerDescription");


/* =========================================================
   AUTH → HENT PROSJEKTER
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));

    if (!userSnap.exists()) {
      console.error("Fant ikke brukerdata.");
      renderEmptyState();
      return;
    }

    const userData = userSnap.data();
    console.log("LOGGET INN UID:", user.uid);
    console.log("USER DATA:", userData);
    console.log("ROLE:", userData.role);
    console.log("PROJECT IDS:", userData.projectIds);
    const role = userData.role || "";
    const projectIds = userData.projectIds || [];

    let projects = [];

    // OWNER → får alle prosjekter
    if (role === "owner") {
      const snapshot = await getDocs(collection(db, "projects"));

      snapshot.forEach((docSnap) => {
        projects.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
    }

    // EMPLOYEE → kun egne prosjekter
    else {
      for (const id of projectIds) {
        const snap = await getDoc(doc(db, "projects", id));

        if (snap.exists()) {
          projects.push({
            id: snap.id,
            ...snap.data()
          });
        }
      }
    }

    renderProjectSelector(projects);

    if (projects.length > 0) { //@aslak denne er endret for å sette id til den valgt av landingssiden
      const selectedProjectId = localStorage.getItem("selected_project_id");
        const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];

        setActiveProject(selectedProject);

        const projectSelector = document.getElementById("projectSelector");

        if (projectSelector && selectedProject) {
          projectSelector.value = selectedProject.id;
        }
    }

  } catch (err) {
    console.error("Project load error:", err);
    renderEmptyState();
  }
});

/* =========================================================
   RENDER DROPDOWN
========================================================= */
function renderProjectSelector(projects) {
  if (!projectSelectorContainer) return;

  if (!projects.length) {
    projectSelectorContainer.innerHTML = `
      <div class="big">Ingen prosjekter</div>
    `;
    return;
  }

  // Kun ett prosjekt → vis navn
  if (projects.length === 1) {
    projectSelectorContainer.innerHTML = `
      <div class="big">${projects[0].name || "Uten navn"}</div>
    `;
    return;
  }

  // Flere prosjekter → dropdown
  projectSelectorContainer.innerHTML = `
    <select id="projectSelector" class="project-dropdown">
      ${projects.map(p => `
        <option value="${p.id}">
          ${p.name || "Uten navn"}
        </option>
      `).join("")}
    </select>
  `;

  const select = document.getElementById("projectSelector");

  select.addEventListener("change", () => {
    const selected = projects.find(p => p.id === select.value);
    setActiveProject(selected);
  });
}

async function getCompanyIdForProject(projectId) {
  if (!projectId) return null;

  const projectSnap = await getDoc(doc(db, "projects", projectId));
  if (!projectSnap.exists()) return null;

  const projectData = projectSnap.data();
  const customerIds = Array.isArray(projectData.customerIds)
    ? projectData.customerIds
    : [];

  if (!customerIds.length) return null;

  for (const customerId of customerIds) {
    const customerSnap = await getDoc(doc(db, "users", customerId));
    if (!customerSnap.exists()) continue;

    const companyId = customerSnap.data().companyId || null;
    if (companyId) return companyId;
  }

  return null;
}


function syncCustomerDescriptionExpanded() {
  if (!customerDescription || !customerDescriptionExpanded) return;
  customerDescriptionExpanded.textContent = customerDescription.textContent || "";
}



async function loadDescriptions(projectId) {
  if (!projectId || !projectDescription || !customerDescription) return;

  try {
    const projectSnap = await getDoc(doc(db, "projects", projectId));
    const projectData = projectSnap.exists() ? projectSnap.data() : {};

    projectDescription.textContent =
      projectData.prosjektBeskrivelse || projectData.description || "";

    const companyId = await getCompanyIdForProject(projectId);

       if (!companyId) {
      customerDescription.textContent = "";
      syncCustomerDescriptionExpanded();
      return;
    }


    const companySnap = await getDoc(doc(db, "companies", companyId));
    const companyData = companySnap.exists() ? companySnap.data() : {};

    customerDescription.textContent =
      companyData.kundeBeskrivelse || companyData.customerDescription || "";
          syncCustomerDescriptionExpanded();

  } catch (err) {
    console.error("Kunne ikke laste beskrivelser:", err);
  }
}


async function saveDescriptions(projectId) {
  if (!projectId || !projectDescription || !customerDescription) return;

  try {
    await setDoc(
      doc(db, "projects", projectId),
      {
        prosjektBeskrivelse: projectDescription.textContent.trim(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    const companyId = await getCompanyIdForProject(projectId);

    if (companyId) {
      await setDoc(
        doc(db, "companies", companyId),
        {
          kundeBeskrivelse: customerDescription.textContent.trim(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("Kunne ikke lagre beskrivelser:", err);
  }
}



/* =========================================================
   SET ACTIVE PROJECT
========================================================= */
function setActiveProject(project) {
  if (!project) return;

  if (projectName) {
    projectName.textContent = project.name || "Prosjekt";
  }

  if (projectGoal) {
    projectGoal.textContent = project.goal || "Ingen delmål registrert";
  }

  window.currentProjectId = project.id;
  loadDescriptions(project.id);


  // viktig: trigger resten av systemet (team, filer osv)
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

/* =========================================================
   EMPTY STATE
========================================================= */
function renderEmptyState() {
  if (projectSelectorContainer) {
    projectSelectorContainer.innerHTML = `
      <div class="big">Ingen prosjekter</div>
    `;
  }

  if (projectName) {
    projectName.textContent = "Ingen prosjekter";
  }

  if (projectGoal) {
    projectGoal.textContent = "Ingen data tilgjengelig";
  }
}

projectDescription?.addEventListener("blur", () => {
  saveDescriptions(window.currentProjectId);
});

customerDescription?.addEventListener("blur", () => {
  saveDescriptions(window.currentProjectId);
});

expandCustomerDescriptionBtn?.addEventListener("click", () => {
  syncCustomerDescriptionExpanded();
  customerDescriptionModal?.classList.add("active");
});

closeCustomerDescriptionBtn?.addEventListener("click", () => {
  customerDescriptionModal?.classList.remove("active");
  saveDescriptions(window.currentProjectId);
});

customerDescriptionModal?.addEventListener("click", (e) => {
  if (e.target === customerDescriptionModal) {
    customerDescriptionModal.classList.remove("active");
    saveDescriptions(window.currentProjectId);
  }
});

customerDescriptionExpanded?.addEventListener("input", () => {
  if (!customerDescription) return;
  customerDescription.textContent = customerDescriptionExpanded.textContent || "";
});

customerDescriptionExpanded?.addEventListener("blur", () => {
  saveDescriptions(window.currentProjectId);
});

