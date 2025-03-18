const { app } = require('electron');
const log = require('electron-log');
const Store = require('electron-store');

class AutoLaunchManager {
  constructor() {
    this.store = new Store({
      name: 'bepaste-settings'
    });
  }

  // 检查是否启用自动启动
  isEnabled() {
    return this.store.get('autoLaunch', false);
  }

  // 启用自动启动
  enable() {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true
      });
      this.store.set('autoLaunch', true);
      log.info('已启用自动启动');
      return true;
    } catch (error) {
      log.error('启用自动启动失败:', error);
      return false;
    }
  }

  // 禁用自动启动
  disable() {
    try {
      app.setLoginItemSettings({
        openAtLogin: false
      });
      this.store.set('autoLaunch', false);
      log.info('已禁用自动启动');
      return true;
    } catch (error) {
      log.error('禁用自动启动失败:', error);
      return false;
    }
  }

  // 切换自动启动状态
  toggle() {
    if (this.isEnabled()) {
      return this.disable();
    } else {
      return this.enable();
    }
  }

  // 初始化
  init() {
    if (this.isEnabled()) {
      this.enable();
    }
  }
}

module.exports = new AutoLaunchManager();