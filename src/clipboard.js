const { clipboard } = require('electron');
const Store = require('electron-store');
const log = require('electron-log');

class ClipboardManager {
  constructor() {
    this.store = new Store({
      name: 'bepaste-data',
      maxSize: 50 * 1024 * 1024 // 50MB 限制
    });
    this.watcher = null;
    this.lastContent = '';
    this.callbacks = [];
  }

  // 启动监视
  startWatching() {
    if (this.watcher) return;
    
    // 获取初始内容
    this.lastContent = clipboard.readText();
    
    // 设置监视器
    this.watcher = setInterval(() => {
      this.checkClipboard();
    }, 1000);
    
    log.info('剪贴板监视已启动');
  }

  // 停止监视
  stopWatching() {
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
      log.info('剪贴板监视已停止');
    }
  }

  // 检查剪贴板变化
  checkClipboard() {
    try {
      const currentContent = clipboard.readText();
      
      // 如果内容变化了
      if (currentContent !== this.lastContent && currentContent.trim() !== '') {
        this.lastContent = currentContent;
        this.saveContent(currentContent);
      }
    } catch (error) {
      log.error('检查剪贴板失败:', error);
    }
  }

  // 保存内容
  saveContent(text) {
    try {
      // 获取现有历史
      let history = this.getHistory();
      
      // 检查是否已存在相同内容
      const existingIndex = history.findIndex(item => item.text === text);
      if (existingIndex !== -1) {
        // 如果存在，移除旧的
        history.splice(existingIndex, 1);
      }
      
      // 添加新内容到开头
      history.unshift({
        id: Date.now(),
        text: text,
        timestamp: new Date().toISOString()
      });
      
      // 限制历史记录数量
      if (history.length > 100) {
        history = history.slice(0, 100);
      }
      
      // 保存更新后的历史
      this.store.set('clipboardHistory', history);
      
      // 触发回调
      this.notifyChange(history);
      
      log.info('已保存新的剪贴板内容');
    } catch (error) {
      log.error('保存剪贴板内容失败:', error);
    }
  }

  // 获取历史
  getHistory() {
    return this.store.get('clipboardHistory', []);
  }

  // 复制内容到剪贴板
  copyToClipboard(text) {
    try {
      clipboard.writeText(text);
      return true;
    } catch (error) {
      log.error('复制到剪贴板失败:', error);
      return false;
    }
  }

  // 添加变化监听器
  onChange(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  // 通知变化
  notifyChange(history) {
    this.callbacks.forEach(callback => {
      try {
        callback(history);
      } catch (error) {
        log.error('通知剪贴板变化失败:', error);
      }
    });
  }

  // 清空历史
  clearHistory() {
    this.store.set('clipboardHistory', []);
    this.notifyChange([]);
    log.info('剪贴板历史已清空');
  }
}

module.exports = new ClipboardManager();