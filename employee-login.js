// Importerer Firebase Authentication og Firestore-database fra felles Firebase-fil
import { auth, db } from "./firebase-auth.js";

// Funksjon for innlogging med e-post og passord
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firestore-funksjoner for å hente brukerdata
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Henter HTML-elementer fra login-siden
const form = document.getElementById("loginForm");
const hint = document.getElementById("hint");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

// Sjekker at login-skjemaet finnes før event listener legges til
if (form) {

  // Kjører når brukeren trykker på "Logg inn"
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Henter inn e-post og passord fra inputfeltene
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // Enkel validering før innlogging
    if (!email || !password) {
      hint.textContent = "Fyll ut både e-post og passord.";
      return;
    }

    hint.textContent = "Logger inn...";

    try {

      // Logger inn brukeren med Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Henter tilhørende brukerdata fra Firestore basert på UID
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      // Hvis brukerdokument ikke finnes, stoppes innloggingen
      if (!userSnap.exists()) {
        hint.textContent = "Fant ikke brukerdata i databasen.";
        return;
      }

      const userData = userSnap.data();

      // Sjekker at brukeren faktisk har tilgang til ansattportalen
      if (userData.role !== "employee" && userData.role !== "owner") {
        hint.textContent = "Denne brukeren har ikke tilgang til ansattportalen.";
        return;
      }

      // Lagrer enkel frontend-state i localStorage
      // Dette brukes videre for rollevisning og route guard
      localStorage.setItem("employee_logged_in", "true");
      localStorage.setItem("employee_uid", user.uid);
      localStorage.setItem("employee_role", userData.role || "");
      localStorage.setItem("employee_name", userData.name || "");
      localStorage.setItem("employee_email", userData.email || email);

      // Gir brukeren tilbakemelding og sender videre til landingssiden
      hint.textContent = "Innlogging vellykket. Sender videre...";

      setTimeout(() => {
        window.location.href = "landing.html";
      }, 300);

    } catch (error) {

      // Logger teknisk feil i console for debugging
      console.error("Login error:", error);

      // Viser mer brukervennlige feilmeldinger basert på Firebase-feilkode
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