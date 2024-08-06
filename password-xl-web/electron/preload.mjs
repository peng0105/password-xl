import {contextBridge, ipcRenderer} from 'electron'

// 设置环境变量
contextBridge.exposeInMainWorld('env', {
    electron: true
})

// 开放给源码的API
contextBridge.exposeInMainWorld('electronAPI', {
    getFile: async (fileName) => ipcRenderer.invoke('get-file', fileName),
    uploadFile: async (fileName, content) => ipcRenderer.invoke('upload-file', fileName, content),
    deleteFile: async (fileName) => ipcRenderer.invoke('delete-file', fileName),
    setTopic: async (topic) => ipcRenderer.invoke('set-topic', topic),
})