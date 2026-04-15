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
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

function typingRef(projectId = currentProject, uid = currentUser?.uid) {
  return ref(database, `typing/${projectId}/${uid}`);
}

function typingUsersProjectRef(projectId = currentProject) {
  return ref(database, `typing/${projectId}`);
}

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

  return date.toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderMsg(msg = {}) {
  const div = document.createElement("div");
  const isMe = msg.uid && currentUser && msg.uid === currentUser.uid;

  div.classList.add("msg", isMe ? "me" : "other");
  div.innerHTML = `
    <div class="msg-name">${escapeHtml(msg.username || "Ukjent bruker")}</div>
    <div class="msg-text">${escapeHtml(msg.text || "")}</div>
    <div class="msg-time">${formatTime(msg.createdAt || msg.time)}</div>
  `;

  return div;
}

function clearMessages() {
  if (chatBox) chatBox.innerHTML = "";
  if (chatBoxBig) chatBoxBig.innerHTML = "";
}

function scrollToBottom() {
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  if (chatBoxBig) chatBoxBig.scrollTop = chatBoxBig.scrollHeight;
}

function renderSystemMessage(text) {
  clearMessages();

  const html = `<div class="msg other"><div class="msg-text">${escapeHtml(text)}</div></div>`;

  if (chatBox) chatBox.innerHTML = html;
  if (chatBoxBig) chatBoxBig.innerHTML = html;
}

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

async function sendMessage(sourceInput) {
  const text = sourceInput?.value?.trim();

  if (!text || !currentUser || !currentProject || !currentProjectData) return;

  if (!hasProjectAccess(currentProjectData)) {
    alert("Du har ikke tilgang til denne chatten.");
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

function bindTypingInput(element) {
  if (!element || element.dataset.typingBound === "true") return;

  element.addEventListener("input", updateTypingState);
  element.dataset.typingBound = "true";
}

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

function bindModal() {
  if (openBtn && modal && !openBtn.dataset.bound) {
    openBtn.addEventListener("click", () => modal.classList.add("active"));
    openBtn.dataset.bound = "true";
  }

  if (closeBtn && modal && !closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    closeBtn.dataset.bound = "true";
  }
}

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

function bindProjectEvents() {
  if (window.__chatProjectBound) return;

  window.addEventListener("projectChanged", async (event) => {
    const projectId = event.detail?.projectId;
    await switchProject(projectId);
  });

  window.__chatProjectBound = true;
}

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

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  currentUser = await buildUser(user);
  startChat();
});
