const { BrowserWindow, app } = require('electron')
const path = require('path');
let mainWindow = null

function main() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    },
    titleBarStyle: "hiddenInset",
  })
  mainWindow.removeMenu();

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.on('ready', main)

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})
