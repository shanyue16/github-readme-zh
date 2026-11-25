// ==UserScript==
// @name         GitHub README 中文版自动替换
// @namespace    https://github.com/
// @version      1.0.0
// @description  自动识别Github仓库主页的中文 README 并替换显示，可一键切回原版
// @author       shanyue16
// @match        https://github.com/*/*
// @grant        GM_xmlhttpRequest
// @connect      github.com
// @run-at       document-idle
// ==/UserScript==

// GitHub README 中文版自动替换
// Copyright (C) 2026 shanyue16
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

(function () {
  'use strict';

  /* ==================== 可配置项 ==================== */
  const CONFIG = {
    // 候选中文 README 文件名，按优先级排列；匹配时不区分大小写
    filenames: [
      'README_ZH.md',
      'README_zh.md',
      'README_zh-CN.md',
      'README.zh-CN.md',
      'README_ZH-CN.md',
      'README.ZH-CN.md',
      'README_zh_CN.md',
      'README_ZH_CN.md',
      'README.zh_CN.md',
      'README-zh-CN.md',
      'README.zh.md',
      'README.ZH.md',
      'README_zh-Hans.md',
      'README.zh-Hans.md',
      'README_CN.md',
      'README_cn.md',
    ],
    // 兜底规则：文件名形如 README_<语言标记>.md 且语言标记含 zh / cn 时也视为中文 README
    // 例如 README_zh-TW.md、README.zh_Hant.md、README-cn.md 都能自动识别
    namePattern: /^readme[._-](?:zh|cn|zh[-_.][a-z]{2,5}|cn[-_.][a-z]{2,5})\.md$/i,

    showNotice: true,              // 是否在 README 上方显示提示条
    noticeText: '已自动切换为中文 README',
    timeout: 15000,                // 请求超时（毫秒）
  };

  // 这些路径虽然也匹配 @match，但不是仓库页面
  const NOT_REPO = new Set([
    'settings', 'notifications', 'organizations', 'marketplace', 'explore',
    'topics', 'features', 'sponsors', 'pricing', 'about', 'login', 'join',
    'apps', 'collections', 'events', 'codespaces', 'search', 'new',
    'github', 'account', 'user', 'site', 'security', 'scenarios',
  ]);

  const state = {
    busy: false,
    handled: new Set(),   // 已处理过的页面，避免重复请求
    originalHtml: null,
    zhHtml: null,
    showingZh: true,
    notice: null,
    timer: null,
  };

  const log = (...args) => console.log('[README_ZH]', ...args);

  /* ==================== 工具函数 ==================== */

  // 只处理仓库首页 /owner/repo 与目录页 /owner/repo/tree/...
  function getRepo() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (!parts.length || NOT_REPO.has(parts[0])) return null;
    if (parts.length !== 2 && parts[2] !== 'tree') return null;
    return { owner: parts[0], repo: parts[1] };
  }

  // 优先从页面里的文件链接推断当前分支，拿不到就用 HEAD（GitHub 支持 HEAD 引用）
  function detectRef(owner, repo) {
    const re = new RegExp('^/' + escapeRe(owner) + '/' + escapeRe(repo) + '/(?:blob|tree)/([^/]+)');
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.pathname && a.pathname.match(re);
      if (m && m[1]) return m[1]; // 保留原 URL 编码，兼容 feature%2Fxxx 这类分支名
    }
    const parts = location.pathname.split('/').filter(Boolean);
    return (parts[2] === 'tree' && parts[3]) || 'HEAD';
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 判断文件名是否属于中文 README 候选（大小写不敏感）
  function isZhReadme(name) {
    if (typeof name !== 'string') return false;
    const lower = name.toLowerCase();
    return CONFIG.filenames.some((f) => f.toLowerCase() === lower) ||
           CONFIG.namePattern.test(name);
  }

  // 从仓库首页的文件列表链接里直接找出实际存在的中文 README。
  // 命中后只请求一次 blob 页面，避免对十几个候选名逐个发起请求。
  function findCandidateFromPage(owner, repo) {
    const re = new RegExp('^/' + escapeRe(owner) + '/' + escapeRe(repo) + '/blob/[^/]+/(.+)$');
    const found = new Map(); // key 为小写文件名，value 为页面上的原始写法
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.pathname && a.pathname.match(re);
      if (!m) continue;
      const raw = m[1].split('/').pop();
      let name = raw;
      try { name = decodeURIComponent(raw); } catch (e) { /* 保留原始写法 */ }
      if (isZhReadme(name)) found.set(name.toLowerCase(), name);
    }
    // 先按 CONFIG.filenames 的优先级挑
    for (const f of CONFIG.filenames) {
      if (found.has(f.toLowerCase())) return found.get(f.toLowerCase());
    }
    return found.values().next().value || null;
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        anonymous: false,
        headers: { Accept: 'text/html,application/xhtml+xml' },
        timeout: CONFIG.timeout,
        onload(res) {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error('HTTP ' + res.status));
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  // 从中文 README 的 blob 页面里抽出 GitHub 原生渲染后的 HTML
  // 这样表格、任务列表、emoji、相对图片链接等都与 GitHub 自己渲染的一致
  function extractRenderedHtml(pageHtml) {
    const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
    const article =
      doc.querySelector('article.markdown-body') ||
      doc.querySelector('.markdown-body.entry-content') ||
      doc.querySelector('#readme .markdown-body') ||
      doc.querySelector('.markdown-body');
    if (!article) throw new Error('页面中未找到渲染后的 Markdown 内容');
    return article.innerHTML;
  }

  function findReadmeArticle() {
    return document.querySelector('#readme article.markdown-body') ||
           document.querySelector('article.markdown-body.entry-content') ||
           document.querySelector('article.markdown-body');
  }

  /* ==================== 提示条 / 切换 ==================== */

  function removeNotice() {
    if (state.notice && state.notice.parentNode) {
      state.notice.parentNode.removeChild(state.notice);
    }
    state.notice = null;
  }

  function addNotice(article, filename) {
    removeNotice();
    if (!CONFIG.showNotice || !article.parentNode) return;

    const wrap = document.createElement('div');
    wrap.id = 'zh-readme-notice';
    wrap.style.cssText = [
      'display:flex', 'align-items:center', 'gap:10px', 'flex-wrap:wrap',
      'padding:8px 12px', 'margin:0 0 12px',
      'font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
      'color:#1f2328', 'background:#f6f8fa', 'border:1px solid #d0d7de',
      'border-radius:6px',
    ].join(';');

    const label = document.createElement('span');
    label.textContent = '📄 ' + CONFIG.noticeText + '（' + filename + '）';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = [
      'padding:3px 10px', 'font:inherit', 'color:#0969da',
      'background:#fff', 'border:1px solid #d0d7de', 'border-radius:6px',
      'cursor:pointer',
    ].join(';');
    btn.textContent = '查看原版';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.showingZh = !state.showingZh;
      article.innerHTML = state.showingZh ? state.zhHtml : state.originalHtml;
      btn.textContent = state.showingZh ? '查看原版' : '切回中文版';
      label.textContent = state.showingZh
        ? '📄 ' + CONFIG.noticeText + '（' + filename + '）'
        : '📄 当前显示原版 README.md';
    });

    wrap.appendChild(label);
    wrap.appendChild(btn);
    article.parentNode.insertBefore(wrap, article);
    state.notice = wrap;
  }

  /* ==================== 主流程 ==================== */

  async function apply() {
    if (state.busy) return;

    const repo = getRepo();
    if (!repo) return;

    const article = findReadmeArticle();
    if (!article || article.dataset.zhApplied === '1') return;

    const pageKey = location.origin + location.pathname;
    if (state.handled.has(pageKey)) return;
    state.handled.add(pageKey);

    state.busy = true;
    try {
      const ref = detectRef(repo.owner, repo.repo);
      const discovered = findCandidateFromPage(repo.owner, repo.repo);
      const candidates = discovered ? [discovered] : CONFIG.filenames;
      if (discovered) log('文件列表中发现 ' + discovered);

      for (const filename of candidates) {
        try {
          const blobUrl = `https://github.com/${repo.owner}/${repo.repo}/blob/${ref}/${encodeURIComponent(filename)}`;
          const html = await requestText(blobUrl);
          const zhHtml = extractRenderedHtml(html);

          state.originalHtml = article.innerHTML;
          state.zhHtml = zhHtml;
          state.showingZh = true;

          article.innerHTML = zhHtml;
          article.dataset.zhApplied = '1';
          addNotice(article, filename);
          log('已替换为 ' + filename + '（ref: ' + ref + '）');
          break;
        } catch (err) {
          log(filename + ' 不可用：' + err.message);
        }
      }
    } finally {
      state.busy = false;
    }
  }

  function scheduleApply() {
    clearTimeout(state.timer);
    state.timer = setTimeout(apply, 250);
  }

  // GitHub 现在是 Turbo 导航，老版本用 pjax，两种都兼容
  document.addEventListener('turbo:load', scheduleApply);
  document.addEventListener('pjax:end', scheduleApply);
  window.addEventListener('popstate', scheduleApply);

  // README 区块可能是异步插入的，用 MutationObserver 兜底
  const observer = new MutationObserver(() => {
    const article = findReadmeArticle();
    if (article && article.dataset.zhApplied !== '1') scheduleApply();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scheduleApply();
})();
