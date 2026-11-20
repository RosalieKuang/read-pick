const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function load() {
  const { saved = [] } = await chrome.storage.local.get({ saved: [] });
  const list = $('list');
  if (!saved.length) {
    list.innerHTML = '<div class="empty">还没有收藏。读文章时点“挑词”，再点划线词收藏。</div>';
    return;
  }
  list.innerHTML = saved
    .slice()
    .reverse()
    .map(
      (w, ri) => `<div class="item">
        <div><span class="w">${esc(w.lemma || w.match)}</span><span class="meta">${esc(w.tier || '')} ${esc(w.register || '')}</span></div>
        <button class="del" data-i="${saved.length - 1 - ri}" title="删除">×</button>
      </div>`
    )
    .join('');
}

function toMarkdown(saved) {
  const date = new Date().toISOString().slice(0, 10);
  const tiers = ['active', 'passive', 'niche'];
  let md = `# 词表 ${date}\n\n`;
  for (const tier of tiers) {
    const items = saved.filter((w) => (tiers.includes(w.tier) ? w.tier : 'passive') === tier);
    if (!items.length) continue;
    md += `## ${tier}\n\n`;
    for (const w of items) {
      md += `### ${w.lemma || w.match} ${w.register || ''}\n`;
      if (w.sentence) md += `- 原句：${w.sentence}\n`;
      if (w.meaning) md += `- Meaning：${w.meaning}\n`;
      if (w.zh) md += `- 中文：${w.zh}\n`;
      if (w.collocation) md += `- 搭配：${w.collocation}\n`;
      if (w.example) md += `- 例句：${w.example}\n`;
      if (w.spoken_alt) md += `- 口语替身：${w.spoken_alt}\n`;
      if (w.trap) md += `- ⚠ 易读偏：${w.trap}\n`;
      if (w.source) md += `- 来源：[${w.source}](${w.url || ''})\n`;
      md += '\n';
    }
  }
  return md;
}

$('export').addEventListener('click', async () => {
  const { saved = [] } = await chrome.storage.local.get({ saved: [] });
  if (!saved.length) return;
  const blob = new Blob([toMarkdown(saved)], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vocab-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
});

$('clear').addEventListener('click', async () => {
  if (!confirm('清空所有收藏？建议先导出。')) return;
  await chrome.storage.local.set({ saved: [] });
  load();
});

$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('list').addEventListener('click', async (e) => {
  const b = e.target.closest('.del');
  if (!b) return;
  const { saved = [] } = await chrome.storage.local.get({ saved: [] });
  saved.splice(Number(b.dataset.i), 1);
  await chrome.storage.local.set({ saved });
  load();
});

load();
