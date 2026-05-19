/* =========================================================
   IMPORTS
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import { showError, showConfirm } from "./popup-manager.js";


/* =========================================================
   FIREBASE-OPPSETT
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);


/* =========================================================
   HTML-ELEMENTER
========================================================= */

const breadcrumbBar = document.getElementById("breadcrumbBar");
const contentsList = document.getElementById("contentsList");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const newFolderBtn = document.getElementById("newFolderBtn");

const folderModal = document.getElementById("folderModal");
const folderNameInput = document.getElementById("folderNameInput");
const createFolderConfirmBtn = document.getElementById("createFolderConfirmBtn");
const closeFolderModal = document.getElementById("closeFolderModal");
const cancelFolderBtn = document.getElementById("cancelFolderBtn");


/* =========================================================
   GLOBALE VARIABLER
========================================================= */

let currentProjectId = null;
let currentFolderId = null;
let currentPath = [{ id: null, name: "Hjem" }];


/* =========================================================
   HJELPEFUNKSJONER
========================================================= */

function formatDate(timestamp) {
  if (!timestamp) return "-";

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("no-NO");
}

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

function renderBreadcrumbs() {
  if (!breadcrumbBar) return;

  const html = currentPath.map((segment, index) => {
    const isLast = index === currentPath.length - 1;

    if (isLast) {
      return `<span class="breadcrumb-current">${escapeHtml(segment.name)}</span>`;
    }

    return `
      <button class="breadcrumb-link" data-path-index="${index}">
        ${escapeHtml(segment.name)}
      </button>
      <span class="breadcrumb-separator">/</span>
    `;
  }).join("");

  breadcrumbBar.innerHTML = html;

  breadcrumbBar.querySelectorAll("[data-path-index]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.pathIndex);

      currentPath = currentPath.slice(0, index + 1);
      currentFolderId = currentPath[currentPath.length - 1].id;

      renderBreadcrumbs();
      await loadContents();
    });
  });
}


/* =========================================================
   VISIBILITY
========================================================= */

async function setVisibility(fileId, isVisible) {
  try {
    await updateDoc(doc(db, "files", fileId), {
      customerVisibility: isVisible
    });
  } catch (e) {
    console.error("Visibility update feilet:", e);
    showError("Kunne ikke oppdatere visibility.");
  }
}


/* =========================================================
   SLETT FIL
========================================================= */

async function deleteFile(fileId, storagePath, filename) {
  const confirmed = await showConfirm(
    `Er du sikker på at du vil slette "${filename || "filen"}"?`
  );

  if (!confirmed) return;

  try {
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    }

    await deleteDoc(doc(db, "files", fileId));
    await loadContents();
  } catch (e) {
    console.error("Sletting av fil feilet:", e);
    showError("Kunne ikke slette filen.");
  }
}


/* =========================================================
   SLETT MAPPE
========================================================= */

async function deleteFolder(folderId, folderName) {
  const confirmed = await showConfirm(
    `Er du sikker på at du vil slette mappen "${folderName || "mappen"}"?`
  );

  if (!confirmed) return;

  try {
    const childFoldersQuery = query(
      collection(db, "folders"),
      where("projectId", "==", currentProjectId),
      where("parentFolderId", "==", folderId)
    );

    const childFilesQuery = query(
      collection(db, "files"),
      where("projectId", "==", currentProjectId),
      where("folderId", "==", folderId)
    );

    const [childFoldersSnapshot, childFilesSnapshot] = await Promise.all([
      getDocs(childFoldersQuery),
      getDocs(childFilesQuery)
    ]);

    if (!childFoldersSnapshot.empty || !childFilesSnapshot.empty) {
      showError("Mappen kan ikke slettes fordi den inneholder filer eller undermapper.");
      return;
    }

    await deleteDoc(doc(db, "folders", folderId));

    if (currentFolderId === folderId) {
      currentFolderId = null;
      currentPath = [{ id: null, name: "Hjem" }];
      renderBreadcrumbs();
    }

    await loadContents();
  } catch (e) {
    console.error("Sletting av mappe feilet:", e);
    showError("Kunne ikke slette mappen.");
  }
}


/* =========================================================
   LAST INNHOLD
========================================================= */

async function loadContents() {
  if (!currentProjectId || !contentsList) return;

  contentsList.className = "loading-state";
  contentsList.innerHTML = "Laster...";

  try {
    const foldersQuery = query(
      collection(db, "folders"),
      where("projectId", "==", currentProjectId),
      where("parentFolderId", "==", currentFolderId)
    );

    const filesQuery = query(
      collection(db, "files"),
      where("projectId", "==", currentProjectId),
      where("folderId", "==", currentFolderId)
    );

    const [foldersSnapshot, filesSnapshot] = await Promise.all([
      getDocs(foldersQuery),
      getDocs(filesQuery)
    ]);

    const folders = [];
    const files = [];

    foldersSnapshot.forEach((docSnap) => {
      folders.push({ id: docSnap.id, ...docSnap.data() });
    });

    filesSnapshot.forEach((docSnap) => {
      files.push({ id: docSnap.id, ...docSnap.data() });
    });

    folders.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    files.sort((a, b) => (b.dateUploaded?.seconds || 0) - (a.dateUploaded?.seconds || 0));

    if (folders.length === 0 && files.length === 0) {
      contentsList.className = "empty-state";
      contentsList.innerHTML = "Denne mappen er tom.";
      return;
    }

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

    folders.forEach((folder) => {
      html += `
        <tr>
          <td>
            <button
              class="link-button folder-open-btn"
              data-folder-id="${folder.id}"
              data-folder-name="${escapeHtml(folder.name || "")}"
              type="button"
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

    files.forEach((file) => {
      const checked = file.customerVisibility ? "checked" : "";

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
              <input
                type="checkbox"
                class="visibility-toggle"
                data-file-id="${file.id}"
                ${checked}
              >
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

    html += `
          </tbody>
        </table>
      </div>
    `;

    contentsList.className = "";
    contentsList.innerHTML = html;

    contentsList.querySelectorAll(".folder-open-btn").forEach((btn) => {
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

    contentsList.querySelectorAll(".visibility-toggle").forEach((checkbox) => {
      checkbox.addEventListener("change", async () => {
        await setVisibility(checkbox.dataset.fileId, checkbox.checked);
      });
    });

    contentsList.querySelectorAll(".delete-file-btn:not(.delete-folder-btn)").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteFile(
          btn.dataset.fileId,
          btn.dataset.storagePath,
          btn.dataset.fileName
        );
      });
    });

    contentsList.querySelectorAll(".delete-folder-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

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

async function uploadSelectedFile(file) {
  if (!file || !currentProjectId) return;

  try {
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Laster opp...";
    }

    const uniqueFileName = `${Date.now()}-${file.name}`;
    const storagePath = `projects/${currentProjectId}/${uniqueFileName}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file);

    const downloadURL = await getDownloadURL(storageRef);

    await addDoc(collection(db, "files"), {
      filename: file.name,
      fileUrl: downloadURL,
      storagePath,
      projectId: currentProjectId,
      folderId: currentFolderId || null,
      uploadedBy: "Ansatt",
      customerVisibility: false,
      dateUploaded: serverTimestamp()
    });

    if (fileInput) fileInput.value = "";

    await loadContents();
  } catch (e) {
    console.error("Upload error:", e);
    showError("Feil ved opplasting");
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Last opp";
    }
  }
}


/* =========================================================
   OPPRETT MAPPE
========================================================= */

function resetFolderModal() {
  if (folderNameInput) {
    folderNameInput.value = "";
    folderNameInput.disabled = false;
    folderNameInput.readOnly = false;
  }

  if (createFolderConfirmBtn) {
    createFolderConfirmBtn.disabled = false;
    createFolderConfirmBtn.textContent = "Opprett";
  }
}

function openFolderModal() {
  if (!folderModal) return;

  resetFolderModal();
  folderModal.classList.remove("is-hidden");

  setTimeout(() => {
    folderNameInput?.focus();
  }, 50);
}

function closeFolderModalFn() {
  folderModal?.classList.add("is-hidden");
  resetFolderModal();
}

async function createFolderFromModal() {
  if (!currentProjectId) {
    showError("Ingen prosjekt valgt");
    return;
  }

  const name = folderNameInput?.value.trim();

  if (!name) {
    showError("Fyll ut alle felt");
    folderNameInput?.focus();
    return;
  }

  try {
    if (createFolderConfirmBtn) {
      createFolderConfirmBtn.disabled = true;
      createFolderConfirmBtn.textContent = "Oppretter...";
    }

    await addDoc(collection(db, "folders"), {
      name,
      projectId: currentProjectId,
      parentFolderId: currentFolderId || null,
      createdAt: serverTimestamp(),
      createdBy: "Ansatt"
    });

    closeFolderModalFn();
    await loadContents();
  } catch (e) {
    console.error("Opprett mappe feilet:", e);
    showError("Kunne ikke opprette mappe");
  } finally {
    if (createFolderConfirmBtn) {
      createFolderConfirmBtn.disabled = false;
      createFolderConfirmBtn.textContent = "Opprett";
    }
  }
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    await uploadSelectedFile(file);
  });
}

newFolderBtn?.addEventListener("click", openFolderModal);
createFolderConfirmBtn?.addEventListener("click", createFolderFromModal);
closeFolderModal?.addEventListener("click", closeFolderModalFn);
cancelFolderBtn?.addEventListener("click", closeFolderModalFn);

folderModal?.addEventListener("click", (e) => {
  if (e.target === folderModal) {
    closeFolderModalFn();
  }
});

folderNameInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    await createFolderFromModal();
  }

  if (e.key === "Escape") {
    closeFolderModalFn();
  }
});

window.addEventListener("projectChanged", async (event) => {
  currentProjectId = event.detail.projectId;

  currentFolderId = null;
  currentPath = [{ id: null, name: "Hjem" }];

  renderBreadcrumbs();
  await loadContents();
});


/* =========================================================
   INIT
========================================================= */

async function initFileManager() {
  if (window.currentProjectId) {
    currentProjectId = window.currentProjectId;

    currentFolderId = null;
    currentPath = [{ id: null, name: "Hjem" }];

    renderBreadcrumbs();
    await loadContents();
  }
}

initFileManager();
