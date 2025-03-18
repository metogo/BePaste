const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 接收剪贴板历史更新
  onUpdateClipboardHistory: (callback) => {
    ipcRenderer.on('update-clipboard-history', (event, history) => callback(history));
  },
  
  // 隐藏窗口
  hideWindow: () => {
    ipcRenderer.send('hide-window');
  },
  
  // 复制内容到剪贴板
  copyToClipboard: (text) => {
    ipcRenderer.send('copy-to-clipboard', text);
  },
  
  getCurrentShortcut: () => ipcRenderer.invoke('get-shortcut'),
  setShortcut: (shortcut) => ipcRenderer.invoke('set-shortcut', shortcut)
});