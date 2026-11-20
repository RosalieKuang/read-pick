// Calls your own OpenAI-compatible API. The key never leaves your browser except to the base URL you set.

const DEFAULT_PROFILE =
  'Chinese-native English learner at around B2 to C1 level. Understands much more than they can actively use, ' +
  'and wants to turn passive vocabulary into words they can use in speaking and writing. ' +
  'Write example sentences about everyday life: work, study, travel, food and hobbies.';

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  profile: DEFAULT_PROFILE
};

async function getSettings() {
  return chrome.storage.local.get(DEFAULTS);
}

function endpoint(baseUrl) {
  const u = (baseUrl || '').trim().replace(/\/+$/, '');
  return u.endsWith('/chat/completions') ? u : u + '/chat/completions';
}

async function post(url, apiKey, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
}

async function chat(messages, { json = false, temperature = 0.3 } = {}) {
  const { baseUrl, apiKey, model } = await getSettings();
  if (!apiKey) throw new Error('还没填 API key：点工具栏的插件图标，进“设置”');
  const url = endpoint(baseUrl);
  const body = { model, messages, temperature };
  if (json) body.response_format = { type: 'json_object' };

  let res = await post(url, apiKey, body);
  // Some providers reject response_format; retry without it.
  if (!res.ok && json && res.status === 400) {
    delete body.response_format;
    res = await post(url, apiKey, body);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function parseJSON(s) {
  s = String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  return JSON.parse(s.slice(i, j + 1));
}

async function translate({ text, prev, title }) {
  const system =
    'You translate English into natural Simplified Chinese for an advanced learner reading quality journalism. ' +
    'Use the article title and context to resolve ambiguous words (for example, "chips" in a tech-policy article means 芯片, not 薯片). ' +
    'Use standard Chinese names for people and places. Output only the Chinese translation of the target paragraph.';
  const user =
    `Article title: ${title || '(unknown)'}\n\n` +
    (prev ? `Previous paragraph, for context only, do not translate:\n${prev}\n\n` : '') +
    `Paragraph to translate:\n${text}`;
  return (await chat([{ role: 'system', content: system }, { role: 'user', content: user }])).trim();
}

async function vocab({ text, title }) {
  const { profile } = await getSettings();
  const system = `You pick vocabulary from an English article for one specific learner. Return JSON only.

Learner: ${profile || DEFAULT_PROFILE}

Rules:
- Pick 12 to 20 items worth learning at C1 level. Skip basic words a C1 reader already uses.
- Prefer reusable items: phrasal verbs, collocations, idioms, precise verbs and adjectives. Proper nouns only when their meaning is not obvious.
- "match": the item exactly as it appears in the text (same inflection and spelling), so it can be found on the page.
- "lemma": dictionary form.
- "tier": "active" (worth using in speaking or writing), "passive" (recognise only), or "niche" (jargon or proper noun, just understand).
- "register": exactly one of "🗣" (fine in speech), "✍️" (writing only, avoid in speech), "👀" (recognise only), "🗣✍️" (both), "🗣👀" (slang: can say it, but recognise first).
- "meaning": a short English explanation of the meaning IN THIS ARTICLE, including tone and when people use it.
- "zh": one natural Chinese equivalent for this context.
- "collocation": one common collocation pattern.
- "example": one natural sentence the learner could memorise whole and reuse, ideally connected to the learner's own life as described above.
- "spoken_alt": if register is "✍️" or "👀", a more casual spoken alternative; otherwise "".
- "trap": if the word is polysemous, a false friend, slang, or easy to misread here, say so briefly; otherwise "".

Return: {"words":[{"match":"","lemma":"","tier":"","register":"","meaning":"","zh":"","collocation":"","example":"","spoken_alt":"","trap":""}]}`;
  const user = `Article title: ${title || '(unknown)'}\n\nArticle text:\n${text}`;
  const out = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { json: true, temperature: 0.2 });
  const parsed = parseJSON(out);
  return Array.isArray(parsed.words) ? parsed.words : [];
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'translate') sendResponse({ ok: true, text: await translate(msg) });
      else if (msg.type === 'vocab') sendResponse({ ok: true, words: await vocab(msg) });
      else if (msg.type === 'test') sendResponse({ ok: true, text: await chat([{ role: 'user', content: 'Reply with the single word OK.' }], { temperature: 0 }) });
      else sendResponse({ ok: false, error: 'unknown message' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
