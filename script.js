// Fake filer (kun for design-demo nå)
const files = [
  { icon: "📄", name: "Status_uke_01.pdf", sub: "PDF • 420 KB" },
  { icon: "📄", name: "Møte-notater.docx", sub: "DOCX • 88 KB" },
  { icon: "🖼️", name: "mockup.png", sub: "PNG • 1.2 MB" },
  { icon: "📊", name: "ukesrapport.xlsx", sub: "XLSX • 240 KB" },
  { icon: "📄", name: "Kravspesifikasjon.pdf", sub: "PDF • 560 KB" },
  { icon: "🖼️", name: "diagram.png", sub: "PNG • 640 KB" },
];

const fileGrid = document.getElementById("fileGrid");
fileGrid.innerHTML = files.map(f => `
  <div class="file" role="button" tabindex="0" title="Åpne fil (demo)">
    <div class="icon">${f.icon}</div>
    <div class="meta">
      <div class="name">${f.name}</div>
      <div class="sub">${f.sub}</div>
    </div>
  </div>
`).join("");

// Chat åpne/lukk
const chatBubble = document.getElementById("chatBubble");
const chatModal = document.getElementById("chatModal");
const chatClose = document.getElementById("chatClose");

chatBubble.addEventListener("click", () => chatModal.classList.remove("is-hidden"));
chatClose.addEventListener("click", () => chatModal.classList.add("is-hidden"));

// Chat send (demo)
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const div = document.createElement("div");
  div.className = "msg me";
  div.textContent = text;
  chatMessages.appendChild(div);

  chatInput.value = "";
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // fake auto-svar
  setTimeout(() => {
    const reply = document.createElement("div");
    reply.className = "msg other";
    reply.textContent = "Mottatt ✅ (demo)";
    chatMessages.appendChild(reply);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 400);
});

// ---------- Modal + toast (for knappene) ----------
const toast = document.getElementById("toast");
const modalCenter = document.getElementById("modalCenter");
const modalTitle = document.getElementById("modalTitle");
const modalLabel = document.getElementById("modalLabel");
const modalInput = document.getElementById("modalInput");

const modalX = document.getElementById("modalX");
const modalCancel = document.getElementById("modalCancel");
const modalSave = document.getElementById("modalSave");

const btnDelmal = document.getElementById("btnDelmal");
const btnBeskrivelse = document.getElementById("btnBeskrivelse");
const btnUkesstatus = document.getElementById("btnUkesstatus");
const btnUpload = document.getElementById("btnUpload");

let currentKey = null;

function showToast(text) {
  toast.textContent = text;
  toast.classList.remove("is-hidden");
  setTimeout(() => toast.classList.add("is-hidden"), 1400);
}

function openModal({ title, label, placeholder, key, defaultValue = "" }) {
  currentKey = key;
  modalTitle.textContent = title;
  modalLabel.textContent = label;
  modalInput.placeholder = placeholder;
  modalInput.value = defaultValue;

  modalCenter.classList.remove("is-hidden");
  setTimeout(() => modalInput.focus(), 0);
}

function closeModal() {
  modalCenter.classList.add("is-hidden");
  currentKey = null;
}

function saveValue(key, value) {
  localStorage.setItem(key, value);
}

function loadValue(key, fallback = "") {
  return localStorage.getItem(key) ?? fallback;
}

// Koble knapper
btnDelmal.addEventListener("click", () => {
  openModal({
    title: "Oppdater delmål",
    label: "Nytt delmål",
    placeholder: "f.eks. Integrere backend",
    key: "delmal",
    defaultValue: loadValue("delmal", "Implementering av Prototype"),
  });
});

btnBeskrivelse.addEventListener("click", () => {
  openModal({
    title: "Oppdater prosjektbeskrivelse",
    label: "Kort beskrivelse",
    placeholder: "f.eks. Status, avtaler, neste steg…",
    key: "beskrivelse",
    defaultValue: loadValue("beskrivelse", ""),
  });
});

btnUkesstatus.addEventListener("click", () => {
  openModal({
    title: "Oppdater ukesstatus",
    label: "Ukesstatus",
    placeholder: "f.eks. Uke 3: Ferdig med UI, starter API…",
    key: "ukesstatus",
    defaultValue: loadValue("ukesstatus", ""),
  });
});

btnUpload.addEventListener("click", () => {
  showToast("Last opp (demo) 📎");
});

// Lukk modal
modalX.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);

// Klikk utenfor for å lukke
modalCenter.addEventListener("click", (e) => {
  if (e.target === modalCenter) closeModal();
});

// Lagre modal
modalSave.addEventListener("click", () => {
  const value = modalInput.value.trim();
  if (currentKey) saveValue(currentKey, value);
  closeModal();
  showToast("Lagret ✅");

  // Oppdater UI litt (demo)
  if (currentKey === "delmal" && value) {
    const big = document.querySelector(".card.wide .big");
    if (big) big.textContent = value;
  }
});
