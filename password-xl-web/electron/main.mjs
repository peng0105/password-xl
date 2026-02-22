import path from 'node:path'
import fs from 'fs'
import {app, BrowserWindow, ipcMain, nativeTheme, shell, net} from 'electron'
import {fileURLToPath} from "node:url";
import CryptoJS from "crypto-js";
import { protocol } from 'electron';

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

    protocol.handle('appimg', async (request) => {
        const url = request.url.replace('appimg://', '');
        const filePath = path.join(app.getPath('userData'), url);

        try {
            const data = await fs.promises.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();

            let mimeType = 'application/octet-stream';
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.webp') mimeType = 'image/webp';

            return new Response(data, {
                headers: { 'Content-Type': mimeType }
            });
        } catch (err) {
            return new Response('File not found', { status: 404 });
        }
    });
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
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
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

const generateRandomId = () => {
    const wordArray = CryptoJS.lib.WordArray.random(8);
    return wordArray.toString(CryptoJS.enc.Hex);
}

ipcMain.handle('upload-image', (_event, fileName, arrayBuffer, prefix) => {
    return new Promise((resolve, reject) => {
        let extName = fileName.split('.').pop()
        let objectKey = '/images/' + prefix + '/' + generateRandomId() + '.' + extName

        const filePath = path.join(app.getPath('userData'), objectKey);
        try {
            const dir = path.dirname(filePath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
            resolve(`appimg://${objectKey}`)
        } catch (err) {
            reject({status: 'error', message: err})
        }
    })
})

ipcMain.handle('webdav-request', async (_event, options) => {
    return new Promise((resolve, reject) => {
        try {
            const request = net.request({
                method: options.method,
                url: options.url,
            })

            const headers = options.headers || {}
            Object.keys(headers).forEach((key) => request.setHeader(key, headers[key]))

            let responseData = ''
            request.on('response', (response) => {
                response.setEncoding('utf8')
                response.on('data', (chunk) => {
                    responseData += chunk
                })
                response.on('end', () => {
                    if (response.statusCode >= 200 && response.statusCode < 400) {
                        resolve({status: response.statusCode, data: responseData})
                    } else {
                        reject({status: response.statusCode, message: responseData || 'WebDAV request failed'})
                    }
                })
            })

            request.on('error', (err) => reject({status: 500, message: err.message || err + ''}))

            if (options.data) {
                request.write(options.data)
            }
            request.end()
        } catch (err) {
            reject({status: 500, message: err.message || err + ''})
        }
    })
})
