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
  const { width, height } = display.workAreaSize;
  const windowHeight = 330;
  
  mainWindow = new BrowserWindow({
    width: width,
    height: windowHeight,
    x: 0,
    y: display.bounds.height - windowHeight, // 使用完整屏幕高度而不是工作区高度
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: path.join(__dirname, 'build/icon.icns'), // 添加这行
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
}

// 更新窗口位置
function updateWindowPosition() {
  if (!mainWindow) return;
  
  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  const windowHeight = 330;
  
  mainWindow.setBounds({
    width: width,
    height: windowHeight,
    x: 0,
    y: display.bounds.height - windowHeight // 使用完整屏幕高度
  });
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

// 显示窗口
function showWindow() {
  if (!mainWindow) return;
  
  updateWindowPosition();
  mainWindow.show();
  isVisible = true;
  
  // 发送最新的剪贴板历史到渲染进程
  mainWindow.webContents.send('update-clipboard-history', clipboardManager.getHistory());
}

// 隐藏窗口
function hideWindow() {
  if (!mainWindow) return;
  
  mainWindow.hide();
  isVisible = false;
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();
  
  // 注册全局快捷键
  shortcutManager.register('CommandOrControl+Option+C', toggleWindow);
  
  // 启动剪贴板监视
  clipboardManager.startWatching();
  
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
    // 在macOS上，当点击dock图标并且没有其他窗口打开时，通常在应用程序中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  // 在macOS上，除非用户用Cmd + Q确定地退出，否则应用和菜单栏会保持活动
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('will-quit', () => {
  // 注销所有快捷键
  shortcutManager.unregisterAll();
  
  // 停止剪贴板监视
  clipboardManager.stopWatching();
  
  // 销毁托盘图标
  trayManager.destroy();
});

// 添加内存监控
function monitorMemoryUsage() {
  const memoryInfo = process.getProcessMemoryInfo();
  const memoryUsageMB = Math.round(memoryInfo.private / 1024 / 1024);
  
  log.info(`内存使用: ${memoryUsageMB}MB`);
  
  // 如果内存使用超过阈值，进行垃圾回收
  if (memoryUsageMB > 200) { // 200MB 阈值
    log.info('内存使用过高，尝试进行垃圾回收');
    if (global.gc) {
      global.gc();
    }
  }
}

// 定期监控内存使用
setInterval(monitorMemoryUsage, 60000); // 每分钟检查一次

// IPC通信处理
ipcMain.on('hide-window', () => {
  hideWindow();
});

ipcMain.on('copy-to-clipboard', (event, text) => {
  const success = clipboardManager.copyToClipboard(text);
  if (success) {
    // 复制成功后隐藏窗口
    hideWindow();
  }
});

// 添加 IPC 处理
ipcMain.handle('get-shortcut', () => {
  return shortcutManager.getCurrentShortcut();
});

ipcMain.handle('set-shortcut', (event, shortcut) => {
  return shortcutManager.register(shortcut);
});