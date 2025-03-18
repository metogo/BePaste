const { Tray, Menu } = require('electron');
const path = require('path');

let tray = null;

function updateMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => toggleWindow()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        if (process.platform !== 'darwin') {
          app.quit();
        }
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

function create(toggleWindow) {
  const trayIconPath = path.join(__dirname, '../build/icon.iconset/icon_32x32.png');
  tray = new Tray(trayIconPath);
  tray.setToolTip('BePaste');
  
  // 保存 toggleWindow 引用
  this.toggleWindow = toggleWindow;
  
  updateMenu();
  
  tray.on('click', () => {
    toggleWindow();
  });
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  create,
  destroy,
  updateMenu
};