const { contextBridge, ipcRenderer, clipboard, nativeImage } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateClipboardHistory: (callback) => {
    ipcRenderer.on('update-clipboard-history', (event, history) => callback(history));
  },
  
  hideWindow: () => {
    ipcRenderer.send('hide-window');
  },
  
  copyToClipboard: (data) => {
    if (data.type === 'image') {
      // 确保图片数据是完整的 base64 字符串
      const imageData = data.content.startsWith('data:image') 
        ? data.content 
        : `data:image/png;base64,${data.content}`;
      return ipcRenderer.invoke('copy-to-clipboard', {
        type: 'image',
        content: imageData
      });
    }
    return ipcRenderer.invoke('copy-to-clipboard', data);
  },
  
  // 添加快捷键相关的 API
  getShortcut: () => ipcRenderer.invoke('get-shortcut'),
  setShortcut: (shortcut) => ipcRenderer.invoke('set-shortcut', shortcut),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getHistory: () => ipcRenderer.invoke('get-history'),
});