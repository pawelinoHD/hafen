// KI-Assistent: leitet Chat-Anfragen an Ollama, eine OpenAI-kompatible API oder Claude weiter
// und streamt die Antwort als reinen Text zurück. Der API-Schlüssel verlässt den Server nie.

export const PROVIDERS = {
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434', needsKey: false },
  openai: { label: 'OpenAI-kompatibel', baseUrl: 'https://api.openai.com/v1', needsKey: true },
  anthropic: { label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com', needsKey: true },
};

const trimSlash = (u) => String(u || '').replace(/\/+$/, '');

// „fetch failed“ in etwas Verständliches übersetzen
export function explain(e, url) {
  const code = e.cause?.code || e.cause?.errors?.[0]?.code;
  if (e.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') return `keine Antwort von ${url} (Zeitüberschreitung)`;
  if (code === 'ECONNREFUSED') return `nicht erreichbar unter ${url} – läuft der Dienst dort?`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Adresse ${url} nicht gefunden`;
  if (e.message === 'fetch failed') return `keine Verbindung zu ${url}${code ? ` (${code})` : ''}`;
  return e.message;
}

function headers(cfg) {
  if (cfg.provider === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': cfg.apiKey || '', 'anthropic-version': '2023-06-01' };
  const h = { 'content-type': 'application/json' };
  if (cfg.apiKey) h.authorization = `Bearer ${cfg.apiKey}`;
  return h;
}

async function failText(res) {
  const t = await res.text().catch(() => '');
  try { const j = JSON.parse(t); return j.error?.message || j.error || j.message || t; } catch { return t.slice(0, 300); }
}

// Verfügbare Modelle des Anbieters
export async function listModels(cfg) {
  const base = trimSlash(cfg.baseUrl || PROVIDERS[cfg.provider]?.baseUrl);
  const url = cfg.provider === 'ollama' ? `${base}/api/tags` : cfg.provider === 'anthropic' ? `${base}/v1/models?limit=100` : `${base}/models`;
  const res = await fetch(url, { headers: headers(cfg), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status}: ${await failText(res)}`);
  const j = await res.json();
  const list = cfg.provider === 'ollama' ? (j.models || []).map((m) => m.name) : (j.data || []).map((m) => m.id);
  return list.sort((a, b) => a.localeCompare(b));
}

// Zeilen eines Streams einzeln liefern (NDJSON bei Ollama, SSE bei OpenAI/Claude)
async function* lines(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); }
  }
  if (buf.trim()) yield buf;
}

// Streamt die Antwort; onText bekommt jedes Textstück. signal bricht ab, wenn der Browser die Verbindung schließt.
export async function chat(cfg, system, messages, onText, signal) {
  const base = trimSlash(cfg.baseUrl || PROVIDERS[cfg.provider]?.baseUrl);
  if (!cfg.model) throw new Error('Kein Modell gewählt.');
  let url, body;
  if (cfg.provider === 'ollama') {
    url = `${base}/api/chat`;
    // think:false – Denk-Modelle (Qwen 3.x, Gemma 4 …) antworten sonst erst nach langer Überlegung
    body = { model: cfg.model, stream: true, think: !!cfg.think, messages: [{ role: 'system', content: system }, ...messages] };
  } else if (cfg.provider === 'anthropic') {
    url = `${base}/v1/messages`;
    body = { model: cfg.model, max_tokens: 2048, stream: true, system, messages };
  } else {
    url = `${base}/chat/completions`;
    body = { model: cfg.model, stream: true, messages: [{ role: 'system', content: system }, ...messages] };
  }
  const res = await fetch(url, { method: 'POST', headers: headers(cfg), body: JSON.stringify(body), signal });
  if (!res.ok) {
    let msg = await failText(res);
    // Ältere Ollama-Fassungen oder Modelle ohne Denkmodus lehnen „think“ ab – dann ohne erneut versuchen
    if (cfg.provider === 'ollama' && /think/i.test(msg)) {
      delete body.think;
      const again = await fetch(url, { method: 'POST', headers: headers(cfg), body: JSON.stringify(body), signal });
      if (again.ok) return pump(cfg, again, onText);
      msg = await failText(again);
    }
    throw new Error(`${res.status}: ${msg}`);
  }
  return pump(cfg, res, onText);
}

async function pump(cfg, res, onText) {
  for await (const line of lines(res.body)) {
    if (!line.trim()) continue;
    if (cfg.provider === 'ollama') {
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.message?.content) onText(j.message.content);
      continue;
    }
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') break;
    const j = JSON.parse(data);
    if (cfg.provider === 'anthropic') {
      if (j.type === 'error') throw new Error(j.error?.message || 'Fehler von Claude');
      if (j.type === 'content_block_delta' && j.delta?.text) onText(j.delta.text);
    } else {
      if (j.error) throw new Error(j.error.message || 'Fehler der API');
      const t = j.choices?.[0]?.delta?.content;
      if (t) onText(t);
    }
  }
}
