import { auth } from "./firebase-auth.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");
const createCustomerBtn = document.getElementById("createCustomerBtn");
const createProjectBtn = document.getElementById("createProjectBtn");
const createEmployeeBtn = document.getElementById("createEmployeeBtn");
const editBtn = document.getElementById("heroEditBtn");

onAuthStateChanged(auth, (user) => {
  const path = window.location.pathname.toLowerCase();
  const onLogin = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");

  if (onDashboard && !user) {
    window.location.href = "login.html";
    return;
  }

  if (onLogin && user) {
    window.location.href = "index.html";
    return;
  }

  const role = localStorage.getItem("employee_role");

  if (role === "owner") {
    createCustomerBtn?.classList.remove("hidden");
    createProjectBtn?.classList.remove("hidden");
    createEmployeeBtn?.classList.remove("hidden");
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Feil ved logout:", error);
    }

    localStorage.clear();
    window.location.href = "login.html";
  });
}

if (editBtn) {
  editBtn.addEventListener("click", () => {
    if (window.openAdminModal) {
      window.openAdminModal();
    }
  });
}