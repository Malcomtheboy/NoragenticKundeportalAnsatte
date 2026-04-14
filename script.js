import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =========================================================
   FIREBASE CONFIG
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  databaseURL: "https://noragenticportal-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const isLoginPage     = !!document.getElementById("loginForm");
const isDashboardPage = !!document.getElementById("projectName");

/* =========================================================
   ROUTE GUARD
========================================================= */
onAuthStateChanged(auth, (user) => {
  const path        = (window.location.pathname || "").toLowerCase();
  const onLogin     = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");
  if (onDashboard && !user) window.location.href = "login.html";
  if (onLogin     &&  user) window.location.href = "index.html";
});

/* =========================================================
   LOGIN
========================================================= */
if (isLoginPage) {
  const form  = document.getElementById("loginForm");
  const hint  = document.getElementById("hint");
  const email = document.getElementById("loginEmail");
  const pass  = document.getElementById("loginPassword");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hint.textContent = "Logger inn…";
    try {
      await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
    } catch (err) {
      hint.textContent = "Feil e-post eller passord.";
    }
  });
}

/* =========================================================
   DASHBOARD
========================================================= */
if (isDashboardPage) {

  const projects = {
    p1: { name: "Prosjekt 1", id: "PROJECT_ABC_123" },
    p2: { name: "Prosjekt 2", id: "PROJECT_DEF_456" },
    p3: { name: "Prosjekt 3", id: "PROJECT_GHI_789" }
  };

  let current = "p1";

  const projectNameEl = document.getElementById("projectName");
  const tabs          = document.querySelectorAll(".tab[data-project]");

  function activateProject(key) {
    current = key;
    const p = projects[key];
    if (projectNameEl) projectNameEl.textContent = p.name;

    window.currentProjectId = p.id;
    window.dispatchEvent(new CustomEvent("projectChanged", { detail: { projectId: p.id } }));
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      activateProject(tab.dataset.project);
    });
  });

  // Init med første prosjekt
  activateProject("p1");

  /* Logg ut */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "login.html";
    });
  }

  /* Rediger-knapp i hero */
  const editBtn = document.getElementById("heroEditBtn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      if (window.openAdminModal) window.openAdminModal();
    });
  }
}