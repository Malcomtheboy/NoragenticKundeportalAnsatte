import { auth, db } from "./firebase-auth.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const btn = document.getElementById("createCustomerBtn");

if (btn) {
  btn.addEventListener("click", async () => {

    const name = prompt("Navn på kunde:");
    const email = prompt("E-post:");
    const password = prompt("Passord:");

    if (!name || !email || !password) {
      alert("Alle felt må fylles ut");
      return;
    }

    try {
      // lagre owner info før vi bytter bruker
      const ownerEmail = localStorage.getItem("employee_email");
      const ownerPassword = prompt("Skriv inn ditt passord for å fortsette:");

      // opprett kunde
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCred.user;

      // lagre i Firestore
      await setDoc(doc(db, "users", newUser.uid), {
        name: name,
        email: email,
        role: "customer",
        projectIds: ["PROJECT_ABC_123"] // midlertidig
      });

      alert("Kunde opprettet!");

      // logg tilbake til owner
      await signInWithEmailAndPassword(auth, ownerEmail, ownerPassword);

    } catch (err) {
      console.error(err);
      alert("Feil: " + err.message);
    }
  });
}
