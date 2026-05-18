// Importerer Firebase Authentication og Firestore-database fra felles Firebase-fil
import { auth, db } from "./firebase-auth.js";

// Lytter etter om bruker er logget inn eller ikke
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firestore-funksjoner for å hente og lagre data
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

// Henter relevante HTML-elementer fra siden
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

// Når auth-status er klar, hentes prosjektene brukeren har tilgang til
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {

    // Henter brukerdata fra Firestore basert på innlogget UID
    const userSnap = await getDoc(doc(db, "users", user.uid));

    if (!userSnap.exists()) {
      console.error("Fant ikke brukerdata.");
      renderEmptyState();
      return;
    }

    const userData = userSnap.data();

    // Debug-info som gjør det lettere å se hvilken rolle og hvilke prosjekter brukeren har
    console.log("LOGGET INN UID:", user.uid);
    console.log("USER DATA:", userData);
    console.log("ROLE:", userData.role);
    console.log("PROJECT IDS:", userData.projectIds);

    const role = userData.role || "";
    const projectIds = userData.projectIds || [];

    let projects = [];

    // Owner får tilgang til alle prosjekter i databasen
    if (role === "owner") {
      const snapshot = await getDocs(collection(db, "projects"));

      snapshot.forEach((docSnap) => {
        projects.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
    }

    // Ansatte får kun prosjektene de er koblet til
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

    // Viser prosjektvelgeren på siden
    renderProjectSelector(projects);

    if (projects.length > 0) { //@aslak denne er endret for å sette id til den valgt av landingssiden

      // Hvis bruker har valgt et prosjekt på landingssiden, brukes dette først
      const selectedProjectId = localStorage.getItem("selected_project_id");
      const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];

      // Setter valgt prosjekt som aktivt
      setActiveProject(selectedProject);

      const projectSelector = document.getElementById("projectSelector");

      // Oppdaterer dropdown til riktig valgt prosjekt
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

// Viser prosjektvelger basert på hvor mange prosjekter brukeren har tilgang til
function renderProjectSelector(projects) {
  if (!projectSelectorContainer) return;

  // Dersom brukeren ikke har prosjekter
  if (!projects.length) {
    projectSelectorContainer.innerHTML = `
      <div class="big">Ingen prosjekter</div>
    `;
    return;
  }

  // Dersom brukeren kun har ett prosjekt, vises bare navnet
  if (projects.length === 1) {
    projectSelectorContainer.innerHTML = `
      <div class="big">${projects[0].name || "Uten navn"}</div>
    `;
    return;
  }

  // Dersom brukeren har flere prosjekter, vises dropdown
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

  // Når bruker velger et nytt prosjekt, oppdateres aktivt prosjekt
  select.addEventListener("change", () => {
    const selected = projects.find(p => p.id === select.value);
    setActiveProject(selected);
  });
}

// Finner firma-ID basert på kontaktpersonene som er koblet til prosjektet
async function getCompanyIdForProject(projectId) {
  if (!projectId) return null;

  // Henter prosjektet
  const projectSnap = await getDoc(doc(db, "projects", projectId));
  if (!projectSnap.exists()) return null;

  const projectData = projectSnap.data();

  // Henter kunder/kontaktpersoner koblet til prosjektet
  const customerIds = Array.isArray(projectData.customerIds)
    ? projectData.customerIds
    : [];

  if (!customerIds.length) return null;

  // Går gjennom kontaktpersonene og finner første firma-ID
  for (const customerId of customerIds) {
    const customerSnap = await getDoc(doc(db, "users", customerId));
    if (!customerSnap.exists()) continue;

    const companyId = customerSnap.data().companyId || null;
    if (companyId) return companyId;
  }

  return null;
}

// Synkroniserer tekst mellom liten kundebeskrivelse og utvidet modal
function syncCustomerDescriptionExpanded() {
  if (!customerDescription || !customerDescriptionExpanded) return;
  customerDescriptionExpanded.textContent = customerDescription.textContent || "";
}

// Laster inn prosjektbeskrivelse og kundebeskrivelse fra Firestore
async function loadDescriptions(projectId) {
  if (!projectId || !projectDescription || !customerDescription) return;

  try {

    // Henter prosjektdata
    const projectSnap = await getDoc(doc(db, "projects", projectId));
    const projectData = projectSnap.exists() ? projectSnap.data() : {};

    // Setter prosjektbeskrivelse
    projectDescription.textContent =
      projectData.prosjektBeskrivelse || projectData.description || "";

    // Finner firmaet som er koblet til prosjektet via kontaktperson
    const companyId = await getCompanyIdForProject(projectId);

    if (!companyId) {
      customerDescription.textContent = "";
      syncCustomerDescriptionExpanded();
      return;
    }

    // Henter firmadata
    const companySnap = await getDoc(doc(db, "companies", companyId));
    const companyData = companySnap.exists() ? companySnap.data() : {};

    // Setter kundebeskrivelse fra firma-dokumentet
    customerDescription.textContent =
      companyData.kundeBeskrivelse || companyData.customerDescription || "";

    syncCustomerDescriptionExpanded();

  } catch (err) {
    console.error("Kunne ikke laste beskrivelser:", err);
  }
}

// Lagrer prosjektbeskrivelse og kundebeskrivelse i Firestore
async function saveDescriptions(projectId) {
  if (!projectId || !projectDescription || !customerDescription) return;

  try {

    // Lagrer prosjektbeskrivelse på prosjektet
    await setDoc(
      doc(db, "projects", projectId),
      {
        prosjektBeskrivelse: projectDescription.textContent.trim(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    // Finner firmaet som tilhører prosjektet
    const companyId = await getCompanyIdForProject(projectId);

    if (companyId) {

      // Lagrer kundebeskrivelse på firmaet
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

// Setter valgt prosjekt som aktivt og varsler resten av systemet
function setActiveProject(project) {
  if (!project) return;

  // Oppdaterer prosjektnavn dersom elementet finnes
  if (projectName) {
    projectName.textContent = project.name || "Prosjekt";
  }

  // Oppdaterer aktivt delmål/milepæl
  if (projectGoal) {
    projectGoal.textContent = project.goal || "Ingen delmål registrert";
  }

  // Lagrer aktiv prosjekt-ID globalt slik andre filer kan bruke den
  window.currentProjectId = project.id;

  // Laster beskrivelser for valgt prosjekt
  loadDescriptions(project.id);

  // Trigger resten av systemet, for eksempel team, filer, chat og analytics
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

// Vises dersom brukeren ikke har prosjekter eller noe feiler ved lasting
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

// Lagrer prosjektbeskrivelse når feltet mister fokus
projectDescription?.addEventListener("blur", () => {
  saveDescriptions(window.currentProjectId);
});

// Lagrer kundebeskrivelse når feltet mister fokus
customerDescription?.addEventListener("blur", () => {
  saveDescriptions(window.currentProjectId);
});

// Åpner utvidet kundebeskrivelse
expandCustomerDescriptionBtn?.addEventListener("click", () => {
  syncCustomerDescriptionExpanded();
  customerDescriptionModal?.classList.add("active");
});

// Lukker utvidet kundebeskrivelse og lagrer
closeCustomerDescriptionBtn?.addEventListener("click", () => {
  customerDescriptionModal?.classList.remove("active");
  saveDescriptions(window.currentProjectId);
});

// Lukker modalen hvis brukeren klikker utenfor innholdet
customerDescriptionModal?.addEventListener("click", (e) => {
  if (e.target === customerDescriptionModal) {
    customerDescriptionModal.classList.remove("active");
    saveDescriptions(window.currentProjectId);
  }
});

// Synkroniserer tekst fra utvidet kundebeskrivelse tilbake til liten boks
customerDescriptionExpanded?.addEventListener("input", () => {
  if (!customerDescription) return;
  customerDescription.textContent = customerDescriptionExpanded.textContent || "";
});

// Lagrer når utvidet kundebeskrivelse mister fokus
customerDescriptionExpanded?.addEventListener("blur", () => {
  saveDescriptions(window.currentProjectId);
});