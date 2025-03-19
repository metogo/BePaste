const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const log = require('electron-log');
const clipboardManager = require('./src/clipboard');
const shortcutManager = require('./src/shortcut');
const autoLaunchManager = require('./src/autoLaunch');
const trayManager = require('./src/tray');

// 配置日志
log.transports.file.level = 'info';
log.info('应用启动');

// 保持对window对象的全局引用
let mainWindow = null;
let isVisible = false;

// 创建窗口函数
function createWindow() {
  const display = screen.getPrimaryDisplay();
  const windowHeight = 330;
  
  mainWindow = new BrowserWindow({
    width: display.bounds.width,
    height: windowHeight,
    x: 0,
    y: display.bounds.height - windowHeight,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    type: 'splash',
    hasShadow: false,
    // 移除 titleBarStyle 和 titleBarOverlay
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true
    }
  });

  // 加载应用的index.html
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 开发环境下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 当窗口关闭时触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 监听窗口大小变化
  screen.on('display-metrics-changed', updateWindowPosition);
  screen.on('display-added', updateWindowPosition);
  screen.on('display-removed', updateWindowPosition);

  // 添加窗口快捷键处理
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key.toLowerCase() === 'w' && input.meta) {
      event.preventDefault();
      hideWindow();
    }
  });
}

// 更新窗口位置
function updateWindowPosition() {
  if (!mainWindow) return;
  
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.bounds;
  
  // 设置窗口位置和大小
  mainWindow.setBounds({
    x: 0,
    y: height - 330,
    width: width,
    height: 330
  });

  // 重新设置窗口层级和属性
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  
  // 设置窗口样式
  if (process.platform === 'darwin') {
    app.dock.hide(); // 隐藏 dock 图标
  }
}

// 隐藏窗口
function hideWindow() {
  if (!mainWindow) return;
  
  mainWindow.hide();
  isVisible = false;
  // 不改变窗口类型，保持状态
}

// 显示窗口
function showWindow() {
  if (!mainWindow) return;
  
  // 先更新位置和属性，确保窗口状态正确
  updateWindowPosition();
  
  // 显示窗口
  mainWindow.show();
  isVisible = true;
}

// 切换窗口显示状态
function toggleWindow() {
  if (!mainWindow) return;
  
  if (isVisible) {
    hideWindow();
  } else {
    showWindow();
  }
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();
  
  // 注册全局快捷键
  shortcutManager.register('CommandOrControl+Option+C', toggleWindow);
  
  // 启动剪贴板监视
  clipboardManager.startWatching();
  
  // 初始化时先隐藏窗口
  if (mainWindow) {
    mainWindow.hide();
    isVisible = false;
  }
  
  // 显示初始窗口
  showWindow();
  
  // 监听剪贴板变化
  clipboardManager.onChange((history) => {
    if (isVisible && mainWindow) {
      mainWindow.webContents.send('update-clipboard-history', history);
    }
  });
  
  // 初始化自动启动
  autoLaunchManager.init();
  
  // 创建托盘图标
  trayManager.create(toggleWindow);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// IPC通信处理
ipcMain.on('hide-window', () => {
  hideWindow();
});

ipcMain.handle('copy-to-clipboard', async (event, data) => {
  try {
    const success = await clipboardManager.copyToClipboard(data);
    if (success) {
      hideWindow();
    }
    return success;
  } catch (error) {
    log.error('复制到剪贴板失败:', error);
    return false;
  }
});

// 添加 IPC 处理
ipcMain.handle('clear-history', () => {
  const { dialog } = require('electron');
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    title: '确认清空',
    message: '确定要清空所有历史记录吗？',
    buttons: ['确定', '取消'],
    defaultId: 1,
    cancelId: 1
  });
  
  if (result === 0) {
    return clipboardManager.clearHistory();
  }
  return false;
});

ipcMain.handle('get-history', () => {
  return clipboardManager.getHistory();
});

ipcMain.handle('get-shortcut', () => {
  return shortcutManager.getCurrentShortcut();
});

ipcMain.handle('set-shortcut', (event, shortcut) => {
  return shortcutManager.register(shortcut);
});