const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('errorReporting', {
  reportError: (error, context) => {
    ipcRenderer.invoke('report-error', {
      message: error.message,
      stack: error.stack,
      context
    });
  }
});

window.addEventListener('error', (event) => {
  ipcRenderer.invoke('report-error', {
    message: event.error.message,
    stack: event.error.stack,
    type: 'uncaught-exception'
  });
});

window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.invoke('report-error', {
    message: event.reason.message,
    stack: event.reason.stack,
    type: 'unhandled-rejection'
  });
});