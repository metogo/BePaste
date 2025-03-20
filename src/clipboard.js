const { clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
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
      const formats = clipboard.availableFormats();
      log.info('当前剪贴板格式:', formats);
  
      // 检查所有可能的文件引用格式
      const fileFormats = [
        'public.file-url', // macOS 文件路径格式
        'NSFilenamesPboardType', // macOS 文件路径格式
        'text/uri-list' // 通用文件路径格式
      ];
  
      for (const format of fileFormats) {
        if (formats.includes(format)) {
          const fileUri = clipboard.read(format).trim();
          log.info(`检测到 ${format} 内容:`, fileUri);
  
          if (fileUri) {
            let filePath = decodeURIComponent(fileUri)
              .replace(/^file:\/\/localhost/, '')
              .replace(/^file:\/\//, '')
              .replace(/\n$/, '')
              .replace(/^\/\/\//, '/');
  
            log.info('解析后的文件路径:', filePath);
  
            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath).toLowerCase();
              const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
  
              if (imageExts.includes(ext)) {
                // 读取文件内容
                const fileContent = fs.readFileSync(filePath);
                // 创建原生图片对象
                const nativeImg = nativeImage.createFromBuffer(fileContent);
  
                if (!nativeImg.isEmpty()) {
                  // 保持原始格式
                  const base64Image = fileContent.toString('base64');
                  const mimeType = `image/${ext.slice(1)}`;
                  const imageDataUrl = `data:${mimeType};base64,${base64Image}`;
  
                  if (this.lastImage !== base64Image) {
                    this.lastImage = base64Image;
                    this.saveContent({
                      type: 'image',
                      content: imageDataUrl
                    });
                    return;
                  }
                }
              }
            } else {
              log.error('文件不存在:', filePath);
            }
          }
        }
      }
  
      // 处理直接的图片数据（如截图）
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const pngBuffer = image.toPNG();
        const base64Image = pngBuffer.toString('base64');
        const imageDataUrl = `data:image/png;base64,${base64Image}`;
  
        if (this.lastImage !== base64Image) {
          this.lastImage = base64Image;
          this.saveContent({
            type: 'image',
            content: imageDataUrl
          });
        }
        return;
      }
  
      // 处理文本内容
      const currentContent = clipboard.readText();
      if (currentContent !== this.lastContent && currentContent.trim() !== '') {
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
      
      if (rawHistory.length > 2000) {
        rawHistory = rawHistory.slice(0, 2000);
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