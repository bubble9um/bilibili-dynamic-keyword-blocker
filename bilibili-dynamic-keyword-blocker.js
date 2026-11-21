// ==UserScript==
// @name         B站动态关键字屏蔽器
// @namespace    https://github.com/bubble9um/bilibili-dynamic-keyword-blocker
// @version      1.2.4
// @description  根据自定义关键字屏蔽/隐藏 B 站动态页面内容。支持实时管理关键字、折叠模式（可手动显示并再次隐藏）、正则匹配、导入导出。兼容 BewlyBewly 改版页面。修复：首屏误把整个动态列表当成一条动态，导致整页被折叠成一条占位条。
// @author       SPARKGUM
// @homepageURL  https://github.com/bubble9um/bilibili-dynamic-keyword-blocker
// @supportURL   https://github.com/bubble9um/bilibili-dynamic-keyword-blocker/issues
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*/dynamic*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23fb7299'/%3E%3Cline x1='30' y1='30' x2='70' y2='70' stroke='white' stroke-width='8'/%3E%3C/svg%3E
// @updateURL    https://github.com/bubble9um/bilibili-dynamic-keyword-blocker/releases/latest/download/bilibili-dynamic-keyword-blocker.user.js
// @downloadURL  https://github.com/bubble9um/bilibili-dynamic-keyword-blocker/releases/latest/download/bilibili-dynamic-keyword-blocker.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__biliKeywordBlockerInited) return;
  window.__biliKeywordBlockerInited = true;

  // ===================== 配置与存储 =====================
  const STORAGE_KEY = 'biliDynBlocker.keywords';
  const SETTINGS_KEY = 'biliDynBlocker.settings';

  const DEFAULT_KEYWORDS = [];
  const DEFAULT_SETTINGS = { caseSensitive: false, useRegex: false, mode: 'hide' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function loadKeywords() {
    const v = GM_getValue(STORAGE_KEY);
    if (!v) { GM_setValue(STORAGE_KEY, JSON.stringify(DEFAULT_KEYWORDS)); return clone(DEFAULT_KEYWORDS); }
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : clone(DEFAULT_KEYWORDS); } catch (e) { return clone(DEFAULT_KEYWORDS); }
  }
  function saveKeywords(kws) { GM_setValue(STORAGE_KEY, JSON.stringify(kws)); }

  function loadSettings() {
    const v = GM_getValue(SETTINGS_KEY);
    if (!v) { GM_setValue(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS)); return clone(DEFAULT_SETTINGS); }
    try { return Object.assign(clone(DEFAULT_SETTINGS), JSON.parse(v)); } catch (e) { return clone(DEFAULT_SETTINGS); }
  }
  function saveSettings(s) { GM_setValue(SETTINGS_KEY, JSON.stringify(s)); }

  const state = {
    keywords: loadKeywords(),
    settings: loadSettings(),
  };

  // ===================== 样式 =====================
  // 注意：悬浮按钮 bottom: 190px（原 90px，整体上移 100px），面板同步上移
  GM_addStyle(`
    .bili-blocker-fab {
      position: fixed; right: 20px; bottom: 190px; z-index: 2147483640;
      width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
      background: #fb7299; color: #fff; font-size: 22px; line-height: 48px; text-align: center;
      box-shadow: 0 4px 14px rgba(251,114,153,.5);
    }
    .bili-blocker-fab:hover { background: #fc8bab; }
    .bili-blocker-panel {
      position: fixed; right: 20px; bottom: 250px; z-index: 2147483640;
      width: 320px; max-height: 72vh; overflow: auto; box-sizing: border-box;
      background: #fff; color: #222; border-radius: 12px; padding: 14px;
      box-shadow: 0 10px 34px rgba(0,0,0,.28);
      font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .bili-blocker-panel.hidden { display: none; }
    .bili-blocker-panel h3 { margin: 0 0 4px; font-size: 15px; color: #fb7299; }
    .bili-blocker-panel .sub { color: #999; font-size: 12px; margin-bottom: 10px; }
    .bili-blocker-row { display: flex; gap: 6px; margin-bottom: 10px; }
    .bili-blocker-row input[type=text] {
      flex: 1; padding: 6px 8px; border: 1px solid #e3e3e3; border-radius: 6px; font-size: 13px; outline: none;
    }
    .bili-blocker-row input[type=text]:focus { border-color: #fb7299; }
    .bili-blocker-btn {
      border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;
      background: #fb7299; color: #fff; white-space: nowrap;
    }
    .bili-blocker-btn.ghost { background: #f2f2f2; color: #555; }
    .bili-blocker-btn:hover { filter: brightness(1.05); }
    .bili-blocker-list { list-style: none; margin: 0 0 10px; padding: 0; max-height: 200px; overflow: auto; }
    .bili-blocker-list li {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; background: #fafafa; margin-bottom: 6px;
    }
    .bili-blocker-list .kw { flex: 1; word-break: break-all; }
    .bili-blocker-list .tag { font-size: 11px; color: #999; }
    .bili-blocker-list .mini { border: none; background: none; cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 4px; }
    .bili-blocker-list .mini.del:hover { color: #e74c3c; }
    .bili-blocker-list .mini.toggle { color: #999; }
    .bili-blocker-list .mini.toggle.on { color: #2ecc71; }
    .bili-blocker-set { border-top: 1px solid #eee; padding-top: 10px; margin-bottom: 10px; }
    .bili-blocker-set label { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer; }
    .bili-blocker-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .bili-blocker-count { color: #fb7299; font-weight: bold; }

    /* 完全隐藏：用 class + !important，避免被 Vue/BewlyBewly 重新渲染时覆盖 */
    .bili-blocker-hidden { display: none !important; }
    /* 折叠模式：CSS 隐藏所有直接子元素（占位条除外），子内容被框架重绘也依然有效 */
    .bili-blocker-collapsed > *:not(.bili-blocker-ph) { display: none !important; }
    .bili-blocker-collapsed > .bili-blocker-ph { display: flex !important; }

    .bili-blocker-ph {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 12px 16px; margin: 8px; background: #fff3f6;
      border: 1px dashed #fb7299; border-radius: 8px; color: #fb7299; font-size: 13px;
    }
    .bili-blocker-ph button {
      border: 1px solid #fb7299; background: #fff; color: #fb7299;
      border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; white-space: nowrap;
    }
    /* 手动点「显示」后的细条：保留在卡片顶部，随时可以再点「重新隐藏」 */
    .bili-blocker-ph.revealed {
      padding: 7px 14px; margin: 6px 8px;
      background: #f6f6f8; border: 1px dashed #c9c9d1; border-radius: 8px;
      color: #90909c; font-size: 12px;
    }
    .bili-blocker-ph.revealed button {
      border-color: #c9c9d1; color: #90909c; padding: 3px 9px;
    }
    .bili-blocker-ph.revealed button:hover {
      border-color: #fb7299; color: #fb7299; background: #fff;
    }
  `);

  // ===================== 匹配逻辑 =====================
  function matchKeyword(text) {
    const kws = state.keywords;
    const s = state.settings;
    for (const kw of kws) {
      if (!kw.enabled || !kw.text) continue;
      if (s.useRegex) {
        try {
          const re = new RegExp(kw.text, s.caseSensitive ? '' : 'i');
          if (re.test(text)) return kw.text;
        } catch (e) { /* 无效正则忽略 */ }
      } else {
        const t = s.caseSensitive ? text : text.toLowerCase();
        const k = s.caseSensitive ? kw.text : kw.text.toLowerCase();
        if (t.includes(k)) return kw.text;
      }
    }
    return null;
  }

  // ===================== 卡片识别（关键修复点） =====================
  // 旧版用了 [class*="bili-dyn-list__item"]，它会把「列表容器」.bili-dyn-list__items
  // 也当成一条动态（因为 "items" 前缀包含 "item"），于是整个列表被隐藏/折叠 => 页面空白。
  // 这里全部改用「精确 class 」匹配，并额外排除掉包含其它卡片的容器元素。

  // 精确类名（CSS 类选择器天然按完整 token 匹配，不会误伤 bili-dyn-list__items）
  const CARD_SELECTOR = [
    '.bili-dyn-list__item',
    '.bili-dyn-item',
    '.bili-dyn-card',
    '.bili-dyn-card__item',
    '.dyn-item',
    '.dyn-card',
  ].join(', ');

  // 正文标记：用于在改版页面（如 BewlyBewly）里反推出真正的卡片节点
  const MARKER_SELECTOR = [
    '.bili-dyn-content',
    '[class*="dyn-content"]',
    '.bili-dyn-item__main',
    '.bili-rich-text-module',
  ].join(', ');

  function isRootish(el) {
    return !el || el === document.body || el === document.documentElement;
  }

  // 从链接里取动态 ID（t.bilibili.com/123 / /opus/123 / /dynamic/123）
  function linkDynId(href) {
    if (!href) return '';
    let m = href.match(/\/(?:opus|dynamic)\/(\d{6,})/);
    if (m) return m[1];
    m = href.match(/t\.bilibili\.com\/(\d{6,})/);
    return m ? m[1] : '';
  }

  // 这块区域里出现了几条「不同」的动态？
  // 单条动态最多 1 条（转发卡片里引用的原动态链接不算），>=2 就说明它是列表 / 包裹层。
  // 每轮扫描会重复问到同一些祖先节点，用一个 pass 级别的缓存挡掉重复遍历。
  let idCache = new WeakMap();
  function distinctDynIds(el) {
    const cached = idCache.get(el);
    if (cached !== undefined) return cached;
    const ids = new Set();
    for (const a of el.querySelectorAll('a[href]')) {
      // 转发卡片里会带被转发动态的链接，不能算数
      if (a.closest('[class*="forward"], [class*="Forward"], [class*="quote"], [class*="Quote"], blockquote')) continue;
      const id = linkDynId(a.getAttribute('href') || '');
      if (!id) continue;
      ids.add(id);
      if (ids.size >= 2) break;
    }
    const n = ids.size;
    idCache.set(el, n);
    return n;
  }

  // 从「正文节点」向上爬，找到那一层「父级里至少还有 1 个同样含正文的兄弟」的元素，
  // 也就是列表中的一条动态卡片（而不是整个列表容器）。
  function discoverByMarker(sel) {
    const marks = document.querySelectorAll(sel);
    const cards = new Set();
    marks.forEach(function (m) {
      let el = m;
      let guard = 0;
      while (!isRootish(el) && guard++ < 24) {
        const parent = el.parentElement;
        if (isRootish(parent)) break;
        // 父级里已经装了「另一条动态」→ 说明 el 已经是单条动态了，再往上就是列表容器
        if (distinctDynIds(parent) >= 2) break;
        let sibWithMarker = 0;
        let selfIsSib = false;
        for (const c of parent.children) {
          if (typeof c.querySelector !== 'function') continue;
          if (c.contains(m) || c.querySelector(sel)) {
            sibWithMarker++;
            if (c === el) selfIsSib = true;
          }
        }
        if (sibWithMarker >= 2 && selfIsSib) break; // el 就是列表中的一项
        el = parent;
      }
      if (!isRootish(el)) cards.add(el);
    });
    return Array.from(cards);
  }

  // 去重 + 只保留最外层（嵌套命中如 .bili-dyn-list__item 里还有 .bili-dyn-item）
  function outermost(list) {
    const uniq = [];
    for (const el of list) if (!uniq.includes(el)) uniq.push(el);
    return uniq.filter(el => !uniq.some(o => o !== el && o.contains(el)));
  }

  const isPanel = el => el.classList && el.classList.contains('bili-blocker-panel');

  // 被确认过是「列表容器 / 包裹层」的元素，本页内不再把它当卡片（否则会反复误折叠）
  const containerSkip = new WeakSet();

  function findCards() {
    const byClass = Array.from(document.querySelectorAll(CARD_SELECTOR))
      .filter(el => !isRootish(el) && !isPanel(el) && !containerSkip.has(el));

    // ① class 命中是权威信号：只要它没装下「两条不同的动态」，就是一张卡片
    if (byClass.length) {
      const kept = byClass.filter(el => distinctDynIds(el) < 2);
      return outermost(kept.length ? kept : byClass);
    }

    // ② 没有可用的 class（BewlyBewly 等改版 / B站换结构）→ 从正文反推。
    //    但首屏可能只渲染了 0~1 条动态，这时「卡片」和「列表容器」长得一模一样，
    //    硬判就会把整个 feed 包裹层当成一条动态 → 全屏占位条 + 白页。
    //    所以：页面上正文块不足 2 个时，直接不判定，等渲染出来再说。
    if (document.querySelectorAll(MARKER_SELECTOR).length < 2) return [];

    let byMarker = discoverByMarker(MARKER_SELECTOR).filter(el => !isRootish(el) && !isPanel(el) && !containerSkip.has(el));

    // 兜底：连正文块都没有时，用「空间主页链接」反推
    if (!byMarker.length) {
      byMarker = discoverByMarker('a[href*="space.bilibili.com"]')
        .filter(el => !isRootish(el) && !isPanel(el) && !containerSkip.has(el));
    }

    // 容器否决：装了两条以上不同动态、或含 2 个以上正文块 → 是列表/包裹层，不是卡片
    const safe = byMarker.filter(el => distinctDynIds(el) < 2 && el.querySelectorAll(MARKER_SELECTOR).length < 2);

    // 全被判成容器说明这一层确实只是包裹层，宁可这次不屏蔽，也绝不能整页折叠
    return outermost(safe);
  }

  // ===================== 屏蔽处理 =====================
  // 卡片上次被判定时的快照（动态 ID + 文本），用来识别「同一条动态内容变化」与「换了另一条动态」
  const cardSnap = new WeakMap();
  // 本次会话内点过「显示」的动态 ID → 命中的关键字；刷新页面即清空
  const allowMap = new Map();

  function resetCard(card) {
    card.classList.remove('bili-blocker-hidden', 'bili-blocker-collapsed');
    delete card.dataset.biliBlocked;
    delete card.dataset.biliClean;
    delete card.dataset.biliKw;
    card.querySelectorAll('.bili-blocker-ph').forEach(p => p.remove());
  }

  // 占位条在「已屏蔽」和「已手动显示」两种状态间复用：
  // 屏蔽态 = 粉色 + 「显示」按钮；显示态 = 灰色细条 + 「重新隐藏」按钮
  function setPlaceholder(card, revealed) {
    const kw = card.dataset.biliKw || '';
    let ph = card.querySelector(':scope > .bili-blocker-ph');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'bili-blocker-ph';
      const label = document.createElement('span');
      label.className = 'ph-label';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ph-btn';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (card.dataset.biliBlocked) revealCard(card);
        else hideCard(card);
      });
      ph.appendChild(label);
      ph.appendChild(btn);
      card.insertBefore(ph, card.firstChild);
    }
    ph.classList.toggle('revealed', !!revealed);
    ph.querySelector('.ph-label').textContent = revealed
      ? '👁 已手动显示含「' + kw + '」的动态'
      : '🚫 已屏蔽含「' + kw + '」的动态';
    ph.querySelector('.ph-btn').textContent = revealed ? '重新隐藏' : '显示';
    return ph;
  }

  function blockCard(card, kw) {
    card.dataset.biliKw = kw;
    card.dataset.biliBlocked = kw;
    delete card.dataset.biliAllow;
    if (state.settings.mode === 'collapse') {
      card.classList.add('bili-blocker-collapsed');
      setPlaceholder(card, false);
    } else {
      card.classList.add('bili-blocker-hidden');
    }
  }

  // 点「显示」：展开动态，但保留一条灰色细条，方便再次隐藏
  function revealCard(card) {
    card.classList.remove('bili-blocker-collapsed', 'bili-blocker-hidden');
    delete card.dataset.biliBlocked;
    card.dataset.biliAllow = '1';
    const id = cardId(card);
    if (id) allowMap.set(id, card.dataset.biliKw || '');
    if (state.settings.mode === 'collapse') setPlaceholder(card, true);
    updateCount();
  }

  // 点「重新隐藏」：再次折叠该条动态
  function hideCard(card) {
    if (!card.dataset.biliKw) return;
    delete card.dataset.biliAllow;
    const id = cardId(card);
    if (id) allowMap.delete(id);
    blockCard(card, card.dataset.biliKw);
    updateCount();
  }

  // 取动态 ID：优先用「发布时间」链接（t.bilibili.com/123 / /opus/123），
  // 用它来区分「同一条动态内容变了」和「虚拟列表把这个 DOM 节点换成了另一条动态」
  function cardId(card) {
    const timeLink = card.querySelector(
      '.bili-dyn-time a[href], [class*="dyn-time"] a[href], [class*="time"] a[href]'
    );
    if (timeLink) {
      const id = linkDynId(timeLink.getAttribute('href') || '');
      if (id) return id;
    }
    for (const a of card.querySelectorAll('a[href]')) {
      if (a.closest('[class*="forward"], [class*="quote"], blockquote')) continue;
      const id = linkDynId(a.getAttribute('href') || '');
      if (id) return id;
    }
    return '';
  }

  // 取卡片文本：排除自己插入的占位条，避免「占位条文字 → 内容指纹变化 → 反复重判」的抖动
  function cardText(card) {
    let s = '';
    for (const node of card.childNodes) {
      if (node.nodeType === 1 && node.classList && node.classList.contains('bili-blocker-ph')) continue;
      s += node.textContent || '';
    }
    return s.trim();
  }

  function sig(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return text.length + ':' + h;
  }

  function processAll(force) {
    if (!document.body) return 0;
    idCache = new WeakMap();   // DOM 可能变了，本轮的 ID 统计重新算

    // 误判回收：已经被折叠/隐藏、但内部其实是「两条以上不同动态」的元素，说明它是列表容器，
    // 不是某一条动态 —— 立刻撤回，别让它一直把整页挡住（刷新/点「显示」才能恢复的元凶）
    document.querySelectorAll('.bili-blocker-collapsed, .bili-blocker-hidden').forEach(el => {
      if (distinctDynIds(el) < 2) return;
      containerSkip.add(el);   // 记下来，本页内不再把它当卡片
      resetCard(el);
      delete el.dataset.biliClean;
      delete el.dataset.biliAllow;
      delete el.dataset.biliSig;
      cardSnap.delete(el);
      console.warn('[B站动态关键字屏蔽器] 检测到被误折叠的列表容器，已自动恢复');
    });

    const cards = findCards();
    for (const card of cards) {
      const text = cardText(card);
      const s = sig(text);
      const id = cardId(card);

      // 内容还没渲染出来 / 被临时清空的先不判定，保持现状，等下一轮
      if (!text) continue;

      // ① 本次会话内被手动「显示」过的动态：一直保持展开。
      //    只有点「重新隐藏」或刷新页面才会失效（评论加载、展开全文、点任何地方都不影响）。
      const prev = cardSnap.get(card);
      // 同一个 DOM 节点被虚拟列表拿去显示另一条动态了（ID 变了）→ 元素上残留的展开标记作废
      const idChanged = !!(id && prev && prev.id && id !== prev.id);
      let allowKw;
      if (card.dataset.biliAllow === '1') {
        allowKw = (idChanged && !(id && allowMap.has(id)))
          ? undefined
          : (card.dataset.biliKw || '');
      } else {
        allowKw = (id && allowMap.has(id)) ? allowMap.get(id) : undefined;
      }

      if (!force && allowKw !== undefined) {
        card.dataset.biliKw = allowKw;
        card.dataset.biliAllow = '1';
        delete card.dataset.biliBlocked;
        card.classList.remove('bili-blocker-collapsed', 'bili-blocker-hidden');
        if (state.settings.mode === 'collapse' && !card.querySelector(':scope > .bili-blocker-ph')) {
          setPlaceholder(card, true);
        }
        card.dataset.biliSig = s;
        cardSnap.set(card, { id: id, text: text });
        continue;
      }

      // ② 已经判定过，且还是同一条动态（只是内容变多/变少，比如评论区加载）
      //    → 保持原判，不重新判定，避免「点评论就缩回去」
      const judged = card.dataset.biliBlocked || card.dataset.biliClean;
      if (!force && judged && prev) {
        const sameId = (id && prev.id) ? id === prev.id : null;
        // 注意：两边都必须有文本才比较前缀，否则空字符串会「匹配一切」，把误判永久锁死
        const sameText = !!(prev.text && text) && (text === prev.text
          || text.startsWith(prev.text) || prev.text.startsWith(text));
        if (sameText || sameId === true) {
          // 屏蔽态下若框架重绘把占位条丢了，补回来
          if (card.dataset.biliBlocked && state.settings.mode === 'collapse'
            && !card.querySelector(':scope > .bili-blocker-ph')) {
            setPlaceholder(card, false);
          }
          card.dataset.biliSig = s;
          cardSnap.set(card, { id: id, text: text });
          continue;
        }
      }

      // ③ 新出现的动态 / 这个节点被复用来显示另一条动态：重新判定
      resetCard(card);
      delete card.dataset.biliAllow;
      card.dataset.biliSig = s;
      cardSnap.set(card, { id: id, text: text });

      const hit = matchKeyword(text);
      if (hit) {
        blockCard(card, hit);
      } else {
        card.dataset.biliClean = '1';
      }
    }
    updateCount();
    return cards.length;
  }

  function rescan() {
    allowMap.clear();
    document.querySelectorAll('[data-bili-blocked],[data-bili-clean],[data-bili-allow],[data-bili-kw],[data-bili-sig]').forEach(el => {
      resetCard(el);
      delete el.dataset.biliClean;
      delete el.dataset.biliAllow;
      delete el.dataset.biliSig;
    });
    return processAll(true);
  }

  // ===================== 面板 UI =====================
  let countEl = null;

  function updateCount() {
    if (!countEl) return;
    countEl.textContent = String(document.querySelectorAll('[data-bili-blocked]').length);
  }

  function renderList(listEl) {
    listEl.innerHTML = '';
    if (state.keywords.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'kw';
      empty.style.color = '#999';
      empty.textContent = '（暂无关键字，在上方输入添加）';
      listEl.appendChild(empty);
      return;
    }
    state.keywords.forEach((kw, i) => {
      const li = document.createElement('li');

      const toggle = document.createElement('button');
      toggle.className = 'mini toggle' + (kw.enabled ? ' on' : '');
      toggle.textContent = kw.enabled ? '✓' : '✕';
      toggle.title = kw.enabled ? '已启用，点击禁用' : '已禁用，点击启用';
      toggle.addEventListener('click', () => {
        state.keywords[i].enabled = !state.keywords[i].enabled;
        saveKeywords(state.keywords);
        renderList(listEl);
        rescan();
      });

      const span = document.createElement('span');
      span.className = 'kw';
      span.textContent = kw.text;

      const del = document.createElement('button');
      del.className = 'mini del';
      del.textContent = '🗑';
      del.title = '删除';
      del.addEventListener('click', () => {
        state.keywords.splice(i, 1);
        saveKeywords(state.keywords);
        renderList(listEl);
        rescan();
      });

      li.appendChild(toggle);
      li.appendChild(span);
      li.appendChild(del);
      listEl.appendChild(li);
    });
  }

  function buildUI() {
    const fab = document.createElement('button');
    fab.className = 'bili-blocker-fab';
    fab.textContent = '🚫';
    fab.title = 'B站动态关键字屏蔽器';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'bili-blocker-panel hidden';
    panel.innerHTML = `
      <h3>B站动态关键字屏蔽器</h3>
      <div class="sub">本页已屏蔽 <span class="bili-blocker-count">0</span> 条 · 支持实时增删</div>
      <div class="bili-blocker-row">
        <input type="text" class="kw-input" placeholder="输入关键字，如：LOL" />
        <button class="bili-blocker-btn add-btn">添加</button>
      </div>
      <ul class="bili-blocker-list"></ul>
      <div class="bili-blocker-set">
        <label><input type="checkbox" class="opt-case" /> 区分大小写</label>
        <label><input type="checkbox" class="opt-regex" /> 把关键字当作正则表达式</label>
        <label>
          隐藏方式：
          <select class="opt-mode">
            <option value="hide">完全隐藏</option>
            <option value="collapse">折叠为占位条</option>
          </select>
        </label>
      </div>
      <div class="bili-blocker-actions">
        <button class="bili-blocker-btn ghost act-rescan">重新扫描</button>
        <button class="bili-blocker-btn ghost act-export">导出</button>
        <button class="bili-blocker-btn ghost act-import">导入</button>
      </div>
    `;
    document.body.appendChild(panel);

    countEl = panel.querySelector('.bili-blocker-count');
    const listEl = panel.querySelector('.bili-blocker-list');
    const input = panel.querySelector('.kw-input');

    fab.addEventListener('click', () => panel.classList.toggle('hidden'));

    const optCase = panel.querySelector('.opt-case');
    const optRegex = panel.querySelector('.opt-regex');
    const optMode = panel.querySelector('.opt-mode');
    optCase.checked = state.settings.caseSensitive;
    optRegex.checked = state.settings.useRegex;
    optMode.value = state.settings.mode;

    function addKeyword() {
      const text = (input.value || '').trim();
      if (!text) return;
      if (state.keywords.some(k => k.text.toLowerCase() === text.toLowerCase())) {
        input.value = ''; return;
      }
      state.keywords.push({ text: text, enabled: true });
      saveKeywords(state.keywords);
      renderList(listEl);
      input.value = '';
      rescan();
    }

    panel.querySelector('.add-btn').addEventListener('click', addKeyword);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });

    optCase.addEventListener('change', () => { state.settings.caseSensitive = optCase.checked; saveSettings(state.settings); rescan(); });
    optRegex.addEventListener('change', () => { state.settings.useRegex = optRegex.checked; saveSettings(state.settings); rescan(); });
    optMode.addEventListener('change', () => { state.settings.mode = optMode.value; saveSettings(state.settings); rescan(); });

    panel.querySelector('.act-rescan').addEventListener('click', () => rescan());
    panel.querySelector('.act-export').addEventListener('click', () => {
      const data = JSON.stringify({ keywords: state.keywords, settings: state.settings }, null, 2);
      prompt('复制下面的配置进行备份：', data);
    });
    panel.querySelector('.act-import').addEventListener('click', () => {
      const raw = prompt('粘贴之前导出的配置（JSON）：', '');
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.keywords)) state.keywords = data.keywords;
        if (data.settings) state.settings = Object.assign(loadSettings(), data.settings);
        saveKeywords(state.keywords);
        saveSettings(state.settings);
        optCase.checked = state.settings.caseSensitive;
        optRegex.checked = state.settings.useRegex;
        optMode.value = state.settings.mode;
        renderList(listEl);
        rescan();
      } catch (e) { alert('导入失败：不是合法的 JSON'); }
    });

    renderList(listEl);
  }

  // ===================== 启动 =====================
  function init() {
    buildUI();
    const n = processAll(true);
    console.log('[B站动态关键字屏蔽器] 已启动，识别到 ' + (n || 0) + ' 条动态卡片');

    // 无限滚动 / Vue 重绘时持续过滤
    let timer = null;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; processAll(false); }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // BewlyBewly 等改版页面 feed 渲染较晚，补几次扫描
    [800, 2000, 5000].forEach(ms => setTimeout(() => processAll(false), ms));
  }

  // 调试用：控制台执行 __biliBlocker.debug() 可查看当前识别到的卡片
  window.__biliBlocker = {
    state: state,
    rescan: rescan,
    findCards: findCards,
    debug: function () {
      const cards = findCards();
      console.log('识别到的动态卡片数量：', cards.length);
      if (!cards.length) {
        console.log('（0 条说明结构还没就绪，或 class 变了。页面正文块数量 = ' +
          document.querySelectorAll(MARKER_SELECTOR).length + '，<2 时脚本会主动跳过判定）');
      }
      console.log(cards.slice(0, 12).map(c => ({
        class: String(c.className).slice(0, 80),
        动态数: distinctDynIds(c),
        正文块: c.querySelectorAll(MARKER_SELECTOR).length,
        状态: c.dataset.biliBlocked ? '已屏蔽' : (c.dataset.biliAllow ? '已手动显示' : '正常'),
        文本: (c.textContent || '').trim().slice(0, 50),
      })));
      return cards;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
