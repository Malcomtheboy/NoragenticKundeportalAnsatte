import { auth, db } from "./firebase-auth.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


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

 async function loadDescription(projectId) {
  if (!projectId) return;

  try {
    const projectSnap = await getDoc(doc(db, "projects", projectId));
    if (!projectSnap.exists()) return;

    const data = projectSnap.data();

    if (projectDescription) {
     projectDescription.textContent = data.prosjektBeskrivelse || "";
    }

    if (customerDescription) {
      customerDescription.textContent = data.kundeBeskrivelse || "";
    }
  } catch (error) {
    console.error("Kunne ikke laste beskrivelser:", error);
  }
}


 async function saveDescription(projectId) {
  if (!projectId) return;

  try {
    
    await updateDoc(doc(db, "projects", projectId), {
     prosjektBeskrivelse: projectDescription ? projectDescription.textContent.trim() : "",
     kundeBeskrivelse: customerDescription ? customerDescription.textContent.trim() : ""
    });
  } catch (error) {
    console.error("Kunne ikke lagre beskrivelser:", error);
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