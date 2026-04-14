import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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

const app     = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

/* =========================================================
   TILSTAND
========================================================= */
let currentProjectId = window.currentProjectId || "PROJECT_ABC_123";
let currentFolderId  = null; // null = rot-nivå
let folderStack      = [];   // breadcrumb-stack: [{id, name}]

/* =========================================================
   DOM-REFERANSER
========================================================= */
const contentsList  = document.getElementById("contentsList");
const breadcrumbBar = document.getElementById("breadcrumbBar");
const uploadBtn     = document.getElementById("uploadBtn");
const fileInput     = document.getElementById("fileInput");
const newFolderBtn  = document.getElementById("newFolderBtn");

if (!contentsList) {
  // Ikke på riktig side
} else {

  /* =========================================================
     BREADCRUMB
  ========================================================= */
  function renderBreadcrumb() {
    breadcrumbBar.innerHTML = "";

    const rootBtn = document.createElement("button");
    rootBtn.className    = "breadcrumb-link";
    rootBtn.textContent  = "Rot";
    rootBtn.addEventListener("click", () => navigateToRoot());
    breadcrumbBar.appendChild(rootBtn);

    folderStack.forEach((folder, i) => {
      const sep = document.createElement("span");
      sep.className   = "breadcrumb-separator";
      sep.textContent = "/";
      breadcrumbBar.appendChild(sep);

      if (i === folderStack.length - 1) {
        const cur = document.createElement("span");
        cur.className   = "breadcrumb-current";
        cur.textContent = folder.name;
        breadcrumbBar.appendChild(cur);
      } else {
        const btn = document.createElement("button");
        btn.className   = "breadcrumb-link";
        btn.textContent = folder.name;
        btn.addEventListener("click", () => navigateToFolder(folder.id, folder.name, i));
        breadcrumbBar.appendChild(btn);
      }
    });
  }

  function navigateToRoot() {
    currentFolderId = null;
    folderStack     = [];
    renderBreadcrumb();
    loadContents();
  }

  function navigateToFolder(folderId, folderName, stackIndex) {
    folderStack     = folderStack.slice(0, stackIndex + 1);
    currentFolderId = folderId;
    renderBreadcrumb();
    loadContents();
  }

  function openFolder(folderId, folderName) {
    folderStack.push({ id: folderId, name: folderName });
    currentFolderId = folderId;
    renderBreadcrumb();
    loadContents();
  }

  /* =========================================================
     LAST INN INNHOLD
     // Mohamed – fikset compound query-feil ved å filtrere
     // parentId og folderId lokalt i JS i stedet for i Firestore,
     // slik at det ikke kreves composite indexes i Firebase Console.
  ========================================================= */
  async function loadContents() {
    contentsList.className   = "loading-state";
    contentsList.textContent = "Laster...";

    try {
      // Mohamed – kun én where() per query for å unngå index-krav
      const foldersSnap = await getDocs(query(
        collection(db, "folders"),
        where("projectId", "==", currentProjectId)
      ));
      const folders = [];
      foldersSnap.forEach(d => {
        const data = d.data();
        // Mohamed – filtrer riktig mappe-nivå lokalt
        const parent = data.parentId ?? null;
        if (parent === currentFolderId) {
          folders.push({ id: d.id, ...data });
        }
      });

      // Mohamed – samme løsning for filer
      const filesSnap = await getDocs(query(
        collection(db, "files"),
        where("projectId", "==", currentProjectId)
      ));
      const files = [];
      filesSnap.forEach(d => {
        const data = d.data();
        const folder = data.folderId ?? null;
        if (folder === currentFolderId) {
          files.push({ id: d.id, ...data });
        }
      });

      renderContents(folders, files);

    } catch (e) {
      contentsList.className   = "error-state";
      contentsList.textContent = "Feil ved lasting: " + e.message;
      console.error(e);
    }
  }

  /* =========================================================
     RENDER TABELL
  ========================================================= */
  function renderContents(folders, files) {
    if (folders.length === 0 && files.length === 0) {
      contentsList.className  = "empty-state";
      contentsList.textContent = "Ingen filer eller mapper her ennå.";
      return;
    }

    contentsList.className = "table-wrap";
    contentsList.innerHTML = "";

    const table = document.createElement("table");
    table.className = "files-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Navn</th>
          <th>Type</th>
          <th>Synlig for kunde</th>
          <th>Handlinger</th>
        </tr>
      </thead>`;

    const tbody = document.createElement("tbody");

    /* --- Mapper --- */
    folders.forEach(folder => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <button class="link-button">📁 ${escHtml(folder.name)}</button>
        </td>
        <td>Mappe</td>
        <td class="visibility-cell">
          <input type="checkbox" class="visibility-toggle"
            ${folder.visibleToClient ? "checked" : ""} />
        </td>
        <td>
          <button class="upload-btn secondary" style="padding:4px 10px;font-size:12px">
            Slett
          </button>
        </td>`;

      tr.querySelector(".link-button").addEventListener("click", () => {
        openFolder(folder.id, folder.name);
      });

      tr.querySelector(".visibility-toggle").addEventListener("change", async (e) => {
        try {
          await updateDoc(doc(db, "folders", folder.id), {
            visibleToClient: e.target.checked
          });
        } catch (err) { console.error(err); }
      });

      tr.querySelector(".upload-btn").addEventListener("click", async () => {
        if (!confirm(`Slett mappen "${folder.name}"?`)) return;
        try {
          await deleteDoc(doc(db, "folders", folder.id));
          loadContents();
        } catch (err) { console.error(err); }
      });

      tbody.appendChild(tr);
    });

    /* --- Filer --- */
    files.forEach(file => {
      // Mohamed – la til fallback for fileName slik at eldre filer
      // uten dette feltet ikke krasjer escHtml() med undefined
      const displayName = file.fileName || file.name || file.message || "Ukjent fil";
      const fileUrl     = file.fileUrl  || file.url  || "#";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <a class="file-link" href="${fileUrl}" target="_blank" rel="noopener">
            📄 ${escHtml(displayName)}
          </a>
        </td>
        <td>Fil</td>
        <td class="visibility-cell">
          <input type="checkbox" class="visibility-toggle"
            ${file.visibleToClient ? "checked" : ""} />
        </td>
        <td>
          <button class="upload-btn secondary" style="padding:4px 10px;font-size:12px">
            Slett
          </button>
        </td>`;

      tr.querySelector(".visibility-toggle").addEventListener("change", async (e) => {
        try {
          await updateDoc(doc(db, "files", file.id), {
            visibleToClient: e.target.checked
          });
        } catch (err) { console.error(err); }
      });

      tr.querySelector(".upload-btn").addEventListener("click", async () => {
        if (!confirm(`Slett filen "${displayName}"?`)) return;
        try {
          const fileRef = ref(storage, `files/${currentProjectId}/${displayName}`);
          await deleteObject(fileRef).catch(() => {});
          await deleteDoc(doc(db, "files", file.id));
          loadContents();
        } catch (err) { console.error(err); }
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    contentsList.appendChild(table);
  }

  /* =========================================================
     LAST OPP FIL
     NB: projectId-felt lagres slik at analytics.js kan telle
  ========================================================= */
  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadBtn.disabled    = true;
    uploadBtn.textContent = "Laster opp…";

    try {
      const path    = `files/${currentProjectId}/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      await addDoc(collection(db, "files"), {
        fileName:        file.name,
        fileUrl:         url,
        projectId:       currentProjectId,   // Mohamed – projectId lagres slik at analytics.js kan telle filer per prosjekt
        folderId:        currentFolderId,
        visibleToClient: false,
        uploadedBy:      auth.currentUser?.uid || "anon",
        createdAt:       serverTimestamp()
      });

      fileInput.value = "";
      loadContents();

      // Oppdater analytics etter opplasting
      window.dispatchEvent(
        new CustomEvent("projectChanged", { detail: { projectId: currentProjectId } })
      );

    } catch (e) {
      alert("Feil ved opplasting: " + e.message);
      console.error(e);
    } finally {
      uploadBtn.disabled    = false;
      uploadBtn.textContent = "Last opp";
    }
  });

  /* =========================================================
     NY MAPPE
  ========================================================= */
  newFolderBtn.addEventListener("click", async () => {
    const name = prompt("Navn på ny mappe:");
    if (!name?.trim()) return;

    try {
      await addDoc(collection(db, "folders"), {
        name:            name.trim(),
        projectId:       currentProjectId,
        parentId:        currentFolderId,
        visibleToClient: false,
        createdAt:       serverTimestamp()
      });
      loadContents();
    } catch (e) {
      alert("Kunne ikke opprette mappe: " + e.message);
      console.error(e);
    }
  });

  /* =========================================================
     PROSJEKTBYTTE
  ========================================================= */
  window.addEventListener("projectChanged", (e) => {
    const newId = e.detail?.projectId;
    if (newId && newId !== currentProjectId) {
      currentProjectId = newId;
      currentFolderId  = null;
      folderStack      = [];
      renderBreadcrumb();
      loadContents();
    }
  });

  /* =========================================================
     INIT
  ========================================================= */
  renderBreadcrumb();
  loadContents();

} // end if contentsList

/* =========================================================
   HJELPEFUNKSJON
   // Mohamed – escHtml brukes for å unngå XSS når filnavn
   // vises direkte i innerHTML
========================================================= */
function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}