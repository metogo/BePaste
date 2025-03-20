const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const log = require('electron-log');
const clipboardManager = require('./src/clipboard');
const shortcutManager = require('./src/shortcut');
const autoLaunchManager = require('./src/autoLaunch');
const trayManager = require('./src/tray');
const { nativeTheme } = require('electron');

// 配置日志
log.transports.file.level = 'info';
log.info('应用启动');

// 保持对window对象的全局引用
let mainWindow = null;
let isVisible = false;

// 创建窗口函数
// 在文件顶部添加全局变量
let isShortcutTriggered = false;
let lastShowTime = 0;
let mouseInWindow = false;

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
    show: false,  // 保持为 false，我们会在加载完成后显示
    type: 'splash',
    hasShadow: false,
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
    // 添加 ESC 键处理
    if (input.key === 'Escape' && isVisible) {
      event.preventDefault();
      hideWindow();
    }
  });

  // 添加窗口事件监听
  mainWindow.on('show', () => {
    lastShowTime = Date.now();
    isShortcutTriggered = true;
    // 显示窗口时重置鼠标状态
    mouseInWindow = false;
  });

  // 监听鼠标进入和离开事件
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      document.addEventListener('mouseenter', () => {
        window.electronAPI.setMouseInWindow(true);
      });
      document.addEventListener('mouseleave', () => {
        window.electronAPI.setMouseInWindow(false);
      });
    `);
  });
  
  // 修改窗口加载完成事件
  mainWindow.webContents.on('did-finish-load', () => {
    showWindow();
    isShortcutTriggered = true;
    mouseInWindow = true;
    // 移除这里的 hideWindow 调用
  });

  // 修改 blur 事件处理
  mainWindow.on('blur', () => {
    // 检查是否有模态对话框打开
    const modalWindows = BrowserWindow.getAllWindows().filter(win => 
      win.isModal() && win.isVisible()
    );
    
    // 只在有模态窗口或鼠标在窗口内时不隐藏
    if (modalWindows.length > 0 || mouseInWindow) {
      return;
    }
    
    hideWindow();
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
// 在 showWindow 函数中添加
function showWindow() {
  if (!mainWindow) return;
  
  updateWindowPosition();
  mainWindow.show();
  mainWindow.focus(); // 确保窗口获得焦点
  isVisible = true;
  mouseInWindow = true; // 初始状态设置为 true
  mainWindow.webContents.send('window-show');
}

// 切换窗口显示状态
// 修改 toggleWindow 函数
function toggleWindow() {
  if (!mainWindow) return;
  
  if (isVisible) {
    hideWindow();
  } else {
    isShortcutTriggered = true; // 在这里也设置标记
    showWindow();
    mainWindow.focus();
  }
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();
  
  // 注册全局快捷键
  shortcutManager.register('Command+Option+C', toggleWindow);
  
  // 启动剪贴板监视
  clipboardManager.startWatching();
  
  // 注册搜索快捷键
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key.toLowerCase() === 'f' && input.meta && isVisible) {
      event.preventDefault();
      mainWindow.webContents.send('focus-search');
    }
  });
  
  // 修改剪贴板变化监听，移除 isVisible 检查
  clipboardManager.onChange((history) => {
    if (mainWindow) {
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
// 修改 clear-history 处理器
ipcMain.handle('clear-history', async () => {
  return clipboardManager.clearHistory();
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

// 添加确认对话框处理
ipcMain.handle('show-confirm-dialog', async (event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {  // 添加 mainWindow 作为父窗口
    type: 'none',
    title: '确认',
    message: message,
    buttons: ['确定', '取消'],
    defaultId: 1,
    cancelId: 1,
    icon: path.join(__dirname, 'assets', 'warning.png')
  });
  return result.response === 0;
});

ipcMain.on('update-theme', (event, isDark) => {
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
});

// 添加新的 IPC 处理
ipcMain.on('set-mouse-in-window', (event, value) => {
  mouseInWindow = value;
});

ipcMain.on('theme-changed', (event, isDark) => {
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
});