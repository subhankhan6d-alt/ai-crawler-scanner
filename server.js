const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Major AI crawlers as of mid-2026. Update this list periodically —
// new bots get added and existing ones sometimes rename.
const AI_BOTS = [
  { name: 'GPTBot', vendor: 'OpenAI', role: 'training' },
  { name: 'OAI-SearchBot', vendor: 'OpenAI', role: 'answer-citing' },
  { name: 'ChatGPT-User', vendor: 'OpenAI', role: 'answer-citing' },
  { name: 'ClaudeBot', vendor: 'Anthropic', role: 'training' },
  { name: 'Claude-User', vendor: 'Anthropic', role: 'answer-citing' },
  { name: 'Claude-SearchBot', vendor: 'Anthropic', role: 'answer-citing' },
  { name: 'anthropic-ai', vendor: 'Anthropic', role: 'training' },
  { name: 'PerplexityBot', vendor: 'Perplexity', role: 'both' },
  { name: 'Perplexity-User', vendor: 'Perplexity', role: 'answer-citing' },
  { name: 'Google-Extended', vendor: 'Google', role: 'training' },
  { name: 'GoogleOther', vendor: 'Google', role: 'both' },
  { name: 'Applebot-Extended', vendor: 'Apple', role: 'training' },
  { name: 'CCBot', vendor: 'Common Crawl', role: 'training' },
  { name: 'Bytespider', vendor: 'ByteDance', role: 'training' },
  { name: 'Amazonbot', vendor: 'Amazon', role: 'both' }
];

const FETCH_TIMEOUT_MS = 8000;
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min — this data changes rarely

function cleanDomain(raw) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BatchGEOScanner/1.0 (+https://example.com)' },
      redirect: 'follow'
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Minimal robots.txt parser. Good enough for the common case: per-user-agent
// blocks with Allow/Disallow lines. Not a full spec implementation.
function parseRobots(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const blocks = []; // { agents: [...], rules: [{type, path}] }
  let current = null;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [value.toLowerCase()], rules: [] };
        blocks.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (key === 'disallow' && current) {
      current.rules.push({ type: 'disallow', path: value });
    } else if (key === 'allow' && current) {
      current.rules.push({ type: 'allow', path: value });
    }
  }
  return blocks;
}

function isBotBlocked(blocks, botName) {
  const lower = botName.toLowerCase();
  const specific = blocks.find((b) => b.agents.includes(lower));
  const wildcard = blocks.find((b) => b.agents.includes('*'));
  const block = specific || wildcard;
  if (!block) return false; // no rule at all = allowed by default

  // Find the most specific matching rule (longest path match wins, disallow
  // rules checked against root-level blocking as the common case).
  const disallowRoot = block.rules.some(
    (r) => r.type === 'disallow' && r.path === '/'
  );
  const explicitAllowRoot = block.rules.some(
    (r) => r.type === 'allow' && (r.path === '/' || r.path === '')
  );
  if (disallowRoot && !explicitAllowRoot) return true;
  return false;
}

async function scanDomain(domain) {
  const result = {
    domain,
    blockedBots: [],
    llmsTxt: 'missing', // missing | found | invalid
    schemaFound: false,
    metaOk: false,
    renderable: true,
    score: 0,
    grade: 'Unknown',
    error: null
  };

  // --- robots.txt ---
  try {
    const res = await fetchWithTimeout(`https://${domain}/robots.txt`);
    if (res.ok) {
      const text = await res.text();
      const blocks = parseRobots(text);
      result.blockedBots = AI_BOTS.filter((b) => isBotBlocked(blocks, b.name)).map((b) => b.name);
    }
    // 404/no robots.txt = nothing blocked, which is fine, leave blockedBots empty
  } catch (e) {
    result.robotsError = 'Could not fetch robots.txt';
  }

  // --- llms.txt ---
  try {
    const res = await fetchWithTimeout(`https://${domain}/llms.txt`);
    if (res.ok) {
      const text = await res.text();
      result.llmsTxt = text.trim().length > 20 ? 'found' : 'invalid';
    }
  } catch (e) {
    // stays 'missing'
  }

  // --- homepage: schema + meta + renderability heuristic ---
  try {
    const res = await fetchWithTimeout(`https://${domain}/`);
    if (res.ok) {
      const html = await res.text();
      result.schemaFound = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
      const titleOk = titleMatch && titleMatch[1].trim().length >= 10;
      const descOk = descMatch && descMatch[1].trim().length >= 20;
      result.metaOk = Boolean(titleOk && descOk);

      // Crude JS-dependency heuristic: strip scripts/styles, measure leftover
      // visible-ish text in <body>. Very short = likely client-rendered.
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const bodyHtml = bodyMatch ? bodyMatch[1] : html;
      const stripped = bodyHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      result.renderable = stripped.length >= 200;
    }
  } catch (e) {
    result.homepageError = 'Could not fetch homepage';
  }

  // --- scoring ---
  const majorBotsBlocked = result.blockedBots.length;
  const crawlerAccessScore = Math.max(0, 40 - majorBotsBlocked * 6);
  const llmsScore = result.llmsTxt === 'found' ? 15 : result.llmsTxt === 'invalid' ? 5 : 0;
  const schemaScore = result.schemaFound ? 20 : 0;
  const metaScore = result.metaOk ? 15 : 0;
  const renderScore = result.renderable ? 10 : 0;

  result.score = crawlerAccessScore + llmsScore + schemaScore + metaScore + renderScore;
  result.grade = result.score >= 80 ? 'Good' : result.score >= 50 ? 'Needs work' : 'Poor';

  return result;
}

app.post('/api/scan', async (req, res) => {
  try {
    const rawDomains = Array.isArray(req.body.domains) ? req.body.domains : [];
    const domains = [...new Set(rawDomains.map(cleanDomain).filter(Boolean))].slice(0, 60);

    if (domains.length === 0) {
      return res.status(400).json({ error: 'No valid domains provided.' });
    }

    const now = Date.now();
    const results = await Promise.all(
      domains.map(async (d) => {
        const cached = cache.get(d);
        if (cached && now - cached.time < CACHE_TTL_MS) return cached.data;
        const data = await scanDomain(d);
        cache.set(d, { time: now, data });
        return data;
      })
    );

    res.json({ count: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI crawler readiness scanner running on http://localhost:${PORT}`);
});
