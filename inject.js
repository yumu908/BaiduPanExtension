(function () {
  'use strict';

  function getBdsToken() {
    let token = '';

    if (window.yunData && window.yunData.MYBDSTOKEN) {
      token = window.yunData.MYBDSTOKEN;
    } else if (window.locals && typeof window.locals.get === 'function') {
      token = window.locals.get('bdstoken');
    } else if (window.bdstoken) {
      token = window.bdstoken;
    } else {
      const match = document.cookie.match(/BDSTOKEN=([^;]+)/) ||
        document.documentElement.innerHTML.match(/"bdstoken"\s*:\s*"([a-f0-9]+)"/i);
      if (match && match[1]) {
        token = match[1];
      }
    }

    return token;
  }

  // 严格扫描 React / Vue 实例中仅处于“已勾选”状态的文件项
  function scanReactVueSelectedFiles() {
    const selectedItems = [];
    const seenKeys = new Set();
    const allEls = document.querySelectorAll('*');

    allEls.forEach(el => {
      const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
      if (reactKey) {
        let fiber = el[reactKey];
        let depth = 0;
        while (fiber && depth < 6) {
          const props = fiber.memoizedProps || fiber.pendingProps || fiber.props;
          if (props) {
            const item = props.fileInfo || props.item || props.data || props.record || props.file || props.row;
            
            // 严格布尔/数值检查：必须明确被勾选 (select == 1 或 isChecked == true)
            const isSelected = 
              props.selected === true || 
              props.isChecked === true || 
              props.checked === true ||
              (item && (
                item.selected === true || item.selected === 1 || 
                item.isChecked === true || item.checked === true || 
                item.select === true || item.select === 1
              ));

            if (item && isSelected) {
              const fs_id = item.fs_id || item.fsId;
              let fullPath = item.path;
              if (!fullPath && item.parent_path && item.server_filename) {
                fullPath = item.parent_path.endsWith('/') ? item.parent_path + item.server_filename : item.parent_path + '/' + item.server_filename;
              }

              const key = fs_id ? `fs_${fs_id}` : `path_${fullPath}`;
              if (!seenKeys.has(key) && (fullPath || fs_id)) {
                seenKeys.add(key);
                selectedItems.push({
                  path: fullPath || '',
                  fs_id: fs_id || null,
                  name: item.server_filename || item.filename || ''
                });
              }
            }
          }
          fiber = fiber.return;
          depth++;
        }
      }

      // Vue 严格检查
      if (el.__vue__) {
        const vm = el.__vue__;
        const item = vm.fileInfo || vm.item || vm.data || vm.file || vm.row;
        const isSelected = 
          vm.selected === true || vm.isChecked === true || vm.checked === true ||
          (item && (
            item.selected === true || item.selected === 1 || 
            item.isChecked === true || item.checked === true || 
            item.select === true || item.select === 1
          ));

        if (item && isSelected) {
          const fs_id = item.fs_id || item.fsId;
          let fullPath = item.path;
          if (!fullPath && item.parent_path && item.server_filename) {
            fullPath = item.parent_path.endsWith('/') ? item.parent_path + item.server_filename : item.parent_path + '/' + item.server_filename;
          }
          const key = fs_id ? `fs_${fs_id}` : `path_${fullPath}`;
          if (!seenKeys.has(key) && (fullPath || fs_id)) {
            seenKeys.add(key);
            selectedItems.push({
              path: fullPath || '',
              fs_id: fs_id || null,
              name: item.server_filename || item.filename || ''
            });
          }
        }
      }
    });

    return selectedItems;
  }

  function notifyState() {
    const token = getBdsToken();
    const reactVueItems = scanReactVueSelectedFiles();

    window.postMessage({
      type: 'BAIDU_PAN_HELPER_STATE',
      bdstoken: token,
      reactVueItems: reactVueItems,
      reactVuePaths: reactVueItems.map(i => i.fs_id || i.path).filter(Boolean)
    }, '*');
  }

  notifyState();
  setInterval(notifyState, 1000);

  window.addEventListener('message', function (e) {
    if (e.data && (e.data.type === 'BAIDU_PAN_HELPER_GET_TOKEN_REQ' || e.data.type === 'BAIDU_PAN_HELPER_SCAN_REQ')) {
      notifyState();
    }
  });

})();
