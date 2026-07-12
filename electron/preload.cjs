const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bigA', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  fetchMarketText: (url, encoding = 'utf-8') => ipcRenderer.invoke('market:fetchText', { url, encoding }),
  fetchNewsText: (route) => ipcRenderer.invoke('news:fetchText', { route }),
  showNotification: (request) => ipcRenderer.invoke('notification:show', request),
  onNotificationClick: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('notification:clicked', listener);
    return () => ipcRenderer.removeListener('notification:clicked', listener);
  }
});
