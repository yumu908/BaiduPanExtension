/**
 * 百度网盘多端全兼容文件批量删除引擎
 */
class BaiduFileDeleter {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 20;
    this.delayMs = options.delayMs || 600;
    this.onProgress = options.onProgress || (() => {});
    this.onLog = options.onLog || (() => {});
    this.isPaused = false;
    this.isCancelled = false;
  }

  async fetchBdsTokenFromApi() {
    try {
      const res = await fetch('https://pan.baidu.com/api/gettemplatevariable?clienttype=0&app_id=250528&fields=[%22bdstoken%22]', {
        credentials: 'include'
      });
      const data = await res.json();
      if (data && data.result && data.result.bdstoken) {
        return data.result.bdstoken;
      }
    } catch (e) {
      console.warn('通过 API 获取 bdstoken 失败:', e);
    }
    return '';
  }

  /**
   * 单批次删除请求 (包含 3 种百度官方 API 方式自动轮询)
   */
  async deleteBatch(itemList, bdstoken) {
    if (!itemList || itemList.length === 0) return { errno: 0, count: 0 };

    const payload = itemList.map(item => {
      if (typeof item === 'object' && item !== null) {
        return item.fs_id || item.path;
      }
      if (typeof item === 'string' && /^\d+$/.test(item.trim())) {
        return parseInt(item.trim(), 10);
      }
      return item;
    });

    const jsonFileList = JSON.stringify(payload);

    // 【尝试 1】：标准 Web API (/api/filemanager?opera=delete&async=1)
    try {
      const url1 = `https://pan.baidu.com/api/filemanager?opera=delete&async=1&onnest=fail&bdstoken=${encodeURIComponent(bdstoken)}&channel=chunlei&web=1&app_id=250528&clienttype=0`;
      const body1 = 'filelist=' + encodeURIComponent(jsonFileList);

      const res1 = await fetch(url1, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: body1
      });

      const data1 = await res1.json();
      if (data1 && data1.errno === 0) return data1;
    } catch (e) {}

    // 【尝试 2】：同步模式 FormData (/api/filemanager?opera=delete&async=0)
    try {
      const url2 = `https://pan.baidu.com/api/filemanager?opera=delete&async=0&onnest=fail&bdstoken=${encodeURIComponent(bdstoken)}&channel=chunlei&web=1&app_id=250528&clienttype=0`;
      const formData2 = new FormData();
      formData2.append('filelist', jsonFileList);

      const res2 = await fetch(url2, {
        method: 'POST',
        credentials: 'include',
        body: formData2
      });

      const data2 = await res2.json();
      if (data2 && data2.errno === 0) return data2;
    } catch (e) {}

    // 【尝试 3】：XPAN REST 接口 (/rest/2.0/xpan/file?method=filemanager)
    try {
      const url3 = `https://pan.baidu.com/rest/2.0/xpan/file?method=filemanager&opera=delete&bdstoken=${encodeURIComponent(bdstoken)}`;
      const body3 = 'filelist=' + encodeURIComponent(jsonFileList);

      const res3 = await fetch(url3, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: body3
      });

      const data3 = await res3.json();
      if (data3 && data3.errno === 0) return data3;
    } catch (e) {}

    // 【尝试 4】：带 opera=delete 在 POST 体中的通用格式
    try {
      const url4 = `https://pan.baidu.com/api/filemanager?bdstoken=${encodeURIComponent(bdstoken)}`;
      const body4 = `opera=delete&async=1&onnest=fail&filelist=${encodeURIComponent(jsonFileList)}`;

      const res4 = await fetch(url4, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        credentials: 'include',
        body: body4
      });

      const data4 = await res4.json();
      return data4;
    } catch (e) {
      return { errno: 132, errmsg: e.message };
    }
  }

  /**
   * 执行批量循环删除任务
   */
  async startDeleteTask(fileItems, bdstoken) {
    this.isPaused = false;
    this.isCancelled = false;

    if (!fileItems || fileItems.length === 0) {
      this.onLog('⚠️ 未发现待删除的文件列表');
      return { success: 0, failed: 0, total: 0 };
    }

    if (!bdstoken) {
      this.onLog('🔍 正在尝试自动抓取 bdstoken 凭证...');
      bdstoken = await this.fetchBdsTokenFromApi();
    }

    if (!bdstoken) {
      this.onLog('❌ 错误：未能获取到 bdstoken 凭证。请确认已登录网盘页面。');
      throw new Error('未获取到 bdstoken 凭证');
    }

    const total = fileItems.length;
    this.onLog(`🚀 开始任务：共 ${total} 个文件待删除，已开启 4 重接口轮询模式`);
    
    const sample = fileItems[0];
    const sampleStr = typeof sample === 'object' ? (sample.path || sample.fs_id) : sample;
    this.onLog(`🔍 清理项[1]: ${sampleStr}`);

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < total; i += this.batchSize) {
      if (this.isCancelled) {
        this.onLog('⛔ 任务已由用户手动取消。');
        break;
      }

      while (this.isPaused && !this.isCancelled) {
        this.onLog('⏸️ 任务已暂停，等待继续...');
        await new Promise(r => setTimeout(r, 1000));
      }

      const chunk = fileItems.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(total / this.batchSize);

      try {
        this.onLog(`⏳ 正在删除第 [${batchNum}/${totalBatches}] 批文件 (${chunk.length} 项)...`);
        let result = await this.deleteBatch(chunk, bdstoken);

        // 如果批量删除成功
        if (result && result.errno === 0) {
          successCount += chunk.length;
          this.onLog(`✅ 第 [${batchNum}/${totalBatches}] 批批量删除成功 (${chunk.length} 项)`);
        } 
        // 自动开启【单文件精细化删除】模式
        else {
          this.onLog(`⚠️ 批量接口返回 errno: ${result ? result.errno : '未知'}，自动开启【单文件精细化删除】...`);
          
          for (const singleItem of chunk) {
            if (this.isCancelled) break;

            const itemStr = typeof singleItem === 'object' ? (singleItem.path || singleItem.fs_id) : singleItem;
            const singleRes = await this.deleteBatch([singleItem], bdstoken);

            if (singleRes && singleRes.errno === 0) {
              successCount++;
              this.onLog(`  ✅ 成功删除: ${itemStr}`);
            } else {
              failedCount++;
              const errCode = singleRes ? singleRes.errno : '未知';
              this.onLog(`  ❌ 删除失败 (errno: ${errCode}): ${itemStr}`);
            }
          }
        }
      } catch (err) {
        failedCount += chunk.length;
        this.onLog(`❌ 第 [${batchNum}/${totalBatches}] 批网络异常: ${err.message}`);
      }

      const processed = Math.min(i + chunk.length, total);
      this.onProgress({
        processed,
        total,
        percentage: Math.round((processed / total) * 100),
        success: successCount,
        failed: failedCount
      });

      if (i + this.batchSize < total && !this.isCancelled) {
        await new Promise(r => setTimeout(r, this.delayMs));
      }
    }

    this.onLog(`🏁 任务完成！共处理: ${total}，成功: ${successCount}，失败: ${failedCount}`);
    return { success: successCount, failed: failedCount, total };
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  cancel() {
    this.isCancelled = true;
  }
}

if (typeof window !== 'undefined') {
  window.BaiduFileDeleter = BaiduFileDeleter;
}
