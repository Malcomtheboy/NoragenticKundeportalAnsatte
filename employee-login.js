import { auth, db } from "./firebase-auth.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const form = document.getElementById("loginForm");
const hint = document.getElementById("hint");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      hint.textContent = "Fyll ut både e-post og passord.";
      return;
    }

    hint.textContent = "Logger inn...";

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Hent brukerdata fra Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        hint.textContent = "Fant ikke brukerdata i databasen.";
        return;
      }

      const userData = userSnap.data();

      // Ekstra sjekk: denne siden er for ansatte/owner
      if (userData.role !== "employee" && userData.role !== "owner") {
        hint.textContent = "Denne brukeren har ikke tilgang til ansattportalen.";
        return;
      }

      // Lagre enkel frontend-state så eksisterende guard fortsatt funker
      localStorage.setItem("employee_logged_in", "true");
      localStorage.setItem("employee_uid", user.uid);
      localStorage.setItem("employee_role", userData.role || "");
      localStorage.setItem("employee_name", userData.name || "");
      localStorage.setItem("employee_email", userData.email || email);

      hint.textContent = "Innlogging vellykket. Sender videre...";
      setTimeout(() => {
        window.location.href = "landing.html";
      }, 300);

    } catch (error) {
      console.error("Login error:", error);

      switch (error.code) {
        case "auth/invalid-email":
          hint.textContent = "Ugyldig e-postadresse.";
          break;
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          hint.textContent = "Feil e-post eller passord.";
          break;
        default:
          hint.textContent = "Innlogging feilet. Prøv igjen.";
      }
    }
  });
}
