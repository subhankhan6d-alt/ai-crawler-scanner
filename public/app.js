const domainInput = document.getElementById('domainInput');
const domainCount = document.getElementById('domainCount');
const runBtn = document.getElementById('runBtn');
const resultsSection = document.getElementById('resultsSection');
const emptyState = document.getElementById('emptyState');
const resultsBody = document.getElementById('resultsBody');
const resultCount = document.getElementById('resultCount');
const exportBtn = document.getElementById('exportBtn');
const unlockCode = document.getElementById('unlockCode');
const applyCodeBtn = document.getElementById('applyCodeBtn');
const codeStatus = document.getElementById('codeStatus');
async function applyCode() {
  const code = unlockCode.value.trim();
  if (!code) {
    codeStatus.textContent = '';
    return;
  }
  applyCodeBtn.disabled = true;
  applyCodeBtn.textContent = 'Checking…';
  try {
    const res = await fetch('/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unlockCode: code })
    });
    const data = await res.json();
    if (data.valid) {
      codeStatus.textContent = `✓ Unlocked — up to ${data.limit} domains per scan`;
      codeStatus.className = 'code-status code-status-valid';
    } else {
      codeStatus.textContent = '✕ Invalid code — still on the free 5-domain limit';
      codeStatus.className = 'code-status code-status-invalid';
    }
  } catch (err) {
    codeStatus.textContent = 'Could not check code — try again';
    codeStatus.className = 'code-status code-status-invalid';
  } finally {
    applyCodeBtn.disabled = false;
    applyCodeBtn.textContent = 'Apply';
  }
}
applyCodeBtn.addEventListener('click', applyCode);
unlockCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyCode();
  }
});

let lastResults = [];
let sortKey = null;
let sortDir = 1;

function parseDomains() {
  return domainInput.value.split('\n').map((d) => d.trim()).filter(Boolean);
}

function updateCount() {
  const n = parseDomains().length;
  domainCount.textContent = `${n} domain${n === 1 ? '' : 's'} queued`;
}
domainInput.addEventListener('input', updateCount);
updateCount();

function gradeClass(grade) {
  if (grade === 'Good') return 'grade-good';
  if (grade === 'Needs work') return 'grade-warn';
  return 'grade-poor';
}

function checkIcon(ok) {
  return ok ? '<span class="check-ok">✓</span>' : '<span class="check-bad">✕</span>';
}

function render(results) {
  lastResults = results;
  resultsSection.hidden = false;
  emptyState.hidden = true;
  resultCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

  const sorted = sortKey ? [...results].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
    if (typeof av === 'boolean') return ((av === bv) ? 0 : av ? -1 : 1) * sortDir;
    return (av - bv) * sortDir;
  }) : results;

  resultsBody.innerHTML = sorted.map((r, i) => {
    const bots = r.blockedBots && r.blockedBots.length
      ? r.blockedBots.map((b) => `<span class="bot-pill">${b}</span>`).join('')
      : '<span class="none-blocked">none blocked</span>';

    return `
      <tr class="entering" style="animation-delay:${Math.min(i * 25, 400)}ms">
        <td class="domain-cell">${r.domain}</td>
        <td><span class="grade-badge ${gradeClass(r.grade)}">${r.score} · ${r.grade}</span></td>
        <td>${bots}</td>
        <td>${checkIcon(r.llmsTxt === 'found')}</td>
        <td>${checkIcon(r.schemaFound)}</td>
        <td>${checkIcon(r.metaOk)}</td>
        <td>${checkIcon(r.renderable)}</td>
      </tr>
    `;
  }).join('');
}

async function runScan() {
  const domains = parseDomains();
  if (domains.length === 0) return;

  runBtn.disabled = true;
  runBtn.querySelector('.run-btn-label').textContent = 'Scanning…';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains, unlockCode: unlockCode.value.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Scan failed');

    if (data.requestedCount > data.count && !data.unlocked) {
      alert(`You submitted ${data.requestedCount} domains, but the free tier scans up to ${data.limit} at a time. Only the first ${data.count} were checked — see /pricing.html for a code to unlock 25 or 60 domains per scan.`);
    } else if (unlockCode.value.trim() && !data.unlocked) {
      alert('That unlock code was not recognized — running on the free 5-domain limit instead.');
    } else if (data.requestedCount > data.count && data.unlocked) {
      alert(`You submitted ${data.requestedCount} domains, but your unlocked tier caps at ${data.limit} per scan. Only the first ${data.count} were checked.`);
    }

    render(data.results);
  } catch (err) {
    alert(`Scan failed: ${err.message}`);
  } finally {
    runBtn.disabled = false;
    runBtn.querySelector('.run-btn-label').textContent = 'Run scan';
  }
}
runBtn.addEventListener('click', runScan);

document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = -1; }
    render(lastResults);
  });
});

exportBtn.addEventListener('click', () => {
  if (lastResults.length === 0) return;
  const headers = ['domain', 'score', 'grade', 'blockedBots', 'llmsTxt', 'schemaFound', 'metaOk', 'renderable'];
  const rows = [headers.join(',')].concat(
    lastResults.map((r) => [
      r.domain, r.score, r.grade,
      `"${(r.blockedBots || []).join('; ')}"`,
      r.llmsTxt, r.schemaFound, r.metaOk, r.renderable
    ].join(','))
  );
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-crawler-readiness-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
