(function () {
  'use strict';

  console.log('🚀 [百度网盘重复文件与空文件夹清理助手] 插件已成功加载！');

  let currentBdsToken = '';
  let activeDeleter = null;

  // 监听来自 inject.js (运行在 MAIN world) 的消息获取 bdstoken
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'BAIDU_PAN_HELPER_STATE') {
      if (event.data.bdstoken) {
        currentBdsToken = event.data.bdstoken;
      }
    }
  });

  /**
   * 核心原件保护过滤器：同名文件若出现多项，强制保留第1项原件，仅删除后续副本
   */
  function filterAndProtectOriginalFiles(fileList) {
    const nameMap = new Map();

    fileList.forEach(fullPath => {
      const parts = fullPath.split('/');
      const fileName = parts[parts.length - 1];
      if (!nameMap.has(fileName)) {
        nameMap.set(fileName, []);
      }
      nameMap.get(fileName).push(fullPath);
    });

    const protectedList = [];
    const protectedOriginals = [];

    nameMap.forEach((paths, fileName) => {
      if (paths.length === 1) {
        protectedList.push(paths[0]);
      } else {
        // 同一文件名出现了多项：强制保留第1项原件，仅删除后面的副本
        protectedOriginals.push(`${fileName} -> 保留原件: ${paths[0]}`);
        for (let i = 1; i < paths.length; i++) {
          protectedList.push(paths[i]);
        }
      }
    });

    if (protectedOriginals.length > 0) {
      console.log('🛡️ [原件保护器] 自动保留以下原件文件：\n' + protectedOriginals.join('\n'));
    }

    return protectedList;
  }

  /**
   * 精准匹配包含 .list-view-item.choosen 与 .group-view-item.choosen 的选中的行
   */
  function scanSelectedFiles() {
    const rawPaths = new Set();

    // 完美匹配重复文件行 (.group-view-item.choosen) 与 空文件夹行 (.list-view-item.choosen)
    const selectedRows = document.querySelectorAll(
      '.list-view-item.choosen, .group-view-item.choosen, .list-view-item.chosen, .group-view-item.chosen, ' +
      '.choosen, .wp-s-pan-list-item--selected, .is-checked, .is-selected, tr.selected, tr.is-selected, li.selected, dd.choosen'
    );

    selectedRows.forEach(row => {
      // 过滤表头或全选控件
      if (row.querySelector('th') || row.classList.contains('header')) return;

      // 提取所在路径
      let pathStr = '';
      const pathEl = row.querySelector('.file-path a, .file-path [title], [data-path], [title^="/"], [title="全部文件"]');
      if (pathEl) {
        pathStr = pathEl.getAttribute('title') || pathEl.getAttribute('data-path') || pathEl.textContent.trim();
        if (pathStr === '全部文件') pathStr = '/';
      }

      // 提取文件/文件夹名称
      let nameStr = '';
      const nameEl = row.querySelector('.file-name a, .file-name .filename, .filename, .name a, [title]');
      if (nameEl) {
        nameStr = nameEl.getAttribute('title') || nameEl.textContent.trim();
      }

      if (pathStr && nameStr) {
        let fullPath = '';
        if (pathStr === '/') {
          fullPath = '/' + nameStr;
        } else if (pathStr.endsWith(nameStr)) {
          fullPath = pathStr;
        } else {
          fullPath = pathStr.endsWith('/') ? pathStr + nameStr : pathStr + '/' + nameStr;
        }

        if (fullPath.startsWith('/') && !fullPath.includes('...') && !fullPath.includes('…')) {
          rawPaths.add(fullPath);
        }
      } else if (pathStr && pathStr.startsWith('/') && !pathStr.includes('...') && !pathStr.includes('…')) {
        rawPaths.add(pathStr);
      }
    });

    // 降级兜底方案 2：如果 selector 规则未匹配到，则查找带有 input:checked 或 .u-checkbox-checked 的行
    if (rawPaths.size === 0) {
      const checkedInputs = document.querySelectorAll('input[type="checkbox"]:checked, .u-checkbox-checked, .node-checkbox-checked, [aria-checked="true"]');
      checkedInputs.forEach(cb => {
        let row = cb.closest('.list-view-item, .group-view-item, .list-item, tr, li, dd, [class*="list-item"]');
        if (!row || row.querySelector('th') || row.classList.contains('header')) return;

        let pathEl = row.querySelector('.file-path a, .file-path [title], [data-path], [title^="/"], [title="全部文件"]');
        let nameEl = row.querySelector('.file-name a, .file-name .filename, .filename, .name a, [title]');

        let pathStr = pathEl ? (pathEl.getAttribute('title') || pathEl.getAttribute('data-path') || pathEl.textContent.trim()) : '';
        if (pathStr === '全部文件') pathStr = '/';
        let nameStr = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent.trim()) : '';

        if (pathStr && nameStr) {
          let fullPath = pathStr === '/' ? '/' + nameStr : (pathStr.endsWith(nameStr) ? pathStr : (pathStr.endsWith('/') ? pathStr + nameStr : pathStr + '/' + nameStr));
          if (fullPath.startsWith('/') && !fullPath.includes('...') && !fullPath.includes('…')) {
            rawPaths.add(fullPath);
          }
        }
      });
    }

    return filterAndProtectOriginalFiles(Array.from(rawPaths));
  }

  // 创建 UI 浮动面板
  function createFloatingUI() {
    if (document.getElementById('bdp-cleaner-floating-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'bdp-cleaner-floating-bar';
    bar.innerHTML = `
      <span class="bdp-cleaner-badge">免VIP版</span>
      <div class="bdp-cleaner-count-info">
        已检测选中: <span id="bdp-cleaner-count" class="bdp-cleaner-count-num">0</span> 项文件/文件夹
      </div>
      <button id="bdp-cleaner-scan-btn" class="bdp-cleaner-btn bdp-cleaner-btn-secondary" title="重新扫描勾选">
        🔄 刷新检测
      </button>
      <button id="bdp-cleaner-view-btn" class="bdp-cleaner-btn bdp-cleaner-btn-secondary" title="查看当前勾选的清理清单">
        📋 查看勾选清单
      </button>
      <button id="bdp-cleaner-start-btn" class="bdp-cleaner-btn" title="免VIP一键批量删除">
        🚀 免VIP一键删除已选
      </button>
      <button id="bdp-cleaner-manual-btn" class="bdp-cleaner-btn bdp-cleaner-btn-secondary" title="手动粘贴文件/文件夹路径进行删除">
        📝 手动输入
      </button>
    `;

    document.body.appendChild(bar);

    const scanBtn = document.getElementById('bdp-cleaner-scan-btn');
    scanBtn.addEventListener('click', () => {
      scanBtn.textContent = '⌛ 正在刷新...';
      window.postMessage({ type: 'BAIDU_PAN_HELPER_SCAN_REQ' }, '*');
      setTimeout(() => {
        const items = scanSelectedFiles();
        scanBtn.textContent = `✅ 已刷新(${items.length})`;
        updateCount();
        setTimeout(() => {
          scanBtn.textContent = '🔄 刷新检测';
        }, 1200);
      }, 300);
    });

    document.getElementById('bdp-cleaner-view-btn').addEventListener('click', handleViewList);
    document.getElementById('bdp-cleaner-start-btn').addEventListener('click', handleStartDelete);
    document.getElementById('bdp-cleaner-manual-btn').addEventListener('click', handleManualInput);

    setInterval(updateCount, 1200);
    updateCount();
  }

  function updateCount() {
    let selected = scanSelectedFiles();
    const countEl = document.getElementById('bdp-cleaner-count');
    if (countEl) {
      countEl.textContent = selected.length;
    }
  }

  // 专属弹窗：查看与自由编辑已勾选文件/空文件夹清单
  function handleViewList() {
    let items = scanSelectedFiles();
    if (items.length === 0) {
      alert('⚠️ 未检测到已勾选的项目！\n提示：请先在百度网盘页面上勾选要删除的重复文件或空文件夹。');
      return;
    }

    let existingModal = document.getElementById('bdp-cleaner-modal-overlay');
    if (existingModal) existingModal.remove();

    const textList = items.join('\n');

    const overlay = document.createElement('div');
    overlay.id = 'bdp-cleaner-modal-overlay';
    overlay.innerHTML = `
      <div id="bdp-cleaner-modal-card" style="width: 600px;">
        <div class="bdp-cleaner-modal-header">
          <div class="bdp-cleaner-modal-title">
            <span>📋 已勾选的待清理清单 (${items.length} 项)</span>
          </div>
          <button id="bdp-cleaner-view-close" class="bdp-cleaner-close-btn">&times;</button>
        </div>

        <p style="font-size: 12px; color: #10b981; font-weight: 600; margin: 4px 0;">
          🛡️ 完美支持重复文件与空文件夹批量清理。
        </p>

        <textarea id="bdp-cleaner-list-textarea" style="width:100%; height: 220px; font-family: monospace; font-size: 11px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: #0f172a; color: #38bdf8; line-height: 1.6; outline: none; box-sizing: border-box;"></textarea>

        <div class="bdp-cleaner-modal-actions">
          <button id="bdp-cleaner-view-cancel" class="bdp-cleaner-btn bdp-cleaner-btn-secondary">关闭</button>
          <button id="bdp-cleaner-view-execute" class="bdp-cleaner-btn">🚀 确认并一键删除已选</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = document.getElementById('bdp-cleaner-list-textarea');
    textarea.value = textList;

    const closeHandler = () => overlay.remove();
    document.getElementById('bdp-cleaner-view-close').addEventListener('click', closeHandler);
    document.getElementById('bdp-cleaner-view-cancel').addEventListener('click', closeHandler);

    document.getElementById('bdp-cleaner-view-execute').addEventListener('click', () => {
      const val = textarea.value.trim();
      const lines = val.split('\n').map(s => s.trim()).filter(Boolean);
      overlay.remove();
      if (lines.length > 0) {
        executeDeletion(lines);
      } else {
        alert('清单内容为空！');
      }
    });
  }

  // 显示删除进度 Modal 弹窗
  function showProgressModal(totalCount) {
    let modal = document.getElementById('bdp-cleaner-modal-overlay');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'bdp-cleaner-modal-overlay';
    modal.innerHTML = `
      <div id="bdp-cleaner-modal-card">
        <div class="bdp-cleaner-modal-header">
          <div class="bdp-cleaner-modal-title">
            <span>🗑️ 正在批量清理文件/空文件夹</span>
          </div>
          <button id="bdp-cleaner-modal-close" class="bdp-cleaner-close-btn">&times;</button>
        </div>

        <div class="bdp-cleaner-status-row">
          <span id="bdp-cleaner-modal-status">正在准备任务...</span>
          <span id="bdp-cleaner-modal-ratio">0 / ${totalCount} (0%)</span>
        </div>

        <div class="bdp-cleaner-progress-bar-bg">
          <div id="bdp-cleaner-modal-progress-fill" class="bdp-cleaner-progress-bar-fill"></div>
        </div>

        <div id="bdp-cleaner-modal-log" class="bdp-cleaner-log-box"></div>

        <div class="bdp-cleaner-modal-actions">
          <button id="bdp-cleaner-pause-btn" class="bdp-cleaner-btn bdp-cleaner-btn-secondary">⏸️ 暂停</button>
          <button id="bdp-cleaner-cancel-btn" class="bdp-cleaner-btn bdp-cleaner-btn-danger">❌ 取消任务</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('bdp-cleaner-modal-close');
    closeBtn.addEventListener('click', () => {
      if (activeDeleter && (activeDeleter.isPaused || activeDeleter.isCancelled)) {
        modal.remove();
      } else if (confirm('任务正在运行中，确定要关闭窗口并取消任务吗？')) {
        if (activeDeleter) activeDeleter.cancel();
        modal.remove();
      }
    });

    const pauseBtn = document.getElementById('bdp-cleaner-pause-btn');
    pauseBtn.addEventListener('click', () => {
      if (!activeDeleter) return;
      if (activeDeleter.isPaused) {
        activeDeleter.resume();
        pauseBtn.textContent = '⏸️ 暂停';
      } else {
        activeDeleter.pause();
        pauseBtn.textContent = '▶️ 继续';
      }
    });

    const cancelBtn = document.getElementById('bdp-cleaner-cancel-btn');
    cancelBtn.addEventListener('click', () => {
      if (activeDeleter) {
        activeDeleter.cancel();
      }
    });

    return modal;
  }

  function appendModalLog(message) {
    try {
      const logBox = document.getElementById('bdp-cleaner-modal-log');
      if (logBox) {
        const time = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.textContent = `[${time}] ${message}`;
        logBox.appendChild(line);
        
        requestAnimationFrame(() => {
          try {
            if (logBox && typeof logBox.scrollHeight !== 'undefined') {
              logBox.scrollTop = logBox.scrollHeight;
            }
          } catch(e) {}
        });
      } else {
        console.log(`[BaiduCleaner Log] ${message}`);
      }
    } catch (e) {
      console.warn('appendModalLog 警告:', e);
    }
  }

  function updateModalProgress(info) {
    const statusEl = document.getElementById('bdp-cleaner-modal-status');
    const ratioEl = document.getElementById('bdp-cleaner-modal-ratio');
    const fillEl = document.getElementById('bdp-cleaner-modal-progress-fill');

    if (statusEl) {
      statusEl.textContent = `进行中: 成功 ${info.success} 项 / 失败 ${info.failed} 项`;
    }
    if (ratioEl) {
      ratioEl.textContent = `${info.processed} / ${info.total} (${info.percentage}%)`;
    }
    if (fillEl) {
      fillEl.style.width = `${info.percentage}%`;
    }
  }

  // 执行删除逻辑
  async function executeDeletion(fileItems) {
    if (!fileItems || fileItems.length === 0) {
      alert('⚠️ 未能找到要删除的项目！');
      return;
    }

    const safeFileItems = filterAndProtectOriginalFiles(fileItems);

    const confirmText = `确定要免 VIP 删除选中的 ${safeFileItems.length} 项（文件/空文件夹）吗？\n（可随时在网盘回收站查看或还原）`;
    if (!confirm(confirmText)) return;

    showProgressModal(safeFileItems.length);

    const DeleterClass = window.BaiduFileDeleter || (typeof BaiduFileDeleter !== 'undefined' ? BaiduFileDeleter : null);
    if (!DeleterClass) {
      alert('❌ 批量删除脚本加载出现异常，请在 chrome://extensions/ 刷新插件并重试！');
      return;
    }

    activeDeleter = new DeleterClass({
      batchSize: 20,
      delayMs: 600,
      onProgress: updateModalProgress,
      onLog: appendModalLog
    });

    window.postMessage({ type: 'BAIDU_PAN_HELPER_GET_TOKEN_REQ' }, '*');
    await new Promise(r => setTimeout(r, 200));

    try {
      const res = await activeDeleter.startDeleteTask(safeFileItems, currentBdsToken);
      appendModalLog(`🎉 任务结束：成功清理 ${res.success} 项（文件/空文件夹）。可在回收站还原。`);
      
      const pauseBtn = document.getElementById('bdp-cleaner-pause-btn');
      if (pauseBtn) pauseBtn.style.display = 'none';
      const cancelBtn = document.getElementById('bdp-cleaner-cancel-btn');
      if (cancelBtn) {
        cancelBtn.textContent = '完成并关闭';
        cancelBtn.className = 'bdp-cleaner-btn';
        cancelBtn.onclick = () => {
          document.getElementById('bdp-cleaner-modal-overlay').remove();
        };
      }
    } catch (err) {
      appendModalLog(`❌ 执行失败: ${err.message}`);
    }
  }

  // 快捷检测与处理函数
  function handleStartDelete() {
    window.postMessage({ type: 'BAIDU_PAN_HELPER_SCAN_REQ' }, '*');
    
    setTimeout(() => {
      const selectedFiles = scanSelectedFiles();

      if (selectedFiles.length === 0) {
        alert('⚠️ 未检测到已勾选的项目！\n请先在页面上勾选要清理的空文件夹或重复文件！');
        return;
      }

      executeDeletion(selectedFiles);
    }, 150);
  }

  // 手动粘贴列表处理函数
  function handleManualInput() {
    const input = prompt('请粘贴要删除的文件/文件夹完整路径或fs_id（每行一个，例：/我的资源/空文件夹）：');
    if (input) {
      const paths = input.split('\n').map(s => s.trim()).filter(Boolean);
      if (paths.length > 0) {
        executeDeletion(paths);
      } else {
        alert('输入内容为空！');
      }
    }
  }

  // 初始化浮动 UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingUI);
  } else {
    createFloatingUI();
  }

})();
