const { globalShortcut } = require('electron');
const Store = require('electron-store');
const log = require('electron-log');

const store = new Store({
  name: 'bepaste-config'
});

// 默认快捷键
const DEFAULT_SHORTCUT = 'CommandOrControl+Option+C';

class ShortcutManager {
  constructor() {
    this.currentShortcut = store.get('shortcut', DEFAULT_SHORTCUT);
    this.callback = null;
  }

  register(shortcut, callback) {
    if (shortcut) {
      this.currentShortcut = shortcut;
    }
    if (callback) {
      this.callback = callback;
    }
    
    try {
      this.unregisterAll();
      globalShortcut.register(this.currentShortcut, this.callback);
      store.set('shortcut', this.currentShortcut);
      log.info('快捷键注册成功:', this.currentShortcut);
      return true;
    } catch (error) {
      log.error('快捷键注册失败:', error);
      return false;
    }
  }

  getCurrentShortcut() {
    return this.currentShortcut;
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }
}

module.exports = new ShortcutManager();