const { clipboard, nativeImage } = require('electron');
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
    this.lastImage = null;
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
      const image = clipboard.readImage();
      const currentContent = clipboard.readText();
      
      // 如果是图片且不为空
      if (!image.isEmpty()) {
        const pngBuffer = image.toPNG();
        const base64Image = pngBuffer.toString('base64');
        const imageDataUrl = `data:image/png;base64,${base64Image}`;
        
        // 只有当图片内容真正改变时才保存
        if (this.lastImage !== base64Image) {
          this.lastImage = base64Image;
          this.saveContent({
            type: 'image',
            content: imageDataUrl
          });
        }
      }
      // 如果是文本且有变化
      else if (currentContent !== this.lastContent && currentContent.trim() !== '') {
        this.lastContent = currentContent;
        this.saveContent({
          type: 'text',
          content: currentContent
        });
      }
    } catch (error) {
      log.error('检查剪贴板失败:', error);
    }
  }

  // 复制内容到剪贴板
  copyToClipboard(data) {
    try {
      if (typeof data === 'string') {
        clipboard.writeText(data);
        return true;
      } else if (data.type === 'image' && data.content) {
        try {
          const base64Data = data.content.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          const image = nativeImage.createFromBuffer(buffer);
          
          if (!image.isEmpty()) {
            clipboard.writeImage(image);
            // 更新最后的图片记录为纯base64数据
            this.lastImage = base64Data;
            return true;
          }
        } catch (e) {
          log.error('图片数据处理失败:', e);
          return false;
        }
      } else {
        clipboard.writeText(data.content);
        return true;
      }
      return false;
    } catch (error) {
      log.error('复制到剪贴板失败:', error);
      return false;
    }
  }

  // 保存内容
  saveContent(data) {
    try {
      const rawHistory = this.store.get('clipboardHistory', []);
      
      // 检查是否已存在相同内容
      const existingIndex = rawHistory.findIndex(item => 
        item.type === data.type && item.content === data.content
      );
      
      if (existingIndex !== -1) {
        rawHistory.splice(existingIndex, 1);
      }
      
      // 添加新内容到开头
      rawHistory.unshift({
        id: Date.now(),
        type: data.type,
        content: data.content,
        timestamp: new Date().toISOString()
      });
      
      if (rawHistory.length > 100) {
        rawHistory = rawHistory.slice(0, 100);
      }
      
      this.store.set('clipboardHistory', rawHistory);
      this.notifyChange(this.getHistory());
      
      log.info(`已保存新的${data.type === 'image' ? '图片' : '文本'}内容`);
    } catch (error) {
      log.error('保存剪贴板内容失败:', error);
    }
  }

  // 获取历史
  getHistory() {
    const history = this.store.get('clipboardHistory', []);
    // 确保返回的历史记录格式正确
    return history.map(item => ({
      id: item.id,
      type: item.type || 'text',
      content: item.content || item,
      timestamp: item.timestamp || new Date().toISOString()
    }));
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

  // 添加变化监听器
  onChange(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  // 清空历史
  clearHistory() {
    try {
      // 清空存储的历史记录
      this.store.set('clipboardHistory', []);
      // 重置最后的内容记录，但保存当前剪贴板内容作为对比基准
      this.lastContent = clipboard.readText();
      this.lastImage = clipboard.readImage().isEmpty() ? null : clipboard.readImage().toDataURL();
      // 通知UI更新
      this.notifyChange([]);
      log.info('剪贴板历史已清空');
      return true;
    } catch (error) {
      log.error('清空历史失败:', error);
      return false;
    }
  }
}

module.exports = new ClipboardManager();