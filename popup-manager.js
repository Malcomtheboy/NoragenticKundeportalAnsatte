/* =========================================================
   POPUP MANAGER
========================================================= */

const popupOverlay = document.createElement("div");

popupOverlay.innerHTML = `
  <div id="popupBackdrop" class="popup-backdrop hidden">

    <div class="popup-card">

      <div class="popup-title" id="popupTitle">
        Varsel
      </div>

      <div class="popup-message" id="popupMessage">
        Melding
      </div>

      <div class="popup-actions" id="popupActions">
      </div>

    </div>

  </div>
`;

document.body.appendChild(popupOverlay);


/* =========================================================
   ELEMENTER
========================================================= */

const popupBackdrop = document.getElementById("popupBackdrop");
const popupTitle = document.getElementById("popupTitle");
const popupMessage = document.getElementById("popupMessage");
const popupActions = document.getElementById("popupActions");


/* =========================================================
   HELPERS
========================================================= */

function openPopup() {
  popupBackdrop.classList.remove("hidden");
}

function closePopup() {
  popupBackdrop.classList.add("hidden");
}


/* =========================================================
   ERROR MODAL
========================================================= */

export function showError(message = "Noe gikk galt.") {

  popupTitle.textContent = "Obs!";
  popupMessage.textContent = message;

  popupActions.innerHTML = `
    <button id="popupOkBtn" class="popup-btn primary">
      OK
    </button>
  `;

  openPopup();

  document.getElementById("popupOkBtn")?.addEventListener("click", () => {
    closePopup();
  });
}


/* =========================================================
   CONFIRM MODAL
========================================================= */

export function showConfirm(
  message = "Er du sikker?"
) {

  return new Promise((resolve) => {

    popupTitle.textContent = "Bekreft";
    popupMessage.textContent = message;

    popupActions.innerHTML = `
      <button id="popupCancelBtn" class="popup-btn secondary">
        Avbryt
      </button>

      <button id="popupConfirmBtn" class="popup-btn danger">
        Bekreft
      </button>
    `;

    openPopup();

    document.getElementById("popupCancelBtn")
      ?.addEventListener("click", () => {
        closePopup();
        resolve(false);
      });

    document.getElementById("popupConfirmBtn")
      ?.addEventListener("click", () => {
        closePopup();
        resolve(true);
      });

  });
}