(() => {
  if (window.__readPickLoaded) return;
  window.__readPickLoaded = true;

  const MIN_LEN = 60;
  let hoverBtn = null;
  let hoverTarget = null;
  let card = null;
  let panel = null;
  let words = [];
  let allShown = false;

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: '没有响应' });
        });
      } catch (e) {
        resolve({ ok: false, error: '插件刚更新过，请刷新页面' });
      }
    });
  }

  function qualifies(p) {
    if (!p || p.closest('.rp-ui, .rp-tr')) return false;
    if (p.isContentEditable || p.closest('[contenteditable="true"]')) return false;
    const t = (p.innerText || '').trim();
    if (t.length < MIN_LEN) return false;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    return letters / t.length > 0.5; // mostly English
  }

  function findParagraphs() {
    const roots = [...document.querySelectorAll('article, main, [role="main"]')];
    const scope = roots.length ? roots : [document.body];
    const set = new Set();
    for (const r of scope) {
      for (const p of r.querySelectorAll('p')) {
        if (p.offsetParent !== null && qualifies(p)) set.add(p);
      }
    }
    return [...set];
  }

  function prevParagraphText(p) {
    const ps = findParagraphs();
    const i = ps.indexOf(p);
    return i > 0 ? ps[i - 1].innerText.trim().slice(0, 1200) : '';
  }

  function toast(text, ms = 3500) {
    const t = document.createElement('div');
    t.className = 'rp-ui rp-toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------- paragraph translation ----------
  async function showTranslation(p) {
    let tr = p.nextElementSibling;
    if (tr && tr.classList.contains('rp-tr')) {
      if (tr.classList.contains('rp-err')) tr.remove();
      else {
        tr.hidden = false;
        return;
      }
    }
    tr = document.createElement('div');
    tr.className = 'rp-tr rp-loading';
    tr.textContent = '翻译中…';
    p.after(tr);
    const res = await send({ type: 'translate', text: p.innerText.trim(), prev: prevParagraphText(p), title: document.title });
    tr.classList.remove('rp-loading');
    if (res.ok) tr.textContent = res.text;
    else {
      tr.classList.add('rp-err');
      tr.textContent = '⚠ ' + res.error + '（再点一次“译”重试）';
    }
  }

  function toggleTranslation(p) {
    const tr = p.nextElementSibling;
    if (tr && tr.classList.contains('rp-tr') && !tr.hidden && !tr.classList.contains('rp-loading') && !tr.classList.contains('rp-err')) {
      tr.hidden = true;
      return;
    }
    if (tr && tr.classList.contains('rp-loading')) return;
    showTranslation(p);
  }

  async function toggleAll() {
    if (allShown) {
      document.querySelectorAll('.rp-tr').forEach((el) => (el.hidden = true));
      allShown = false;
      updatePanel();
      return;
    }
    allShown = true;
    updatePanel();
    const ps = findParagraphs();
    let i = 0;
    const worker = async () => {
      while (i < ps.length && allShown) await showTranslation(ps[i++]);
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  // hover button next to the paragraph
  function ensureHoverBtn() {
    if (hoverBtn) return hoverBtn;
    hoverBtn = document.createElement('button');
    hoverBtn.className = 'rp-ui rp-hover-btn';
    hoverBtn.textContent = '译';
    hoverBtn.title = '显示 / 隐藏这一段的中文';
    hoverBtn.addEventListener('mousedown', (e) => e.preventDefault());
    hoverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hoverTarget) toggleTranslation(hoverTarget);
    });
    document.body.appendChild(hoverBtn);
    return hoverBtn;
  }

  function placeHoverBtn(p) {
    const btn = ensureHoverBtn();
    hoverTarget = p;
    const r = p.getBoundingClientRect();
    let left = r.left + window.scrollX - 30;
    if (r.left < 34) left = r.right + window.scrollX + 6;
    btn.style.left = left + 'px';
    btn.style.top = r.top + window.scrollY + 2 + 'px';
    btn.style.display = 'block';
  }

  document.addEventListener(
    'mouseover',
    (e) => {
      const el = e.target;
      if (!(el instanceof Element) || el.closest('.rp-ui')) return;
      const p = el.closest('p');
      if (p && p !== hoverTarget && qualifies(p)) placeHoverBtn(p);
    },
    { passive: true }
  );

  // ---------- vocabulary ----------
  function clearHighlights() {
    document.querySelectorAll('.rp-hl').forEach((s) => s.replaceWith(document.createTextNode(s.textContent)));
    document.querySelectorAll('p').forEach((p) => p.normalize());
  }

  function highlight(ps, list) {
    clearHighlights();
    const byKey = new Map();
    list.forEach((w, i) => {
      const k = norm(w.match || w.lemma);
      if (k && !byKey.has(k)) byKey.set(k, i);
    });
    if (!byKey.size) return 0;
    const pattern = [...byKey.keys()]
      .sort((a, b) => b.length - a.length)
      .map((k) => reEsc(k).replace(/ /g, '\\s+'))
      .join('|');
    const re = new RegExp(`(?<![A-Za-z])(${pattern})(?![A-Za-z])`, 'gi');
    const done = new Set();
    let count = 0;

    for (const p of ps) {
      const nodes = [];
      const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.parentElement && n.parentElement.closest('.rp-hl, .rp-tr, .rp-ui, script, style')
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT
      });
      while (tw.nextNode()) nodes.push(tw.currentNode);

      for (const node of nodes) {
        const s = node.nodeValue;
        re.lastIndex = 0;
        let m;
        let last = 0;
        let changed = false;
        const frag = document.createDocumentFragment();
        while ((m = re.exec(s))) {
          const key = norm(m[1]);
          const idx = byKey.get(key);
          if (idx === undefined || done.has(key)) continue;
          done.add(key);
          frag.append(s.slice(last, m.index));
          const span = document.createElement('span');
          span.className = `rp-hl rp-${['active', 'passive', 'niche'].includes(list[idx].tier) ? list[idx].tier : 'passive'}`;
          span.dataset.rpIdx = String(idx);
          span.textContent = m[0];
          frag.append(span);
          last = m.index + m[0].length;
          changed = true;
          count++;
        }
        if (changed) {
          frag.append(s.slice(last));
          node.replaceWith(frag);
        }
      }
    }
    return count;
  }

  function sentenceAround(el, phrase) {
    const p = el.closest('p');
    if (!p) return '';
    const text = p.innerText.replace(/\s+/g, ' ').trim();
    const sentences = text.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g) || [text];
    const hit = sentences.find((s) => s.toLowerCase().includes(phrase.toLowerCase()));
    return (hit || '').trim();
  }

  async function pickWords() {
    const ps = findParagraphs();
    if (!ps.length) return toast('这页没找到英文正文段落');
    const text = ps.map((p) => p.innerText.trim()).join('\n\n').slice(0, 15000);
    setBusy('挑词中…');
    const res = await send({ type: 'vocab', text, title: document.title });
    setBusy('');
    if (!res.ok) return toast('⚠ ' + res.error, 6000);
    words = res.words || [];
    const n = highlight(ps, words);
    updatePanel(true);
    toast(`挑出 ${words.length} 个，页面里划线的有 ${n} 个。点划线词看卡片。`);
  }

  // ---------- word card ----------
  function closeCard() {
    if (card) card.remove();
    card = null;
  }

  async function isSaved(w) {
    const { saved = [] } = await chrome.storage.local.get({ saved: [] });
    return saved.some((x) => norm(x.lemma || x.match) === norm(w.lemma || w.match));
  }

  async function saveWord(w, anchor) {
    const { saved = [] } = await chrome.storage.local.get({ saved: [] });
    const key = norm(w.lemma || w.match);
    if (saved.some((x) => norm(x.lemma || x.match) === key)) return false;
    saved.push({
      ...w,
      sentence: anchor ? sentenceAround(anchor, anchor.textContent) : '',
      source: document.title,
      url: location.href,
      savedAt: new Date().toISOString()
    });
    await chrome.storage.local.set({ saved });
    return true;
  }

  async function openCard(w, anchor) {
    closeCard();
    card = document.createElement('div');
    card.className = 'rp-ui rp-card';
    const row = (label, val) => (val ? `<div class="rp-row"><b>${label}</b>${esc(val)}</div>` : '');
    card.innerHTML = `
      <div class="rp-card-head">
        <span class="rp-word">${esc(w.lemma || w.match)}</span>
        <span class="rp-tag rp-tag-${esc(w.tier)}">${esc(w.tier || '')}</span>
        <span class="rp-reg">${esc(w.register || '')}</span>
        <button class="rp-x" title="关闭">×</button>
      </div>
      ${row('Meaning', w.meaning)}
      ${row('中文', w.zh)}
      ${row('搭配', w.collocation)}
      ${row('例句', w.example)}
      ${row('口语替身', w.spoken_alt)}
      ${w.trap ? `<div class="rp-row rp-trap"><b>⚠ 易读偏</b>${esc(w.trap)}</div>` : ''}
      <button class="rp-save">收藏</button>`;
    document.body.appendChild(card);

    const saveBtn = card.querySelector('.rp-save');
    if (await isSaved(w)) {
      saveBtn.textContent = '已收藏';
      saveBtn.disabled = true;
    }
    saveBtn.addEventListener('click', async () => {
      await saveWord(w, anchor);
      saveBtn.textContent = '已收藏';
      saveBtn.disabled = true;
      updatePanel();
    });
    card.querySelector('.rp-x').addEventListener('click', closeCard);

    // position
    const r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth - 380, bottom: 80, top: 80 };
    const cw = 340;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - cw - 8);
    let top = r.bottom + 8;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    const ch = card.offsetHeight;
    if (top + ch > window.innerHeight - 8) card.style.top = Math.max(8, r.top - ch - 8) + 'px';
  }

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const hl = el.closest('.rp-hl');
    if (hl) {
      e.preventDefault();
      e.stopPropagation();
      const w = words[Number(hl.dataset.rpIdx)];
      if (w) openCard(w, hl);
      return;
    }
    if (card && !el.closest('.rp-card')) closeCard();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCard();
    // Option/Alt + Shift + A: translate or hide everything
    if (e.altKey && e.shiftKey && e.code === 'KeyA') {
      e.preventDefault();
      toggleAll();
    }
  });

  // ---------- floating panel ----------
  function setBusy(text) {
    if (!panel) return;
    const b = panel.querySelector('.rp-pick');
    b.disabled = !!text;
    b.textContent = text || '挑词';
  }

  async function updatePanel(openList = false) {
    if (!panel) return;
    panel.querySelector('.rp-all').textContent = allShown ? '收起中文' : '全文中文';
    const { saved = [] } = await chrome.storage.local.get({ saved: [] });
    panel.querySelector('.rp-count').textContent = `已收藏 ${saved.length}`;
    const list = panel.querySelector('.rp-list');
    if (!words.length) {
      list.hidden = true;
      return;
    }
    const groups = { active: [], passive: [], niche: [] };
    words.forEach((w, i) => (groups[w.tier] || groups.passive).push([w, i]));
    list.innerHTML = Object.entries(groups)
      .filter(([, arr]) => arr.length)
      .map(
        ([tier, arr]) =>
          `<div class="rp-group"><div class="rp-group-title">${tier}</div>` +
          arr.map(([w, i]) => `<div class="rp-item" data-i="${i}"><span>${esc(w.lemma || w.match)}</span><span class="rp-reg">${esc(w.register || '')}</span></div>`).join('') +
          `</div>`
      )
      .join('');
    if (openList) list.hidden = false;
    applyPanelPos();
  }

  // position + minimized state, remembered across pages
  let panelState = { side: 'right', top: null, min: false };
  let building = false;

  function applyPanelPos() {
    if (!panel) return;
    panel.classList.toggle('rp-min', !!panelState.min);
    panel.classList.toggle('rp-left', panelState.side === 'left');
    const h = panel.offsetHeight || 40;
    let top = panelState.top ?? window.innerHeight - h - 24;
    top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - h - 8));
    panel.style.top = top + 'px';
    panel.style.bottom = 'auto';
    if (panelState.side === 'left') {
      panel.style.left = '8px';
      panel.style.right = 'auto';
    } else {
      panel.style.right = '8px';
      panel.style.left = 'auto';
    }
  }

  function savePanelState() {
    chrome.storage.local.set({ panelState });
  }

  function setMin(min) {
    // keep the panel's vertical centre roughly in place when switching size
    const before = panel.getBoundingClientRect();
    panelState.min = min;
    applyPanelPos();
    const after = panel.getBoundingClientRect();
    panelState.top = before.top + before.height / 2 - after.height / 2;
    applyPanelPos();
    savePanelState();
  }

  // drag anywhere, then snap to the nearest side edge; a click without movement calls onClick
  function makeDraggable(handle, onClick) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.rp-nodrag')) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      handle.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        moved = true;
        panel.classList.add('rp-dragging');
        panel.style.right = 'auto';
        panel.style.left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - r.width) + 'px';
        panel.style.top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - r.height) + 'px';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        panel.classList.remove('rp-dragging');
        if (!moved) {
          if (onClick) onClick();
          return;
        }
        const r2 = panel.getBoundingClientRect();
        panelState.side = r2.left + r2.width / 2 > window.innerWidth / 2 ? 'right' : 'left';
        panelState.top = r2.top;
        applyPanelPos();
        savePanelState();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  async function buildPanel() {
    if (panel || building || findParagraphs().length < 3) return;
    building = true;
    const stored = await chrome.storage.local.get({ panelState: null });
    if (stored.panelState) panelState = { ...panelState, ...stored.panelState };
    panel = document.createElement('div');
    panel.className = 'rp-ui rp-panel';
    panel.innerHTML = `
      <div class="rp-bubble" title="Read &amp; Pick：点开；按住可拖动">词</div>
      <div class="rp-body">
        <div class="rp-head" title="按住拖动，松手自动贴边">
          <span class="rp-grip">⠿</span>
          <span class="rp-title">Read &amp; Pick</span>
          <button class="rp-min-btn rp-nodrag" title="最小化">–</button>
        </div>
        <div class="rp-bar">
          <button class="rp-pick">挑词</button>
          <button class="rp-all">全文中文</button>
          <button class="rp-toggle-list" title="本页词表">≡</button>
        </div>
        <div class="rp-list" hidden></div>
        <div class="rp-count"></div>
      </div>`;
    document.body.appendChild(panel);
    applyPanelPos();
    building = false;

    makeDraggable(panel.querySelector('.rp-head'));
    makeDraggable(panel.querySelector('.rp-bubble'), () => setMin(false));
    panel.querySelector('.rp-min-btn').addEventListener('click', () => setMin(true));
    window.addEventListener('resize', applyPanelPos);

    panel.querySelector('.rp-pick').addEventListener('click', pickWords);
    panel.querySelector('.rp-all').addEventListener('click', toggleAll);
    panel.querySelector('.rp-toggle-list').addEventListener('click', () => {
      const l = panel.querySelector('.rp-list');
      if (!words.length) return toast('先点“挑词”');
      l.hidden = !l.hidden;
      applyPanelPos();
    });
    panel.querySelector('.rp-list').addEventListener('click', (e) => {
      const item = e.target.closest('.rp-item');
      if (!item) return;
      const i = Number(item.dataset.i);
      const hl = document.querySelector(`.rp-hl[data-rp-idx="${i}"]`);
      if (hl) {
        hl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => openCard(words[i], hl), 350);
      } else openCard(words[i], null);
    });
    updatePanel();
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.saved) updatePanel();
  });

  buildPanel();
  // pages that load content late
  setTimeout(buildPanel, 2500);
})();
