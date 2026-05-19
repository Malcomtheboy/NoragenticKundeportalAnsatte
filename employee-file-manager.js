/* =========================================================
   IMPORTS
========================================================= */

// Importerer Firebase-funksjoner som brukes til å koble prosjektet til Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

// Importerer Firebase Authentication. getAuth brukes her, mens signInWithEmailAndPassword er importert men ikke brukt i denne filen.
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Importerer Firestore-funksjoner for å hente, legge til, oppdatere og slette data.
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  addDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Importerer Firebase Storage-funksjoner for filopplasting, fil-URL og sletting av filer.
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";


/* =========================================================
   FIREBASE-OPPSETT
========================================================= */

// Konfigurasjonen kobler nettsiden til riktig Firebase-prosjekt.
const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

// Starter Firebase-appen med konfigurasjonen over.
const app = initializeApp(firebaseConfig);

// Lager tilgang til Firebase Authentication.
const auth = getAuth(app);

// Lager tilgang til Firestore-databasen.
const db = getFirestore(app);

// Lager tilgang til Firebase Storage, der filene faktisk lagres.
const storage = getStorage(app);


/* =========================================================
   HTML-ELEMENTER
========================================================= */

// Henter breadcrumb-området som viser hvilken mappe brukeren er i.
const breadcrumbBar = document.getElementById("breadcrumbBar");

// Henter området der filer og mapper skal vises.
const contentsList = document.getElementById("contentsList");

// Henter input-feltet som brukes til å velge fil fra PC-en.
const fileInput = document.getElementById("fileInput");

// Henter knappen som starter filopplasting.
const uploadBtn = document.getElementById("uploadBtn");

// Henter knappen som brukes til å lage ny mappe.
const newFolderBtn = document.getElementById("newFolderBtn");


/* =========================================================
   GLOBALE VARIABLER
========================================================= */

// Holder styr på hvilket prosjekt brukeren er inne i.
let currentProjectId = null;

// Holder styr på hvilken mappe brukeren er inne i.
// null betyr at brukeren er på rotnivået i prosjektet.
let currentFolderId = null;

// Lagrer stien til mappen brukeren er i.
// Starter alltid på "Hjem".
let currentPath = [{ id: null, name: "Hjem" }];


/* =========================================================
   HJELPEFUNKSJONER
========================================================= */

// Gjør om Firebase timestamp til norsk datoformat.
function formatDate(timestamp) {
  if (!timestamp) return "-";

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

  return date.toLocaleDateString("no-NO");
}

// Beskytter mot HTML-injeksjon ved å gjøre spesialtegn om til trygg HTML.
function escapeHtml(text) {
  if (text === null || text === undefined) return "";

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


/* =========================================================
   BREADCRUMBS
========================================================= */

// Viser navigasjonsstien øverst på siden, for eksempel: Hjem / Mappe / Undermappe.
function renderBreadcrumbs() {
  if (!breadcrumbBar) return;

  // Lager HTML for hvert nivå i currentPath.
  const html = currentPath.map((segment, index) => {
    const isLast = index === currentPath.length - 1;

    // Siste element er aktiv mappe og skal ikke være klikkbart.
    if (isLast) {
      return `<span class="breadcrumb-current">${escapeHtml(segment.name)}</span>`;
    }

    // Tidligere mapper vises som knapper slik at brukeren kan gå tilbake.
    return `
      <button class="breadcrumb-link" data-path-index="${index}">
        ${escapeHtml(segment.name)}
      </button>
      <span class="breadcrumb-separator">/</span>
    `;
  }).join("");

  breadcrumbBar.innerHTML = html;

  // Legger til klikkfunksjon på breadcrumb-knappene.
  breadcrumbBar.querySelectorAll("[data-path-index]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.pathIndex);

      // Kutter currentPath tilbake til valgt nivå.
      currentPath = currentPath.slice(0, index + 1);

      // Setter aktiv mappe til mappen brukeren klikket på.
      currentFolderId = currentPath[currentPath.length - 1].id;

      // Oppdaterer visningen.
      renderBreadcrumbs();
      await loadContents();
    });
  });
}


/* =========================================================
   VISIBILITY
========================================================= */

// Oppdaterer om kunden skal kunne se filen eller ikke.
async function setVisibility(fileId, isVisible) {
  try {
    await updateDoc(doc(db, "files", fileId), {
      customerVisibility: isVisible
    });
  } catch (e) {
    console.error("Visibility update feilet:", e);
    alert("Kunne ikke oppdatere visibility.");
  }
}


/* =========================================================
   SLETT FIL
========================================================= */

// Sletter en fil både fra Firebase Storage og fra Firestore.
async function deleteFile(fileId, storagePath, filename) {
  const confirmed = confirm(`Er du sikker på at du vil slette "${filename || "filen"}"?`);
  if (!confirmed) return;

  try {
    // Hvis filen har en storagePath, slettes den fysiske filen fra Firebase Storage.
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    }

    // Sletter filens metadata fra Firestore.
    await deleteDoc(doc(db, "files", fileId));

    // Oppdaterer listen etter sletting.
    await loadContents();
  } catch (e) {
    console.error("Sletting av fil feilet:", e);
    alert("Kunne ikke slette filen.");
  }
}


/* =========================================================
   SLETT MAPPE
========================================================= */

// Sletter en mappe, men bare hvis den er tom.
async function deleteFolder(folderId, folderName) {
  const confirmed = confirm(`Er du sikker på at du vil slette mappen "${folderName || "mappen"}"?`);
  if (!confirmed) return;

  try {
    // Sjekker om mappen har undermapper.
    const childFoldersQuery = query(
      collection(db, "folders"),
      where("projectId", "==", currentProjectId),
      where("parentFolderId", "==", folderId)
    );

    // Sjekker om mappen har filer.
    const childFilesQuery = query(
      collection(db, "files"),
      where("projectId", "==", currentProjectId),
      where("folderId", "==", folderId)
    );

    // Kjører begge spørringene samtidig for å spare tid.
    const [childFoldersSnapshot, childFilesSnapshot] = await Promise.all([
      getDocs(childFoldersQuery),
      getDocs(childFilesQuery)
    ]);

    // Stopper sletting hvis mappen ikke er tom.
    if (!childFoldersSnapshot.empty || !childFilesSnapshot.empty) {
      alert("Mappen kan ikke slettes fordi den inneholder filer eller undermapper.");
      return;
    }

    // Sletter mappen fra Firestore.
    await deleteDoc(doc(db, "folders", folderId));

    // Oppdaterer listen etter sletting.
    await loadContents();
  } catch (e) {
    console.error("Sletting av mappe feilet:", e);
    alert("Kunne ikke slette mappen.");
  }
}


/* =========================================================
   LAST INNHOLD
========================================================= */

// Henter og viser alle mapper og filer i aktiv mappe.
async function loadContents() {
  if (!currentProjectId || !contentsList) return;

  // Viser laste-tekst mens data hentes.
  contentsList.className = "loading-state";
  contentsList.innerHTML = "Laster...";

  try {
    // Henter mapper som tilhører prosjektet og ligger i aktiv mappe.
    const foldersQuery = query(
      collection(db, "folders"),
      where("projectId", "==", currentProjectId),
      where("parentFolderId", "==", currentFolderId)
    );

    // Henter filer som tilhører prosjektet og ligger i aktiv mappe.
    const filesQuery = query(
      collection(db, "files"),
      where("projectId", "==", currentProjectId),
      where("folderId", "==", currentFolderId)
    );

    // Henter mapper og filer samtidig.
    const [foldersSnapshot, filesSnapshot] = await Promise.all([
      getDocs(foldersQuery),
      getDocs(filesQuery)
    ]);

    const folders = [];
    const files = [];

    // Gjør Firestore-dokumenter om til vanlige JavaScript-objekter.
    foldersSnapshot.forEach((docSnap) => {
      folders.push({ id: docSnap.id, ...docSnap.data() });
    });

    filesSnapshot.forEach((docSnap) => {
      files.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sorterer mapper alfabetisk.
    folders.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    // Sorterer filer slik at nyeste opplastning vises først.
    files.sort((a, b) => (b.dateUploaded?.seconds || 0) - (a.dateUploaded?.seconds || 0));

    // Viser tom-melding hvis mappen ikke har innhold.
    if (folders.length === 0 && files.length === 0) {
      contentsList.className = "empty-state";
      contentsList.innerHTML = "Denne mappen er tom.";
      return;
    }

    // Starter HTML-tabellen.
    let html = `
      <div class="table-wrap">
        <table class="files-table employee-files-table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>Type</th>
              <th>Lastet opp</th>
              <th>Av</th>
              <th>Synlighet</th>
              <th>Handling</th>
            </tr>
          </thead>
          <tbody>
    `;

    // Legger mapper inn i tabellen.
    folders.forEach((folder) => {
      html += `
        <tr>
          <td>
            <button
              class="link-button"
              data-folder-id="${folder.id}"
              data-folder-name="${escapeHtml(folder.name || "")}"
            >
              ${escapeHtml(folder.name || "-")}
            </button>
          </td>
          <td>Mappe</td>
          <td>${formatDate(folder.createdAt)}</td>
          <td>${escapeHtml(folder.createdBy || "-")}</td>
          <td>-</td>
          <td>
            <button
              class="delete-file-btn delete-folder-btn"
              data-folder-id="${folder.id}"
              data-folder-name="${escapeHtml(folder.name || "Mappe")}"
              type="button"
            >
              Slett
            </button>
          </td>
        </tr>
      `;
    });

    // Legger filer inn i tabellen.
    files.forEach((file) => {
      // Checkbox settes til checked hvis filen er synlig for kunden.
      const checked = file.customerVisibility ? "checked" : "";

      // Hvis filen har URL, vises filnavnet som en klikkbar lenke.
      const nameCell = file.fileUrl
        ? `<a class="file-link" href="${escapeHtml(file.fileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.filename || "")}</a>`
        : escapeHtml(file.filename || "-");

      html += `
        <tr>
          <td>${nameCell}</td>
          <td>Fil</td>
          <td>${formatDate(file.dateUploaded)}</td>
          <td>${escapeHtml(file.uploadedBy || "-")}</td>
          <td>
            <label class="visibility-cell">
              <input type="checkbox" class="visibility-toggle" data-file-id="${file.id}" ${checked}>
            </label>
          </td>
          <td>
            <button
              class="delete-file-btn"
              data-file-id="${file.id}"
              data-storage-path="${escapeHtml(file.storagePath || "")}"
              data-file-name="${escapeHtml(file.filename || "Fil")}"
              type="button"
            >
              Slett
            </button>
          </td>
        </tr>
      `;
    });

    // Avslutter HTML-tabellen.
    html += `
          </tbody>
        </table>
      </div>
    `;

    // Viser ferdig tabell på siden.
    contentsList.className = "";
    contentsList.innerHTML = html;

    // Legger til klikk på mapper slik at brukeren kan åpne dem.
    contentsList.querySelectorAll("[data-folder-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        currentFolderId = btn.dataset.folderId;

        currentPath.push({
          id: btn.dataset.folderId,
          name: btn.dataset.folderName
        });

        renderBreadcrumbs();
        await loadContents();
      });
    });

    // Legger til event listener på visibility-checkboxene.
    contentsList.querySelectorAll(".visibility-toggle").forEach((checkbox) => {
      checkbox.addEventListener("change", async () => {
        await setVisibility(checkbox.dataset.fileId, checkbox.checked);
      });
    });

    // Legger til event listener på slett-knapper for filer.
    contentsList.querySelectorAll(".delete-file-btn:not(.delete-folder-btn)").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteFile(
          btn.dataset.fileId,
          btn.dataset.storagePath,
          btn.dataset.fileName
        );
      });
    });

    // Legger til event listener på slett-knapper for mapper.
    contentsList.querySelectorAll(".delete-folder-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteFolder(
          btn.dataset.folderId,
          btn.dataset.folderName
        );
      });
    });
  } catch (e) {
    console.error("Load contents error:", e);
    contentsList.className = "error-state";
    contentsList.innerHTML = "Kunne ikke laste filer.";
  }
}


/* =========================================================
   LAST OPP FIL
========================================================= */

// Laster opp valgt fil til Firebase Storage og lagrer metadata i Firestore.
async function uploadSelectedFile(file) {
  if (!file || !currentProjectId) return;

  try {
    // Deaktiverer opplastingsknappen mens opplastingen pågår.
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Laster opp...";
    }

    // Lager et unikt filnavn ved å legge timestamp foran originalt filnavn.
    const uniqueFileName = `${Date.now()}-${file.name}`;

    // Lager Storage-referanse til hvor filen skal lagres.
    const storageRef = ref(storage, `projects/${currentProjectId}/${uniqueFileName}`);

    // Laster filen opp til Firebase Storage.
    await uploadBytes(storageRef, file);

    // Henter nedlastingslenken til filen.
    const downloadURL = await getDownloadURL(storageRef);

    // Lagrer informasjon om filen i Firestore.
    await addDoc(collection(db, "files"), {
      filename: file.name,
      fileUrl: downloadURL,
      storagePath: `projects/${currentProjectId}/${uniqueFileName}`,
      projectId: currentProjectId,
      folderId: currentFolderId || null,
      uploadedBy: "Ansatt",
      customerVisibility: false,
      dateUploaded: serverTimestamp()
    });

    // Tømmer fil-inputen.
    fileInput.value = "";

    // Oppdaterer filoversikten.
    await loadContents();
  } catch (e) {
    console.error("Upload error:", e);
    alert("Feil ved opplasting");
  } finally {
    // Aktiverer opplastingsknappen igjen uansett om opplasting lyktes eller feilet.
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Last opp";
    }
  }
}


/* =========================================================
   OPPRETT MAPPE
========================================================= */

// Oppretter en ny mappe i valgt prosjekt/mappe.
async function createFolder() {
  if (!currentProjectId) {
    alert("Ingen prosjekt valgt");
    return;
  }

  // Spør brukeren om navn på den nye mappen.
  const name = prompt("Navn på ny mappe:");

  // Stopper hvis brukeren ikke skrev inn et gyldig navn.
  if (!name || !name.trim()) return;

  try {
    // Deaktiverer knappen mens mappen opprettes.
    if (newFolderBtn) {
      newFolderBtn.disabled = true;
      newFolderBtn.textContent = "Oppretter...";
    }

    // Lagrer mappen i Firestore.
    await addDoc(collection(db, "folders"), {
      name: name.trim(),
      projectId: currentProjectId,
      parentFolderId: currentFolderId || null,
      createdAt: serverTimestamp(),
      createdBy: "Ansatt"
    });

    // Oppdaterer mappe- og fillisten.
    await loadContents();
  } catch (e) {
    console.error("Opprett mappe feilet:", e);
    alert("Kunne ikke opprette mappe");
  } finally {
    // Aktiverer knappen igjen.
    if (newFolderBtn) {
      newFolderBtn.disabled = false;
      newFolderBtn.textContent = "Ny mappe";
    }
  }
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

// Kobler opplastingsknappen til skjult file input.
if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => {
    fileInput.click();
  });

  // Når brukeren velger en fil, sendes filen til uploadSelectedFile.
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    await uploadSelectedFile(file);
  });
}

// Kobler ny mappe-knappen til createFolder-funksjonen.
if (newFolderBtn) {
  newFolderBtn.addEventListener("click", createFolder);
}

// Lytter etter at prosjektet endres et annet sted i systemet.
window.addEventListener("projectChanged", async (event) => {
  currentProjectId = event.detail.projectId;

  // Når prosjekt endres, settes brukeren tilbake til rotnivået.
  currentFolderId = null;
  currentPath = [{ id: null, name: "Hjem" }];

  renderBreadcrumbs();
  await loadContents();
});


/* =========================================================
   INIT
========================================================= */

// Starter filbehandleren dersom et prosjekt allerede er valgt.
async function initFileManager() {
  if (window.currentProjectId) {
    currentProjectId = window.currentProjectId;

    // Starter alltid i rotmappen.
    currentFolderId = null;
    currentPath = [{ id: null, name: "Hjem" }];

    renderBreadcrumbs();
    await loadContents();
  }
}

// Kjører oppstartsfunksjonen.
initFileManager();
