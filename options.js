const DEFAULT_PROFILE =
  'Chinese-native English learner at around B2 to C1 level. Understands much more than they can actively use, ' +
  'and wants to turn passive vocabulary into words they can use in speaking and writing. ' +
  'Write example sentences about everyday life: work, study, travel, food and hobbies.';

const DEFAULTS = { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', profile: DEFAULT_PROFILE };
const PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
};
const fields = ['baseUrl', 'apiKey', 'model', 'profile'];
const $ = (id) => document.getElementById(id);
const status = (t) => ($('status').textContent = t);

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);
  fields.forEach((f) => ($(f).value = s[f] || ''));
}

async function save() {
  const s = {};
  fields.forEach((f) => (s[f] = $(f).value.trim()));
  if (!s.profile) s.profile = DEFAULT_PROFILE;
  await chrome.storage.local.set(s);
  status('已保存');
}

document.querySelectorAll('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    $('baseUrl').value = p.baseUrl;
    $('model').value = p.model;
    status('记得填 key 再保存');
  })
);

$('save').addEventListener('click', save);
$('test').addEventListener('click', async () => {
  await save();
  status('测试中…');
  chrome.runtime.sendMessage({ type: 'test' }, (res) => {
    if (chrome.runtime.lastError) return status('⚠ ' + chrome.runtime.lastError.message);
    status(res?.ok ? `连上了，模型回复：${res.text.slice(0, 40)}` : '⚠ ' + (res?.error || '失败'));
  });
});

load();
