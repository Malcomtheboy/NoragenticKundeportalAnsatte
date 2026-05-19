import { database } from "./firebase-config.js";
import { auth, db } from "./firebase-auth.js";

import {
  ref,
  set,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { showError, showConfirm } from "./popup-manager.js";

let currentUser = null;
let currentProject = null;
let currentProjectData = null;

let messagesUnsub = null;
let typingUsersRef = null;
let typingSelfRef = null;
let typingTimer = null;

const chatBox = document.getElementById("chatMessages");
const chatBoxBig = document.getElementById("chatMessagesBig");

const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");

const formBig = document.getElementById("chatFormBig");
const inputBig = document.getElementById("chatInputBig");

const modal = document.getElementById("chatModal");
const openBtn = document.getElementById("expandChat");
const closeBtn = document.getElementById("closeChat");

const typingBox = document.getElementById("typingIndicator");
let activeMenu = null;
let editingMessageId = null;

/**
 * Gjør tekst trygg å vise i HTML.
 *
 * @param {unknown} value Verdi som skal escapes.
 * @returns {string} Trygg tekststreng.
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

/**
 * Bygger brukerobjekt fra Firebase Auth og Firestore.
 *
 * @param {import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").User} user Innlogget bruker.
 * @returns {Promise<{
 *   uid: string,
 *   email: string,
 *   name: string,
 *   role: string,
 *   projectIds: string[],
 *   projectId: string
 * }>}
 */
async function buildUser(user) {
  const localName = localStorage.getItem("employee_name")?.trim() || "";
  let firestoreData = {};

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      firestoreData = userSnap.data() || {};
    }
  } catch (error) {
    console.error("Kunne ikke hente brukerdata:", error);
  }

  const authName = user.displayName?.trim() || "";
  const emailName = user.email?.includes("@") ? user.email.split("@")[0] : "";

  return {
    uid: user.uid,
    email: user.email || firestoreData.email || localStorage.getItem("employee_email") || "",
    name: firestoreData.name || localName || authName || emailName || "Ukjent bruker",
    role: firestoreData.role || localStorage.getItem("employee_role") || "",
    projectIds: Array.isArray(firestoreData.projectIds) ? firestoreData.projectIds : [],
    projectId: typeof firestoreData.projectId === "string" ? firestoreData.projectId : ""
  };
}

/**
 * Sjekker om aktiv bruker har tilgang til aktivt prosjekt.
 *
 * @param {Record<string, any>} projectData Prosjektdata fra Firestore.
 * @returns {boolean}
 */
function hasProjectAccess(projectData) {
  if (!currentUser || !projectData || !currentProject) return false;

  if (currentUser.role === "owner") return true;

  if (Array.isArray(projectData.employeeIds) && projectData.employeeIds.includes(currentUser.uid)) {
    return true;
  }

  if (Array.isArray(projectData.customerIds) && projectData.customerIds.includes(currentUser.uid)) {
    return true;
  }

  if (Array.isArray(currentUser.projectIds) && currentUser.projectIds.includes(currentProject)) {
    return true;
  }

  if (currentUser.projectId && currentUser.projectId === currentProject) {
    return true;
  }

  return false;
}

/**
 * Lager referanse til skriveindikator for aktiv bruker.
 *
 * @param {string} [projectId=currentProject] Prosjekt-ID.
 * @param {string} [uid=currentUser?.uid] Bruker-ID.
 * @returns {import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js").DatabaseReference}
 */
function typingRef(projectId = currentProject, uid = currentUser?.uid) {
  return ref(database, `typing/${projectId}/${uid}`);
}

/**
 * Lager referanse til skriveindikatorene for et prosjekt.
 *
 * @param {string} [projectId=currentProject] Prosjekt-ID.
 * @returns {import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js").DatabaseReference}
 */
function typingUsersProjectRef(projectId = currentProject) {
  return ref(database, `typing/${projectId}`);
}

/**
 * Formaterer tidspunkt for visning i chatten.
 *
 * @param {any} value Tidspunkt fra Firestore eller timestamp.
 * @returns {string}
 */
function formatTime(value) {
  if (!value) return "";

  let date = null;

  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (typeof value === "number") {
    date = new Date(value);
  } else if (typeof value === "string") {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (sameDay) {
    const time = date.toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `I dag ${time}`;
  }

  if (isYesterday) {
    const time = date.toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `I går ${time}`;
  }

  return date.toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Lukker aktiv meny for meldingshandlinger.
 *
 * @returns {void}
 */
function closeActiveMenu() {
  if (!activeMenu) return;
  activeMenu.classList.remove("active");
  activeMenu = null;
}

/**
 * Setter en melding i redigeringsmodus.
 *
 * @param {string} messageId Melding-ID.
 * @param {string} currentText Nåværende tekst.
 * @returns {Promise<void>}
 */
async function editMessage(messageId, currentText) {
  editingMessageId = messageId;
  closeActiveMenu();
  loadChat();
}

/**
 * Lagrer redigert melding til Firestore.
 *
 * @param {string} messageId Melding-ID.
 * @param {HTMLTextAreaElement | HTMLInputElement | null | undefined} source Inputfelt med ny tekst.
 * @returns {Promise<void>}
 */
async function saveEditedMessage(messageId, source) {
  const nextText = source?.value?.trim();
  if (!nextText) return;

  try {
    await updateDoc(doc(db, "messages", messageId), {
      text: nextText,
      editedAt: serverTimestamp()
    });
    editingMessageId = null;
  } catch (error) {
    console.error("Kunne ikke redigere melding:", error);
    showError("Kunne ikke redigere melding.");
  }
}

/**
 * Sletter en melding etter bekreftelse.
 *
 * @param {string} messageId Melding-ID.
 * @returns {Promise<void>}
 */
async function deleteMessage(messageId) {
  const confirmed = await showConfirm("Vil du slette denne meldingen?");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "messages", messageId));
  } catch (error) {
    console.error("Kunne ikke slette melding:", error);
    showError("Kunne ikke slette melding.");
  }
}

/**
 * Renderer én melding som DOM-element.
 *
 * @param {Record<string, any>} [msg={}] Meldingsdata.
 * @returns {HTMLDivElement}
 */
function renderMsg(msg = {}) {
  const div = document.createElement("div");
  const isMe = msg.uid && currentUser && msg.uid === currentUser.uid;
  const isEditing = editingMessageId === msg.id;

  div.classList.add("msg", isMe ? "me" : "other");

  const head = document.createElement("div");
  head.className = "msg-head";

  const name = document.createElement("div");
  name.className = "msg-name";
  name.textContent = msg.username || "Ukjent bruker";
  head.appendChild(name);

  if (isMe && msg.id) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "msg-menu-btn";
    menuBtn.setAttribute("aria-label", "Meldingsvalg");
    menuBtn.textContent = "⋯";

    const menu = document.createElement("div");
    menu.className = "msg-menu";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Rediger";
    editBtn.addEventListener("click", async () => {
      closeActiveMenu();
      await editMessage(msg.id, msg.text || "");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Slett";
    deleteBtn.addEventListener("click", async () => {
      closeActiveMenu();
      await deleteMessage(msg.id);
    });

    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !menu.classList.contains("active");
      closeActiveMenu();
      if (willOpen) {
        menu.classList.add("active");
        activeMenu = menu;
      }
    });

    menu.append(editBtn, deleteBtn);
    actions.append(menuBtn, menu);
    head.appendChild(actions);
  }

  div.appendChild(head);

  if (isEditing) {
    const editor = document.createElement("textarea");
    editor.className = "msg-edit-input";
    editor.value = msg.text || "";

    const editActions = document.createElement("div");
    editActions.className = "msg-edit-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "Avbryt";
    cancelBtn.addEventListener("click", () => {
      editingMessageId = null;
      loadChat();
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Lagre";
    saveBtn.addEventListener("click", async () => {
      await saveEditedMessage(msg.id, editor);
    });

    editor.addEventListener("keydown", async (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        await saveEditedMessage(msg.id, editor);
      }
    });

    editActions.append(cancelBtn, saveBtn);
    div.append(editor, editActions);
    setTimeout(() => {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }, 0);
  } else {
    const text = document.createElement("div");
    text.className = "msg-text";
    text.textContent = msg.text || "";

    const time = document.createElement("div");
    time.className = "msg-time";
    time.textContent = formatTime(msg.createdAt || msg.time);

    div.append(text, time);
  }

  return div;
}

/**
 * Tømmer begge chatvisningene.
 *
 * @returns {void}
 */
function clearMessages() {
  if (chatBox) chatBox.innerHTML = "";
  if (chatBoxBig) chatBoxBig.innerHTML = "";
}

/**
 * Scroller begge chatvisningene til bunnen.
 *
 * @returns {void}
 */
function scrollToBottom() {
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  if (chatBoxBig) chatBoxBig.scrollTop = chatBoxBig.scrollHeight;
}

/**
 * Viser en systemmelding i chatten.
 *
 * @param {string} text Meldingstekst.
 * @returns {void}
 */
function renderSystemMessage(text) {
  clearMessages();

  const html = `<div class="msg other"><div class="msg-text">${escapeHtml(text)}</div></div>`;

  if (chatBox) chatBox.innerHTML = html;
  if (chatBoxBig) chatBoxBig.innerHTML = html;
}

/**
 * Stopper aktive lyttere for chat og skriveindikator.
 *
 * @returns {void}
 */
function stopChatListeners() {
  if (messagesUnsub) {
    messagesUnsub();
    messagesUnsub = null;
  }

  if (typingUsersRef) {
    off(typingUsersRef);
    typingUsersRef = null;
  }
}

/**
 * Laster prosjektdata og kontrollerer tilgang.
 *
 * @param {string} projectId Prosjekt-ID.
 * @returns {Promise<boolean>}
 */
async function loadProjectAccess(projectId) {
  const projectSnap = await getDoc(doc(db, "projects", projectId));

  if (!projectSnap.exists()) {
    currentProjectData = null;
    renderSystemMessage("Fant ikke prosjektet.");
    return false;
  }

  currentProjectData = projectSnap.data() || {};

  if (!hasProjectAccess(currentProjectData)) {
    renderSystemMessage("Du har ikke tilgang til denne prosjektchatten.");
    return false;
  }

  return true;
}

/**
 * Laster inn meldinger for aktivt prosjekt i sanntid.
 *
 * @returns {void}
 */
function loadChat() {
  stopChatListeners();
  clearMessages();

  if (!currentProject) {
    renderSystemMessage("Velg et prosjekt for å åpne chatten.");
    return;
  }

  const messagesQuery = query(
    collection(db, "messages"),
    where("projectId", "==", currentProject)
  );

  messagesUnsub = onSnapshot(
    messagesQuery,
    (snap) => {
      clearMessages();

      const messages = [];

      snap.forEach((docSnap) => {
        messages.push({ id: docSnap.id, ...docSnap.data() });
      });

      messages.sort((a, b) => {
        const aTime =
          typeof a.createdAt?.toMillis === "function"
            ? a.createdAt.toMillis()
            : Number(a.time || 0);

        const bTime =
          typeof b.createdAt?.toMillis === "function"
            ? b.createdAt.toMillis()
            : Number(b.time || 0);

        return aTime - bTime;
      });

      if (messages.length === 0) {
        scrollToBottom();
        return;
      }

      messages.forEach((msg) => {
        if (chatBox) chatBox.appendChild(renderMsg(msg));
        if (chatBoxBig) chatBoxBig.appendChild(renderMsg(msg));
      });

      scrollToBottom();
    },
    (error) => {
      console.error("Kunne ikke laste chat:", error);
      renderSystemMessage("Kunne ikke laste chat.");
    }
  );
}

/**
 * Sender ny melding til Firestore.
 *
 * @param {HTMLInputElement | HTMLTextAreaElement | null | undefined} sourceInput Inputfelt med meldingstekst.
 * @returns {Promise<void>}
 */
async function sendMessage(sourceInput) {
  const text = sourceInput?.value?.trim();

  if (!text || !currentUser || !currentProject || !currentProjectData) return;

  if (!hasProjectAccess(currentProjectData)) {
    showError("Du har ikke tilgang til denne chatten.");
    return;
  }

  const payload = {
    projectId: currentProject,
    text,
    username: currentUser.name,
    uid: currentUser.uid,
    email: currentUser.email,
    createdAt: serverTimestamp(),
    time: Date.now()
  };

  try {
    await addDoc(collection(db, "messages"), payload);
  } catch (error) {
    console.error("Kunne ikke sende melding:", error);
    alert("Kunne ikke sende melding til databasen.");
    return;
  }

  if (input) input.value = "";
  if (inputBig) inputBig.value = "";

  if (typingSelfRef) {
    await set(typingSelfRef, {
      user: currentUser.name,
      typing: false
    });
  }
}

/**
 * Oppdaterer skriveindikator for aktiv bruker.
 *
 * @returns {void}
 */
function updateTypingState() {
  if (!typingSelfRef || !currentUser || !currentProjectData) return;

  set(typingSelfRef, {
    user: currentUser.name,
    typing: true
  });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    set(typingSelfRef, {
      user: currentUser.name,
      typing: false
    });
  }, 900);
}

/**
 * Kobler skriveindikator til et inputfelt én gang.
 *
 * @param {HTMLInputElement | HTMLTextAreaElement | null} element Inputfelt.
 * @returns {void}
 */
function bindTypingInput(element) {
  if (!element || element.dataset.typingBound === "true") return;

  element.addEventListener("input", updateTypingState);
  element.dataset.typingBound = "true";
}

/**
 * Setter opp lytter for skriveindikatorer i aktivt prosjekt.
 *
 * @returns {void}
 */
function setupTyping() {
  if (!currentUser || !currentProject || !currentProjectData) return;

  if (typingUsersRef) {
    off(typingUsersRef);
  }

  typingSelfRef = typingRef();
  typingUsersRef = typingUsersProjectRef();

  bindTypingInput(input);
  bindTypingInput(inputBig);

  onValue(typingUsersRef, (snap) => {
    if (!typingBox) return;

    const users = [];

    if (snap.exists()) {
      snap.forEach((child) => {
        const data = child.val();
        if (child.key !== currentUser.uid && data?.typing && data?.user) {
          users.push(data.user);
        }
      });
    }

    typingBox.textContent = users.length ? `${users.join(", ")} skriver...` : "";
  });
}

/**
 * Kobler send-funksjon til mini-chat og stor chat.
 *
 * @returns {void}
 */
function bindSend() {
  if (form && !form.dataset.bound) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendMessage(input);
    });
    form.dataset.bound = "true";
  }

  if (formBig && !formBig.dataset.bound) {
    formBig.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendMessage(inputBig);
    });
    formBig.dataset.bound = "true";
  }
}

/**
 * Kobler logikk for åpning og lukking av modal.
 *
 * @returns {void}
 */
function bindModal() {
  if (openBtn && modal && !openBtn.dataset.bound) {
    openBtn.addEventListener("click", () => modal.classList.add("active"));
    openBtn.dataset.bound = "true";
  }

  if (closeBtn && modal && !closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    closeBtn.dataset.bound = "true";
  }

  if (modal && !modal.dataset.bound) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.classList.remove("active");
      }
    });
    modal.dataset.bound = "true";
  }
}

/**
 * Bytter aktivt prosjekt og laster tilhørende chat.
 *
 * @param {string} projectId Prosjekt-ID.
 * @returns {Promise<void>}
 */
async function switchProject(projectId) {
  if (!projectId || !currentUser) return;

  currentProject = projectId;
  currentProjectData = null;

  const hasAccess = await loadProjectAccess(projectId);
  if (!hasAccess) {
    stopChatListeners();
    return;
  }

  loadChat();
  setupTyping();
}

/**
 * Lytter på prosjektbytte fra resten av applikasjonen.
 *
 * @returns {void}
 */
function bindProjectEvents() {
  if (window.__chatProjectBound) return;

  window.addEventListener("projectChanged", async (event) => {
    const projectId = event.detail?.projectId;
    await switchProject(projectId);
  });

  window.__chatProjectBound = true;
}

/**
 * Starter opp chatten og kobler nødvendige lyttere.
 *
 * @returns {void}
 */
function startChat() {
  bindSend();
  bindModal();
  bindProjectEvents();

  if (window.currentProjectId) {
    switchProject(window.currentProjectId);
  } else {
    renderSystemMessage("Velg et prosjekt for å åpne chatten.");
  }
}

/**
 * Kjører når innlogget bruker endrer seg.
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  currentUser = await buildUser(user);
  startChat();
});

/**
 * Lukker aktiv meny når bruker klikker utenfor.
 */
document.addEventListener("click", () => {
  closeActiveMenu();
});
