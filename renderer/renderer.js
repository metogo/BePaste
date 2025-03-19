// 获取DOM元素
const cardsContainer = document.getElementById('cardsContainer');

// 格式化时间戳
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  
  // 如果是今天
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 如果是昨天
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 其他日期
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 创建卡片元素
function createCardElement(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  
  if (item.type === 'image') {
    // 处理图片类型
    card.innerHTML = `
      <div class="card-content">
        <img src="${item.content}" alt="剪贴板图片" style="max-width: 100%; max-height: 200px; object-fit: contain;">
      </div>
      <div class="card-info">
        <div class="card-timestamp">${formatTimestamp(item.timestamp)}</div>
        <div class="card-type">图片</div>
      </div>
    `;
  } else {
    // 处理文本类型
    let displayText = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
    if (displayText && displayText.length > 1000) {
      displayText = displayText.substring(0, 1000) + '...';
    }
    
    card.innerHTML = `
      <div class="card-content">${displayText}</div>
      <div class="card-info">
        <div class="card-timestamp">${formatTimestamp(item.timestamp)}</div>
        <div class="card-char-count">${displayText ? displayText.length : 0} 字符</div>
      </div>
    `;
  }
  
  // 修改点击事件处理
  card.addEventListener('click', async () => {
    try {
      const success = await window.electronAPI.copyToClipboard(item);
      if (!success) {
        console.error('复制失败');
      }
    } catch (error) {
      console.error('复制过程出错:', error);
    }
  });
  
  return card;
}

// 添加搜索功能
let clipboardHistory = []; // 保存完整的历史记录

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  
  searchInput.addEventListener('input', (e) => {
    const searchText = e.target.value.toLowerCase();
    const filteredHistory = clipboardHistory.filter(item => {
      if (item.type === 'image') return true; // 图片始终显示
      const content = item.content || '';
      return content.toLowerCase().includes(searchText);
    });
    renderClipboardHistory(filteredHistory);
  });
}

// 修改现有的历史更新处理
window.electronAPI.onUpdateClipboardHistory((history) => {
  clipboardHistory = history; // 保存完整历史
  renderClipboardHistory(history);
});

// 在初始化时设置搜索
setupSearch();

// 添加虚拟滚动支持
class VirtualScroller {
  constructor(container, itemHeight, itemWidth, renderCallback) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.itemWidth = itemWidth;
    this.renderCallback = renderCallback;
    this.items = [];
    this.visibleItems = new Map();
    this.lastScrollLeft = 0;
    
    this.container.addEventListener('scroll', this.onScroll.bind(this));
    this.resizeObserver = new ResizeObserver(this.onResize.bind(this));
    this.resizeObserver.observe(this.container);
  }
  
  setItems(items) {
    this.items = items;
    this.updateContainerWidth();
    this.render();
  }
  
  updateContainerWidth() {
    const totalWidth = this.items.length * (this.itemWidth + 15); // 15px for gap
    this.container.style.width = `${totalWidth}px`;
  }
  
  onScroll() {
    if (Math.abs(this.container.scrollLeft - this.lastScrollLeft) > 10) {
      this.lastScrollLeft = this.container.scrollLeft;
      this.render();
    }
  }
  
  onResize() {
    this.render();
  }
  
  render() {
    const containerRect = this.container.getBoundingClientRect();
    const startIndex = Math.max(0, Math.floor(this.container.scrollLeft / (this.itemWidth + 15)) - 2);
    const endIndex = Math.min(
      this.items.length - 1,
      Math.ceil((this.container.scrollLeft + containerRect.width) / (this.itemWidth + 15)) + 2
    );
    
    // 记录当前可见的项
    const currentVisible = new Set();
    
    // 渲染可见项
    for (let i = startIndex; i <= endIndex; i++) {
      const item = this.items[i];
      currentVisible.add(item.id);
      
      if (!this.visibleItems.has(item.id)) {
        const element = this.renderCallback(item, i);
        element.style.position = 'absolute';
        element.style.left = `${i * (this.itemWidth + 15)}px`;
        element.style.width = `${this.itemWidth}px`;
        element.style.height = `${this.itemHeight}px`;
        this.container.appendChild(element);
        this.visibleItems.set(item.id, element);
      }
    }
    
    // 移除不可见的项
    for (const [id, element] of this.visibleItems.entries()) {
      if (!currentVisible.has(id)) {
        element.remove();
        this.visibleItems.delete(id);
      }
    }
  }
  
  destroy() {
    this.container.removeEventListener('scroll', this.onScroll);
    this.resizeObserver.disconnect();
    this.container.innerHTML = '';
  }
}

// 初始化虚拟滚动
let virtualScroller = null;

// 渲染剪贴板历史（使用虚拟滚动）
function renderClipboardHistory(history) {
  // 清空容器
  if (virtualScroller) {
    virtualScroller.destroy();
  }
  
  cardsContainer.innerHTML = '';
  cardsContainer.style.position = 'relative';
  
  // 如果没有历史记录
  if (!history || history.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = '暂无剪贴板历史记录';
    cardsContainer.appendChild(emptyMessage);
    return;
  }
  
  // 创建虚拟滚动
  virtualScroller = new VirtualScroller(
    cardsContainer,
    250, // 卡片高度
    250, // 卡片宽度
    createCardElement
  );
  
  // 设置数据
  virtualScroller.setItems(history);
}

// 监听键盘事件（合并所有键盘相关的处理）
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.electronAPI.hideWindow();
  } else if (event.key === 'ArrowLeft') {
    cardsContainer.scrollBy({
      left: -300,
      behavior: 'smooth'
    });
  } else if (event.key === 'ArrowRight') {
    cardsContainer.scrollBy({
      left: 300,
      behavior: 'smooth'
    });
  }
});

// 单一的历史更新处理
window.electronAPI.onUpdateClipboardHistory((history) => {
  clipboardHistory = history; // 保存完整历史
  renderClipboardHistory(history);
});

// 初始化功能
async function init() {
  setupSearch();
  setupShortcutConfig();
  setupCloseButton();
  setupClearButton();
  
  // 获取并渲染初始历史记录
  const initialHistory = await window.electronAPI.getHistory();
  if (initialHistory && initialHistory.length > 0) {
    clipboardHistory = initialHistory;
    renderClipboardHistory(initialHistory);
  }
}

// 启动应用
init();

// 监听滚动事件，实现平滑滚动
// 添加滚动处理
document.addEventListener('wheel', (event) => {
  if (event.deltaY !== 0) {
    event.preventDefault();
    cardsContainer.scrollLeft += event.deltaY;
  }
}, { passive: false });

// 修改触控板手势支持
let isScrolling = false;
let startX;
let scrollLeft;

cardsContainer.addEventListener('mousedown', (e) => {
  isScrolling = true;
  startX = e.pageX - cardsContainer.offsetLeft;
  scrollLeft = cardsContainer.scrollLeft;
});

document.addEventListener('mousemove', (e) => {
  if (!isScrolling) return;
  e.preventDefault();
  const x = e.pageX - cardsContainer.offsetLeft;
  const walk = (x - startX) * 2;
  cardsContainer.scrollLeft = scrollLeft - walk;
});

document.addEventListener('mouseup', () => {
  isScrolling = false;
});

// 修改键盘导航支持
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    cardsContainer.scrollBy({
      left: -300,
      behavior: 'smooth'
    });
  } else if (event.key === 'ArrowRight') {
    cardsContainer.scrollBy({
      left: 300,
      behavior: 'smooth'
    });
  }
});

// 监nfrom主进程发来的剪贴板历史更新
window.electronAPI.onUpdateClipboardHistory((history) => {
  renderClipboardHistory(history);
});

// 添加快捷键设置功能
async function setupShortcutConfig() {
  const settingsBtn = document.getElementById('settingsBtn');
  
  settingsBtn.addEventListener('click', async () => {
    const currentShortcut = await window.electronAPI.getCurrentShortcut();
    
    const modal = document.createElement('div');
    modal.className = 'shortcut-modal';
    modal.innerHTML = `
      <h3>设置快捷键</h3>
      <input type="text" class="shortcut-input" value="${currentShortcut}" placeholder="点击输入新快捷键" readonly>
      <p>按下新的快捷键组合，按ESC取消</p>
      <div class="shortcut-buttons">
        <button class="save-btn" disabled>保存</button>
        <button class="cancel-btn">取消</button>
      </div>
    `;
    
    const input = modal.querySelector('.shortcut-input');
    const saveBtn = modal.querySelector('.save-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    let newShortcut = '';
    
    function handleKeyDown(e) {
      e.preventDefault();
      
      if (e.key === 'Escape') {
        modal.remove();
        return;
      }
      
      const keys = [];
      if (e.metaKey) keys.push('Command');
      if (e.ctrlKey) keys.push('Control');
      if (e.altKey) keys.push('Option');
      if (e.shiftKey) keys.push('Shift');
      
      const key = e.key.toUpperCase();
      if (!['META', 'CONTROL', 'ALT', 'SHIFT'].includes(key)) {
        keys.push(key);
      }
      
      if (keys.length > 0) {
        newShortcut = keys.join('+');
        input.value = newShortcut;
        saveBtn.disabled = false;
      }
    }
    
    saveBtn.addEventListener('click', async () => {
      if (newShortcut) {
        await window.electronAPI.setShortcut(newShortcut);
        modal.remove();
      }
    });
    
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });
    
    input.addEventListener('keydown', handleKeyDown);
    document.body.appendChild(modal);
    input.focus();
  });
}

// 添加关闭按钮功能
function setupCloseButton() {
  const closeBtn = document.getElementById('closeBtn');
  closeBtn.addEventListener('click', () => {
    window.electronAPI.hideWindow();
  });
}

// 添加清空按钮事件处理
async function setupClearButton() {
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const success = await window.electronAPI.clearHistory();
      if (!success) {
        console.error('清空历史记录失败');
      }
    });
  }
}

// 在初始化时调用
setupClearButton();

// 初始化时调用
setupShortcutConfig();