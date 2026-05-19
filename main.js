const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "assets/favicon.ico"),
    title: "Noragentic – Ansattportal",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Completely remove menu bar
  win.setMenuBarVisibility(false);

  win.loadFile(path.join(__dirname, "login.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});