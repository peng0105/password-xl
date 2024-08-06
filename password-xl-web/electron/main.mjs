import path from 'node:path'
import fs from 'fs'
import {app, BrowserWindow, ipcMain, nativeTheme, shell} from 'electron'
import {fileURLToPath} from "node:url";

const __dirname = fileURLToPath(new URL("../", import.meta.url))
const createWindow = () => {
    const win = new BrowserWindow({
        width: 1550,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, '/electron/preload.mjs'),
            spellcheck: false
        },
        icon: path.join(__dirname, 'dist/logo.ico'),
    });
    // win.webContents.openDevTools()
    win.setMenu(null);
    win.loadFile('dist/index.html');

    // 使用默认浏览器打开链接
    win.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return {action: "deny"}
    })
}

app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('get-file', (_event, fileName) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(app.getPath('userData'), fileName);
        fs.readFile(filePath, {flag: 'r', encoding: 'utf-8'}, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    resolve('');
                    return;
                }
                reject()
                return
            }
            resolve(data);
        });
    })
})

ipcMain.handle('upload-file', (_event, fileName, content) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(app.getPath('userData'), fileName);
        try {
            fs.writeFileSync(filePath, content);
            resolve({status: true})
        } catch (err) {
            reject({status: 'error', message: err})
        }
    })
})

ipcMain.handle('delete-file', (_event, fileName) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(app.getPath('userData'), fileName);
        fs.unlink(filePath, (err) => {
            if (err) {
                reject({status: 'error', message: err})
            } else {
                resolve({status: true})
            }
        });
    })
})

ipcMain.handle('set-topic', (_event, topic) => {
    nativeTheme.themeSource = topic
})