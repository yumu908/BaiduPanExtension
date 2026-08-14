document.addEventListener('DOMContentLoaded', async () => {
  const startBtn = document.getElementById('popup-start-delete');
  const textarea = document.getElementById('manual-paths');
  const tokenInput = document.getElementById('bdstoken-input');
  const statusCard = document.getElementById('popup-status-card');
  const progressFill = document.getElementById('popup-progress-fill');
  const logBox = document.getElementById('popup-log');

  function appendLog(msg) {
    statusCard.classList.remove('hidden');
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.textContent = `[${time}] ${msg}`;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  }

  // 尝试在 active tab 查询凭证
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('baidu.com')) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return window.yunData?.MYBDSTOKEN || window.bdstoken || '';
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          tokenInput.value = results[0].result;
        }
      });
    }
  } catch (e) {
    console.log('获取当前页凭证失败:', e);
  }

  startBtn.addEventListener('click', async () => {
    const rawPaths = textarea.value.trim();
    if (!rawPaths) {
      alert('请先输入要删除的文件完整路径（每行一个）');
      return;
    }

    const filePaths = rawPaths.split('\n').map(s => s.trim()).filter(Boolean);
    if (filePaths.length === 0) {
      alert('文件路径列表为空！');
      return;
    }

    const bdstoken = tokenInput.value.trim();

    if (!confirm(`确定要删除输入的 ${filePaths.length} 个文件吗？`)) {
      return;
    }

    logBox.innerHTML = '';
    progressFill.style.width = '0%';
    startBtn.disabled = true;
    startBtn.textContent = '删除处理中...';

    const DeleterClass = window.BaiduFileDeleter;
    const deleter = new DeleterClass({
      batchSize: 20,
      delayMs: 600,
      onProgress: (info) => {
        progressFill.style.width = `${info.percentage}%`;
      },
      onLog: appendLog
    });

    try {
      const res = await deleter.startDeleteTask(filePaths, bdstoken);
      appendLog(`🎉 处理完成！成功: ${res.success}，失败: ${res.failed}`);
    } catch (err) {
      appendLog(`❌ 执行出现异常: ${err.message}`);
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = '🚀 执行免VIP批量删除';
    }
  });
});
