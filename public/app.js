/* Buchmaschine – Frontend ohne Framework und ohne Build-Schritt. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  step: 1,
  catalog: null,
  niches: [],
  nicheId: null,
  config: null,
  preview: null,
  selectedKeywords: [],
  wordCategories: ['tiere', 'garten', 'kueche'],
  guides: false,
  busy: false,
  lastMeta: null,
};

/* ------------------------------- Utilities ------------------------------- */

const fmtEur = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const fmtNum = (n) => new Intl.NumberFormat('de-DE').format(Number(n) || 0);
const fmtInch = (n) => `${(Number(n) || 0).toFixed(3).replace('.', ',')}"`;

function setStatus(text, tone = '') {
  const pill = $('#status-pill');
  pill.textContent = text;
  pill.className = `pill ${tone}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const type = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `Fehler ${response.status}`;
    try {
      const data = await response.json();
      message = data.details?.join(' · ') || data.error || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  if (type.includes('application/json')) return response.json();
  return response;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'buch';
}

/* -------------------------------- Config --------------------------------- */

function baseConfig(niche) {
  return {
    title: niche?.sample?.title ?? 'Mein neues Buch',
    subtitle: niche?.sample?.subtitle ?? '',
    author: 'Vorname Nachname',
    description: niche?.description ?? '',
    generator: niche?.generator ?? 'sudoku',
    difficulty: niche?.difficulty ?? 'medium',
    pageCount: niche?.pageCount ?? 120,
    trim: niche?.trim ?? '6x9',
    paper: 'white',
    priceEur: niche?.priceEur ?? 9.99,
    seed: `buch-${Math.random().toString(36).slice(2, 8)}`,
    nicheId: niche?.id ?? 'raetsel-senioren',
    coverStyle: 'navy',
    coverFinish: 'matte',
    notebookStyle: 'lined',
    categories: niche?.categories ?? [],
    keywords: [],
    wordCategories: state.wordCategories,
    wordsPerPuzzle: 12,
    chapterLimit: 12,
  };
}

function collectConfig() {
  const c = state.config;
  return {
    ...c,
    title: $('#f-title').value,
    subtitle: $('#f-subtitle').value,
    author: $('#f-author').value,
    description: $('#f-description').value,
    generator: $('#f-generator').value,
    trim: $('#f-trim').value,
    paper: $('#f-paper').value,
    pageCount: Number($('#f-pages').value),
    priceEur: Number($('#f-price').value),
    seed: $('#f-seed').value,
    difficulty: $('#f-difficulty').value,
    wordsPerPuzzle: Number($('#f-words').value),
    chapterLimit: Number($('#f-chapters').value),
    notebookStyle: $('#f-notebook').value,
    keywords: state.selectedKeywords,
    wordCategories: state.wordCategories,
  };
}

function syncFields() {
  const c = state.config;
  $('#f-title').value = c.title;
  $('#f-subtitle').value = c.subtitle;
  $('#f-author').value = c.author;
  $('#f-description').value = c.description;
  $('#f-generator').value = c.generator;
  $('#f-trim').value = c.trim;
  $('#f-paper').value = c.paper;
  $('#f-pages').value = c.pageCount;
  $('#f-price').value = c.priceEur;
  $('#f-seed').value = c.seed;
  $('#f-difficulty').value = c.difficulty;
  $('#f-words').value = c.wordsPerPuzzle;
  $('#f-chapters').value = c.chapterLimit;
  $('#f-notebook').value = c.notebookStyle;
  toggleGeneratorSpecific();
}

function toggleGeneratorSpecific() {
  const gen = state.config.generator;
  $('#words-wrap').classList.toggle('is-hidden', gen !== 'wordsearch');
  $('#wordsets-wrap').classList.toggle('is-hidden', gen !== 'wordsearch');
  $('#chapters-wrap').classList.toggle('is-hidden', gen !== 'workbook');
  $('#notebook-wrap').classList.toggle('is-hidden', gen !== 'notebook');
  const diffVisible = ['sudoku', 'wordsearch', 'maze'].includes(gen);
  $('#f-difficulty').closest('.field').classList.toggle('is-hidden', !diffVisible);
}

/* -------------------------------- Preview -------------------------------- */

let previewTimer = null;

function schedulePreview(delay = 350) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, delay);
}

async function refreshPreview() {
  if (state.busy) return;
  state.busy = true;
  $('#preview-state').textContent = 'rechnet …';
  $('#preview-state').className = 'pill subtle is-busy';
  try {
    state.config = collectConfig();
    const data = await api('/api/preview', {
      method: 'POST',
      body: JSON.stringify({ config: state.config }),
    });
    state.preview = data;
    renderAll();
    setStatus('bereit', '');
    $('#preview-state').textContent = 'Vorschau';
    $('#preview-state').className = 'pill subtle';
  } catch (error) {
    setStatus(error.message, 'is-bad');
    $('#preview-state').textContent = 'Fehler';
    $('#preview-state').className = 'pill subtle is-bad';
  } finally {
    state.busy = false;
  }
}

/* ------------------------------ Cover render ----------------------------- */

function coverSvg(preview, { guides = false, big = false } = {}) {
  const styles = state.catalog?.coverStyles ?? {};
  const style = styles[state.config.coverStyle] ?? styles.navy ?? { bg: '#152037', accent: '#e3bd77', text: '#f8f6f1', sub: '#c9cfdd' };
  const cover = preview.cover;
  const W = cover.totalWidthIn;
  const H = cover.totalHeightIn;
  const bleed = cover.bleedIn;
  const trimW = cover.trimWidth;
  const trimH = cover.trimHeight;
  const spine = cover.spineIn;
  const backX = bleed;
  const spineX = bleed + trimW;
  const frontX = spineX + spine;
  const safe = 0.375;
  const seedNum = [...String(state.config.seed)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const variant = seedNum % 3;

  const frontFont = big ? 0.44 : 0.42;
  const titleLen = String(state.config.title).length;
  const titleSize = Math.min(frontFont, frontFont * (1.35 - titleLen / 90));

  const deco = variant === 0
    ? `<rect x="${frontX}" y="${bleed + trimH * 0.58}" width="${trimW}" height="${trimH * 0.42}" fill="${style.accent}" opacity="0.16"/>
       <circle cx="${frontX + trimW * 0.82}" cy="${bleed + trimH * 0.24}" r="${trimW * 0.26}" fill="${style.accent}" opacity="0.18"/>`
    : variant === 1
      ? `<rect x="${frontX}" y="${bleed + trimH * 0.18}" width="${trimW}" height="${trimH * 0.1}" fill="${style.accent}" opacity="0.28"/>
         <circle cx="${frontX + trimW * 0.2}" cy="${bleed + trimH * 0.78}" r="${trimW * 0.3}" fill="${style.accent}" opacity="0.16"/>`
      : [0, 1, 2, 3, 4, 5, 6].map((i) =>
          `<rect x="${frontX + (i * trimW) / 7}" y="${bleed + trimH * 0.66}" width="${trimW / 14}" height="${trimH * 0.3}" fill="${style.accent}" opacity="${0.06 + i * 0.02}"/>`).join('');

  const bullets = (preview.backCoverBullets ?? []).map((b) => `<li>${escapeXml(b)}</li>`).join('');
  const spineLabel = `${state.config.title} · ${state.config.author}`;

  const guideLayer = guides
    ? `
      <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#e05c69" stroke-width="0.012" stroke-dasharray="0.06 0.04"/>
      <line x1="${spineX}" y1="0" x2="${spineX}" y2="${H}" stroke="#5aa0e0" stroke-width="0.01" stroke-dasharray="0.05 0.04"/>
      <line x1="${spineX + spine}" y1="0" x2="${spineX + spine}" y2="${H}" stroke="#5aa0e0" stroke-width="0.01" stroke-dasharray="0.05 0.04"/>
      <rect x="${bleed + safe}" y="${bleed + safe}" width="${W - (bleed + safe) * 2}" height="${trimH - safe * 2}" fill="none" stroke="#93c5a3" stroke-width="0.008" stroke-dasharray="0.05 0.04"/>
      <rect x="${cover.barcode.leftIn}" y="${bleed + 0.25}" width="${cover.barcode.widthIn}" height="${cover.barcode.heightIn}" fill="none" stroke="#e05c69" stroke-width="0.012"/>`
    : '';

  return `
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cover-Vorschau: ${escapeXml(state.config.title)} – Gesamtmaß ${W} mal ${H} Zoll, Buchrücken ${spine} Zoll">
  <rect x="0" y="0" width="${W}" height="${H}" fill="${style.bg}"/>
  ${deco}

  <!-- Rückseite -->
  <text x="${backX + 0.25}" y="${bleed + trimH - safe - 0.12}" fill="${style.accent}" font-size="0.1" font-family="Helvetica, Arial, sans-serif" letter-spacing="0.03">ÜBER DIESES BUCH</text>
  <foreignObject x="${backX + 0.25}" y="${bleed + trimH - safe - 0.02}" width="${trimW - 0.5}" height="${trimH * 0.42}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Georgia,serif;font-size:${big ? 0.17 : 0.16}px;line-height:1.45;color:${style.text}">
      ${escapeXml(state.config.description || state.config.subtitle || 'Ein Buch, das man in die Hand nehmen kann.')}
    </div>
  </foreignObject>
  <foreignObject x="${backX + 0.25}" y="${bleed + trimH * 0.35}" width="${trimW - 0.5}" height="${trimH * 0.22}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Helvetica,Arial,sans-serif;font-size:${big ? 0.13 : 0.12}px;line-height:1.5;color:${style.sub}">
      <ul style="margin:0;padding-left:0.28em;list-style:disc">${bullets}</ul>
    </div>
  </foreignObject>
  <rect x="${cover.barcode.leftIn}" y="${bleed + 0.25}" width="${cover.barcode.widthIn}" height="${cover.barcode.heightIn}" fill="#ffffff"/>
  <text x="${cover.barcode.leftIn + 0.1}" y="${bleed + 0.25 + cover.barcode.heightIn / 2 + 0.04}" fill="#9a9a9a" font-size="0.09" font-family="Helvetica, Arial, sans-serif">ISBN / Barcode</text>

  <!-- Rücken -->
  ${spine >= 0.17 ? `<text transform="translate(${spineX + spine * 0.72}, ${H / 2}) rotate(90)" text-anchor="middle" fill="${style.text}" font-size="0.11" font-family="Helvetica, Arial, sans-serif" font-weight="700" letter-spacing="0.02">${escapeXml(spineLabel)}</text>` : ''}

  <!-- Vorderseite -->
  <text x="${frontX + safe}" y="${bleed + trimH - safe - 0.12}" fill="${style.sub}" font-size="0.085" font-family="Helvetica, Arial, sans-serif" letter-spacing="0.03">${escapeXml(preview.coverBadge ?? '')}</text>
  <foreignObject x="${frontX + safe}" y="${bleed + trimH * 0.34}" width="${trimW - safe * 2}" height="${trimH * 0.38}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:${(titleSize * 72).toFixed(1)}px;line-height:1.12;color:${style.text}">
      ${escapeXml(state.config.title)}
    </div>
  </foreignObject>
  <rect x="${frontX + safe}" y="${bleed + trimH * 0.325}" width="0.55" height="0.028" fill="${style.accent}"/>
  <foreignObject x="${frontX + safe}" y="${bleed + trimH * 0.215}" width="${trimW - safe * 2}" height="${trimH * 0.1}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Helvetica,Arial,sans-serif;font-size:${big ? 0.16 : 0.15}px;line-height:1.35;color:${style.sub}">
      ${escapeXml(state.config.subtitle)}
    </div>
  </foreignObject>
  <text x="${frontX + safe}" y="${bleed + trimH * 0.11 + 0.14}" fill="${style.text}" font-size="0.15" font-family="Helvetica, Arial, sans-serif" font-weight="700" letter-spacing="0.03">${escapeXml(state.config.author.toUpperCase())}</text>
  <rect x="${frontX + safe}" y="${bleed + trimH * 0.11 + 0.22}" width="0.4" height="0.014" fill="${style.accent}"/>
  ${guideLayer}
</svg>`;
}

/* ------------------------------ Page preview ----------------------------- */

function sampleSvg(sample) {
  if (!sample) {
    return '<p class="fineprint">Für diesen Buch-Typ gibt es keine Rätselvorschau.</p>';
  }
  if (sample.kind === 'sudoku') {
    const n = 9;
    const size = 270;
    const cell = size / n;
    let cells = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const v = sample.puzzle[r][c];
        cells += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#fff" stroke="#cfc8bd" stroke-width="0.6"/>`;
        if (v) cells += `<text x="${c * cell + cell / 2}" y="${r * cell + cell / 2 + 5}" text-anchor="middle" font-size="15" font-family="Helvetica, Arial, sans-serif" fill="#23201c">${v}</text>`;
      }
    }
    let lines = '';
    for (let i = 0; i <= n; i += 1) {
      const thick = i % 3 === 0 ? 1.8 : 0.5;
      const color = i % 3 === 0 ? '#23201c' : '#a9a29a';
      lines += `<line x1="${i * cell}" y1="0" x2="${i * cell}" y2="${size}" stroke="${color}" stroke-width="${thick}"/>`;
      lines += `<line x1="0" y1="${i * cell}" x2="${size}" y2="${i * cell}" stroke="${color}" stroke-width="${thick}"/>`;
    }
    return `<div class="svg-wrap"><svg viewBox="-1 -1 ${size + 2} ${size + 2}" role="img" aria-label="Sudoku-Vorschau, Schwierigkeit ${sample.difficulty}">${cells}${lines}</svg></div>`;
  }
  if (sample.kind === 'wordsearch') {
    const size = 280;
    const cell = size / sample.size;
    let cells = '';
    for (let r = 0; r < sample.size; r += 1) {
      for (let c = 0; c < sample.size; c += 1) {
        cells += `<text x="${c * cell + cell / 2}" y="${r * cell + cell / 2 + 3.4}" text-anchor="middle" font-size="${cell * 0.62}" font-family="Helvetica, Arial, sans-serif" fill="#23201c">${escapeXml(sample.grid[r][c])}</text>`;
      }
    }
    const words = sample.words.map((w) => `<li>${escapeXml(w)}</li>`).join('');
    return `<div class="svg-wrap"><svg viewBox="-2 -2 ${size + 4} ${size + 4}" role="img" aria-label="Wortsuche-Vorschau mit ${sample.words.length} Wörtern">
      <rect x="0" y="0" width="${size}" height="${size}" fill="#fff" stroke="#cfc8bd" stroke-width="0.8"/>${cells}</svg></div>
      <ul style="columns:3;font-size:0.72rem;margin:10px 0 0;padding-left:16px;color:#4a463f">${words}</ul>`;
  }
  const scale = 240 / Math.max(sample.cols, sample.rows);
  const w = sample.cols * scale;
  const h = sample.rows * scale;
  let walls = '';
  for (let r = 0; r < sample.rows; r += 1) {
    for (let c = 0; c < sample.cols; c += 1) {
      if (sample.walls[r][c] === 1) {
        walls += `<rect x="${c * scale}" y="${r * scale}" width="${scale + 0.3}" height="${scale + 0.3}" fill="#23201c"/>`;
      }
    }
  }
  return `<div class="svg-wrap"><svg viewBox="-1 -1 ${w + 2} ${h + 2}" role="img" aria-label="Labyrinth-Vorschau">${walls}</svg></div>`;
}

/* -------------------------------- Renders -------------------------------- */

function renderNiches() {
  const grid = $('#niche-grid');
  grid.innerHTML = state.niches
    .map((niche) => {
      const selected = niche.id === state.nicheId ? ' is-selected' : '';
      const tags = [
        `<span class="tag hot">${escapeXml(niche.generatorLabel)}</span>`,
        `<span class="tag">${escapeXml(niche.trim)}</span>`,
        `<span class="tag">${niche.pageCount} Seiten</span>`,
        `<span class="tag ${niche.competition === 'low' ? 'good' : ''}">Wettbewerb ${escapeXml(niche.competition)}</span>`,
      ].join('');
      return `
      <button class="niche${selected}" data-niche="${niche.id}" type="button">
        <h3>${escapeXml(niche.name)}</h3>
        <p>${escapeXml(niche.description)}</p>
        <div class="niche-foot">
          ${tags}
          <span class="opportunity">Chance <span class="bar"><i style="width:${niche.opportunity}%"></i></span> ${niche.opportunity}</span>
        </div>
      </button>`;
    })
    .join('');
}

function renderKeywordChips(ideas = []) {
  $('#kw-ideas').innerHTML = ideas
    .slice(0, 18)
    .map((idea) => {
      const picked = state.selectedKeywords.includes(idea.term) ? ' is-picked' : '';
      return `<button class="chip${picked}" data-keyword="${escapeXml(idea.term)}" type="button" title="Chance-Score ${idea.score} (${idea.verdict})">${escapeXml(idea.term)} <span class="score">${idea.score}</span></button>`;
    })
    .join('');
}

function renderSelectedKeywords() {
  $('#kw-count').textContent = `${state.selectedKeywords.length} / 7`;
  $('#kw-selected').innerHTML = state.selectedKeywords.length
    ? state.selectedKeywords.map((k) => `<span class="chip is-picked">${escapeXml(k)} <button class="x" data-remove-keyword="${escapeXml(k)}" aria-label="Keyword ${escapeXml(k)} entfernen" type="button">×</button></span>`).join('')
    : '<span class="fineprint">Noch keine Keywords gewählt – Klick auf einen Vorschlag übernimmt ihn.</span>';
}

function renderCoverStyles() {
  const styles = state.catalog?.coverStyles ?? {};
  $('#cover-styles').innerHTML = Object.entries(styles)
    .map(([id, style]) => {
      const selected = state.config.coverStyle === id ? ' is-selected' : '';
      return `<button class="swatch${selected}" data-style="${id}" type="button" aria-pressed="${state.config.coverStyle === id}">
        <span class="bar-preview"><i style="flex:1;background:${style.bg}"></i><i style="flex:0 0 10px;background:${style.accent}"></i><i style="flex:1;background:${style.bg}"></i></span>
        <span>${escapeXml(style.label)}</span>
      </button>`;
    })
    .join('');
}

function renderWordsets() {
  const sets = state.catalog?.wordsets ?? [];
  $('#wordsets').innerHTML = sets
    .map((set) => {
      const on = state.wordCategories.includes(set.id);
      return `<button class="chip${on ? ' is-picked' : ''}" data-wordset="${set.id}" type="button" aria-pressed="${on}">${escapeXml(set.label)} <span class="score">${set.count}</span></button>`;
    })
    .join('');
}

function renderCalc() {
  const preview = state.preview;
  if (!preview) return;
  const r = preview.royalties;
  const c = preview.cover;
  $('#calc-metrics').innerHTML = [
    metric('Buchrücken', `${c.spineIn.toFixed(4).replace('.', ',')}"`, `${preview.config.pageCount} Seiten · ${preview.config.paper === 'cream' ? 'Creme' : 'Weiß'}`),
    metric('Cover gesamt', `${c.totalWidthIn.toFixed(3).replace('.', ',')} × ${c.totalHeightIn.toFixed(3).replace('.', ',')}"`, `${c.pixels300dpi.width} × ${c.pixels300dpi.height} px bei 300 dpi`),
    metric('Druckkosten', fmtEur(r.printingCostEur), 'pro Exemplar, Schwarzweiß'),
    metric('Tantieme / Verkauf', fmtEur(r.payoutEur), `bei ${fmtEur(r.listPriceEur)} · ${r.marginPercent}% Marge`, r.payoutEur > 0 ? 'good' : 'warn'),
    metric('Mindestpreis', fmtEur(r.minimumListPriceEur), 'damit keine Unterdeckung entsteht'),
    metric('Seiten im PDF', fmtNum(preview.stats.pageCount), 'inkl. Titel, Impressum, Lösungen'),
  ].join('');

  const ladder = preview.priceLadder;
  const rows = [
    ['Druckkosten', fmtEur(ladder.printingCostEur)],
    ['Mindestpreis', fmtEur(ladder.minimumListPriceEur)],
    ...ladder.prices.filter((_, i) => i % 2 === 0).map((p) => [`VK ${fmtEur(p.price)}`, fmtEur(p.payout)]),
  ];
  $('#price-table').innerHTML = `<thead><tr><th>Position</th><th class="num">Wert</th></tr></thead><tbody>${rows
    .map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`)
    .join('')}</tbody>`;
}

function metric(label, value, hint, tone = '') {
  return `<div class="metric"><span>${escapeXml(label)}</span><strong class="${tone}">${escapeXml(value)}</strong>${hint ? `<small>${escapeXml(hint)}</small>` : ''}</div>`;
}

function renderPlan() {
  const preview = state.preview;
  if (!preview) return;
  const s = preview.stats;
  $('#plan-summary').innerHTML = [
    metric('Seiten', fmtNum(s.pageCount), `${s.frontMatterPages} Seiten Vorlauf`),
    metric('Rätsel / Einheiten', fmtNum(s.puzzleCount || s.exerciseCount || s.journalEntries || 0), s.puzzleCount ? `${s.solutionPages} Lösungsseiten` : s.exerciseCount ? `${s.chapterCount} Kapitel` : 'Schreibseiten'),
    metric('Innenrand', `${preview.margins.insideIn}"`, 'gebunden, gespiegelt'),
    metric('Außenrand', `${preview.margins.outsideIn}"`, 'oben/unten identisch'),
  ].join('');

  $('#plan-list').innerHTML = preview.pages
    .map((p) => `<li><span class="pos">${p.number ? p.number : '–'}</span><span class="kind">${escapeXml(shortKind(p.type))}</span><span class="label">${escapeXml(p.label)}</span></li>`)
    .join('');
}

function shortKind(type) {
  const map = {
    title: 'Titel', copyright: 'Impressum', howto: 'Anleitung', belongs: 'Widmung', section: 'Abschnitt',
    sudoku: 'Sudoku', wordsearch: 'Wortsuche', maze: 'Labyrinth', sudokuSolutions: 'Lösungen',
    wordsearchSolutions: 'Lösungen', mazeSolutions: 'Lösungen', journalDay: 'Tagesseite', weekly: 'Rückblick',
    chapter: 'Kapitel', exercise: 'Übung', lines: 'Schreibseite', closing: 'Schluss',
  };
  return map[type] ?? type;
}

function renderNumbers() {
  const p = state.preview;
  if (!p) return;
  const r = p.royalties;
  const c = p.cover;
  $('#numbers-panel').innerHTML = [
    metric('Format', `${p.config.trim.replace('x', ' × ')} Zoll`, `${p.config.paper === 'cream' ? 'Creme' : 'Weiß'} · ${p.stats.pageCount} Seiten`),
    metric('Rücken', `${c.spineIn.toFixed(4).replace('.', ',')} Zoll`, 'KDP-Formel, exakt'),
    metric('Vollumschlag', `${c.totalWidthIn.toFixed(3).replace('.', ',')} × ${c.totalHeightIn.toFixed(3).replace('.', ',')} Zoll`, `${c.pixels300dpi.width} × ${c.pixels300dpi.height} px`),
    metric('Druckkosten', fmtEur(r.printingCostEur), 'pro Exemplar'),
    metric('Tantieme', fmtEur(r.payoutEur), `${(r.royaltyRate * 100).toFixed(0)} % minus Druckkosten`, r.payoutEur > 0 ? 'good' : 'warn'),
    metric('E-Book (70 %)', fmtEur(r.ebook.estimatedPayoutEur), r.ebook.eligibleFor70 ? `im 70-%-Band (${fmtEur(r.listPriceEur)})` : `außerhalb 2,99–9,99 € → nur 35 %`),
  ].join('');

  $('#revenue-panel').innerHTML = (p.revenue ?? [])
    .map((row) => `<div class="metric"><span>${row.salesPerMonth} Verkäufe/Monat</span><strong>${fmtEur(row.monthlyEur)}</strong><small>${fmtEur(row.yearlyEur)} pro Jahr</small></div>`)
    .join('');
}

function renderAll() {
  if (!state.preview) return;
  $('#cover-preview').innerHTML = coverSvg(state.preview);
  $('#cover-big').innerHTML = coverSvg(state.preview, { guides: state.guides, big: true });
  $('#cover-metrics').innerHTML = [
    metric('Rückenbreite', `${state.preview.cover.spineIn.toFixed(4).replace('.', ',')}"`),
    metric('Mit Beschnitt', `${state.preview.cover.totalWidthIn.toFixed(3).replace('.', ',')} × ${state.preview.cover.totalHeightIn.toFixed(3).replace('.', ',')}"`),
    metric('300 dpi', `${state.preview.cover.pixels300dpi.width} × ${state.preview.cover.pixels300dpi.height} px`),
    metric('Barcode-Zone', '2,0 × 1,2"', 'unten links, freigehalten'),
  ].join('');
  $('#page-preview').innerHTML = sampleSvg(state.preview.sample);
  $('#page-caption').textContent = state.preview.sample
    ? `Beispielseite aus „${state.config.title}“ – so wird sie im PDF gedruckt.`
    : 'Dieser Buch-Typ besteht aus Text- und Schreibseiten.';
  renderCalc();
  renderPlan();
  renderNumbers();
  renderExportTab();
}

function renderExportTab() {
  const p = state.preview;
  if (!p) return;
  const meta = state.lastMeta ?? null;
  const r = p.royalties;
  $('#meta-summary').innerHTML = [
    metric('Titel', state.config.title.slice(0, 40), state.config.subtitle?.slice(0, 48) || ''),
    metric('Keywords gewählt', `${state.selectedKeywords.length} / 7`, state.selectedKeywords.slice(0, 3).join(', ') || 'noch keine'),
    metric('Kategorie', (p.config.categories?.[0] ?? '—').slice(0, 34), p.config.categories?.[1] ?? ''),
    metric('Preis / Tantieme', `${fmtEur(r.listPriceEur)} → ${fmtEur(r.payoutEur)}`),
  ].join('');
  if (meta) $('#copybox').textContent = meta;
}

/* -------------------------------- Actions -------------------------------- */

function selectNiche(id) {
  const niche = state.niches.find((n) => n.id === id);
  if (!niche) return;
  const keepSeed = state.config?.seed ?? `buch-${Math.random().toString(36).slice(2, 8)}`;
  state.nicheId = id;
  state.config = { ...baseConfig(niche), seed: keepSeed };
  state.selectedKeywords = [];
  syncFields();
  renderNiches();
  renderSelectedKeywords();
  renderKeywordChips(niche.keywords.map((k) => ({ ...k, score: Math.round((k.demand / Math.max(k.competition, 5)) * 100), verdict: 'kuratiert' })));
  schedulePreview(50);
  goStep(2);
}

function goStep(step) {
  state.step = step;
  $$('.step').forEach((el) => {
    const active = Number(el.dataset.step) === step;
    el.classList.toggle('is-active', active);
    el.classList.toggle('is-done', Number(el.dataset.step) < step);
    el.setAttribute('aria-current', active ? 'step' : 'false');
  });
  $$('.panel').forEach((el) => el.classList.toggle('is-hidden', Number(el.dataset.panel) !== step));
}

async function runExport(kind) {
  const buttons = $$('[data-export]');
  buttons.forEach((b) => { b.disabled = true; });
  const note = $('#export-note');
  try {
    state.config = collectConfig();
    const body = JSON.stringify({ config: state.config });
    const name = slug(state.config.title);
    if (kind === 'manuscript') {
      note.textContent = 'Buchblock wird gesetzt …';
      const response = await api('/api/export/manuscript.pdf', { method: 'POST', body });
      download(`${name}_buchblock_${state.config.trim}.pdf`, await response.blob());
      note.textContent = `Buchblock exportiert (${state.preview?.stats.pageCount ?? '?'} Seiten). Keine Beschnittzugabe im Innenblock.`;
    } else if (kind === 'cover') {
      note.textContent = 'Cover wird gesetzt …';
      const guides = state.guides ? '?guides=1' : '';
      const response = await api(`/api/export/cover.pdf${guides}`, { method: 'POST', body });
      download(`${name}_cover${state.guides ? '_hilfslinien' : ''}.pdf`, await response.blob());
      note.textContent = 'Cover exportiert – inklusive 0,125" Beschnitt und Barcode-Freizone.';
    } else if (kind === 'ebook') {
      note.textContent = 'E-Book wird gebaut …';
      const response = await api('/api/export/ebook.epub', { method: 'POST', body });
      download(`${name}_kindle.epub`, await response.blob());
      note.textContent = 'EPUB 3 exportiert – mit Titel, Anleitung, Kapiteln und Inhaltsverzeichnis.';
    } else if (kind === 'metadata') {
      const data = await api('/api/export/metadata.json', { method: 'POST', body });
      state.lastMeta = data.copyPasteText;
      download(`${name}_kdp_metadaten.json`, new Blob([JSON.stringify(data.metadata, null, 2)], { type: 'application/json' }));
      $('#copybox').textContent = data.copyPasteText;
      note.textContent = 'Metadaten exportiert – Copy-Paste-Text steht unten bereit.';
    } else if (kind === 'sheet') {
      note.textContent = 'Metadaten-Blatt wird gesetzt …';
      const response = await api('/api/export/metadata-sheet.pdf', { method: 'POST', body });
      download(`${name}_metadaten.pdf`, await response.blob());
      note.textContent = 'Metadaten-Blatt exportiert – alle Angaben und der Preflight-Bericht auf zwei Seiten.';
    } else if (kind === 'save') {
      const data = await api('/api/projects', { method: 'POST', body });
      note.textContent = `Projekt „${data.project.name}“ lokal gespeichert.`;
    }
    setStatus('fertig', 'is-good');
  } catch (error) {
    note.textContent = `Fehler: ${error.message}`;
    setStatus(error.message, 'is-bad');
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

async function downloadBoth() {
  const button = $('#btn-download-all');
  button.disabled = true;
  const note = $('#inspector-note');
  try {
    state.config = collectConfig();
    const body = JSON.stringify({ config: state.config });
    const name = slug(state.config.title);
    note.textContent = 'Buchblock wird gesetzt …';
    const m = await api('/api/export/manuscript.pdf', { method: 'POST', body });
    download(`${name}_buchblock_${state.config.trim}.pdf`, await m.blob());
    note.textContent = 'Cover wird gesetzt …';
    const c = await api('/api/export/cover.pdf', { method: 'POST', body });
    download(`${name}_cover.pdf`, await c.blob());
    note.textContent = 'Beide PDFs heruntergeladen. Viel Erfolg im KDP-Dashboard!';
    setStatus('exportiert', 'is-good');
  } catch (error) {
    note.textContent = `Fehler: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function renderPreflight(data) {
  const box = $('#preflight-result');
  if (!box) return;
  const compliance = data.compliance;
  const checks = data.checks ?? [];
  const bad = checks.filter((c) => !c.ok);
  const statusClass = data.status === 'pass' ? 'is-good' : data.status === 'warn' ? 'is-warn' : 'is-bad';
  const summary = data.status === 'pass'
    ? `Buchblock besteht alle ${checks.length} Prüfungen.`
    : `${bad.length} von ${checks.length} Prüfungen auffällig.`;
  const items = checks.map((check) => `
      <li class="${check.ok ? 'ok' : 'bad'}">
        <span aria-hidden="true">${check.ok ? '✓' : '!'}</span>
        <span>${escapeHtml(check.detail)}</span>
      </li>`).join('');
  const ai = compliance ? `
      <div class="preflight-block">
        <h4>KI-Offenlegung</h4>
        <p>${escapeHtml(compliance.aiDisclosure.answer)}</p>
        <p class="fineprint">${escapeHtml(compliance.aiDisclosure.explanation)}</p>
      </div>
      <div class="preflight-block">
        <h4>Marken &amp; Sprache</h4>
        <p>${escapeHtml(compliance.trademark.message)}</p>
        <p>Low-Content-Risiko: <strong>${escapeHtml(compliance.lowContent.level)}</strong> (${compliance.lowContent.structuredPageShare} % strukturierte Seiten)</p>
        ${compliance.hype.hits.length ? `<p class="fineprint">Werbesprache: ${escapeHtml(compliance.hype.hits.join(', '))}</p>` : ''}
      </div>` : '';
  box.innerHTML = `
    <p class="preflight-status ${statusClass}">${escapeHtml(summary)}</p>
    <ul class="preflight-list">${items}</ul>
    ${ai}
    <p class="fineprint">${escapeHtml(compliance?.disclaimer ?? '')}</p>`;
}

async function runPreflight() {
  const button = $('#btn-preflight');
  const box = $('#preflight-result');
  button.disabled = true;
  box.innerHTML = '<p class="fineprint">Buchblock wird gesetzt und geprüft …</p>';
  try {
    state.config = collectConfig();
    const body = JSON.stringify({ config: state.config });
    const data = await api('/api/preflight', { method: 'POST', body });
    renderPreflight(data);
    setStatus('geprüft', data.status === 'pass' ? 'is-good' : 'is-warn');
  } catch (error) {
    box.innerHTML = `<p class="preflight-status is-bad">${escapeHtml(error.message)}</p>`;
    setStatus(error.message, 'is-bad');
  } finally {
    button.disabled = false;
  }
}

async function loadPortfolio(sales = Number($('#portfolio-sales').value) || 10) {
  const metrics = $('#portfolio-metrics');
  const table = $('#portfolio-table');
  try {
    const data = await api(`/api/dashboard?sales=${encodeURIComponent(sales)}`);
    const s = data.summary;
    if (!s.projectCount) {
      metrics.innerHTML = '<p class="fineprint">Noch keine Projekte gespeichert. „Projekt speichern“ in Schritt 5 legt den ersten Eintrag an.</p>';
      table.innerHTML = '';
      $('#portfolio-note').textContent = '';
      return;
    }
    metrics.innerHTML = [
      metric('Projekte', String(s.projectCount), `${s.totalPages} Seiten insgesamt`),
      metric('Ø Preis', fmtEur(s.averagePriceEur), `Ø Tantieme ${fmtEur(s.averageRoyaltyEur)}`),
      metric('Modell / Monat', fmtEur(s.monthlyEurAllEur), `${s.salesPerBook} Verkäufe je Buch`),
      metric('Modell / Jahr', fmtEur(s.yearlyEurAllEur), 'bei konstanten Verkäufen'),
    ].join('');
    table.innerHTML = `<thead><tr><th>Projekt</th><th class="num">Seiten</th><th class="num">Preis</th><th class="num">Tantieme</th><th class="num">Monat</th></tr></thead><tbody>${data.rows
      .map((row) => `<tr><td>${escapeXml(row.name)}</td><td class="num">${row.pageCount}</td><td class="num">${fmtEur(row.priceEur)}</td><td class="num ${row.belowMinimum ? 'warn' : ''}">${fmtEur(row.royaltyPerSaleEur)}</td><td class="num">${fmtEur(row.monthlyEur)}</td></tr>`)
      .join('')}</tbody>`;
    $('#portfolio-note').textContent = [data.pricingHint, ...s.warnings].join(' ');
  } catch (error) {
    metrics.innerHTML = `<p class="fineprint">Portfolio nicht ladbar: ${escapeXml(error.message)}</p>`;
  }
}

async function loadProjects() {
  const list = $('#projects-list');
  list.innerHTML = '<p class="fineprint">lade …</p>';
  try {
    const { projects } = await api('/api/projects');
    if (!projects.length) {
      list.innerHTML = '<p class="fineprint">Noch keine gespeicherten Projekte. Exportiere über „Projekt speichern“.</p>';
      return;
    }
    list.innerHTML = projects
      .map((p) => `<div class="project">
        <div>
          <strong>${escapeXml(p.name)}</strong>
          <small>${escapeXml(p.config?.trim ?? '')} · ${p.config?.pageCount ?? '?'} Seiten · ${new Date(p.updatedAt).toLocaleString('de-DE')}</small>
        </div>
        <div class="project-actions">
          <button class="btn small" data-load="${p.id}" type="button">laden</button>
          <button class="btn ghost small" data-delete="${p.id}" type="button">löschen</button>
        </div>
      </div>`)
      .join('');
    list._projects = projects;
  } catch (error) {
    list.innerHTML = `<p class="fineprint">Fehler: ${escapeXml(error.message)}</p>`;
  }
  loadPortfolio();
}

/* --------------------------------- Wiring -------------------------------- */

function wire() {
  $$('.step').forEach((el) => el.addEventListener('click', () => goStep(Number(el.dataset.step))));
  $$('.tab').forEach((el) => el.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t === el));
    $$('.tabpane').forEach((p) => p.classList.toggle('is-hidden', p.dataset.pane !== el.dataset.tab));
  }));

  $('#niche-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-niche]');
    if (button) selectNiche(button.dataset.niche);
  });

  $('#kw-live').addEventListener('click', async () => {
    const seed = $('#kw-seed').value.trim();
    if (seed.length < 2) { $('#kw-seed').focus(); return; }
    const button = $('#kw-live');
    const note = $('#kw-source');
    button.disabled = true;
    note.textContent = 'Frage die Amazon-Suchleiste ab …';
    try {
      const data = await api(`/api/suggest?q=${encodeURIComponent(seed)}&mkt=de`);
      renderKeywordChips(data.ideas);
      if (data.live) {
        note.textContent = `${data.suggestions.length} Live-Vorschläge aus der Amazon-Büchersuche. ${data.note}`;
        setStatus('live-daten', 'is-good');
      } else {
        note.textContent = data.note ?? 'Keine Live-Treffer.';
        setStatus('offline', '');
      }
    } catch (error) {
      note.textContent = `Live-Abfrage fehlgeschlagen: ${error.message}. Die Werkstatt bleibt nutzbar.`;
      setStatus('offline', '');
    } finally {
      button.disabled = false;
    }
  });

  $('#kw-build').addEventListener('click', async () => {
    const seed = $('#kw-seed').value.trim();
    if (!seed) { $('#kw-seed').focus(); return; }
    try {
      const data = await api('/api/keywords', { method: 'POST', body: JSON.stringify({ seed, nicheId: state.nicheId }) });
      renderKeywordChips(data.ideas);
      $('#kw-source').textContent = 'Offline-Werkstatt: Phrasen aus deinem Stamm plus kuratierte Suchbegriffe der Nische.';
    } catch (error) {
      setStatus(error.message, 'is-bad');
    }
  });
  $('#kw-seed').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('#kw-build').click();
  });

  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-keyword]');
    if (add) {
      const term = add.dataset.keyword;
      if (state.selectedKeywords.includes(term)) return;
      if (state.selectedKeywords.length >= 7) {
        setStatus('KDP erlaubt maximal 7 Keywords', 'is-bad');
        return;
      }
      state.selectedKeywords.push(term);
      add.classList.add('is-picked');
      renderSelectedKeywords();
      schedulePreview(120);
      return;
    }
    const remove = event.target.closest('[data-remove-keyword]');
    if (remove) {
      state.selectedKeywords = state.selectedKeywords.filter((k) => k !== remove.dataset.removeKeyword);
      renderSelectedKeywords();
      $$('#kw-ideas .chip').forEach((chip) => {
        if (chip.dataset.keyword === remove.dataset.removeKeyword) chip.classList.remove('is-picked');
      });
      schedulePreview(120);
      return;
    }
    const style = event.target.closest('[data-style]');
    if (style) {
      state.config.coverStyle = style.dataset.style;
      renderCoverStyles();
      renderAll();
      return;
    }
    const wordset = event.target.closest('[data-wordset]');
    if (wordset) {
      const id = wordset.dataset.wordset;
      state.wordCategories = state.wordCategories.includes(id)
        ? state.wordCategories.filter((w) => w !== id)
        : [...state.wordCategories, id];
      if (!state.wordCategories.length) state.wordCategories = [id];
      renderWordsets();
      schedulePreview(120);
      return;
    }
    const load = event.target.closest('[data-load]');
    if (load) {
      const project = ($('#projects-list')._projects ?? []).find((p) => p.id === load.dataset.load);
      if (project) {
        state.config = { ...baseConfig(), ...project.config };
        state.selectedKeywords = state.config.keywords ?? [];
        state.nicheId = state.config.nicheId;
        syncFields();
        renderSelectedKeywords();
        renderNiches();
        $('#dlg-projects').close();
        goStep(2);
        schedulePreview(50);
      }
      return;
    }
    const del = event.target.closest('[data-delete]');
    if (del) {
      api(`/api/projects/${del.dataset.delete}`, { method: 'DELETE' }).then(() => {
        loadProjects();
        loadPortfolio();
      });
      return;
    }
    const close = event.target.closest('[data-close]');
    if (close) close.closest('dialog').close();
  });

  ['#f-title', '#f-subtitle', '#f-author', '#f-description', '#f-generator', '#f-trim', '#f-paper', '#f-pages', '#f-price', '#f-difficulty', '#f-words', '#f-chapters', '#f-notebook'].forEach((sel) => {
    $(sel).addEventListener('input', () => {
      if (sel === '#f-generator') {
        state.config.generator = $('#f-generator').value;
        toggleGeneratorSpecific();
      }
      schedulePreview();
    });
    $(sel).addEventListener('change', () => schedulePreview());
  });

  $('#f-seed').addEventListener('change', () => schedulePreview(50));
  $('#f-seed-random').addEventListener('click', () => {
    $('#f-seed').value = `buch-${Math.random().toString(36).slice(2, 8)}`;
    schedulePreview(50);
  });
  $('#f-guides').addEventListener('change', (event) => {
    state.guides = event.target.checked;
    renderAll();
  });
  $('#btn-refresh').addEventListener('click', () => refreshPreview());
  $('#btn-download-all').addEventListener('click', downloadBoth);
  const preflightButton = $('#btn-preflight');
  if (preflightButton) preflightButton.addEventListener('click', runPreflight);
  $$('[data-export]').forEach((button) => button.addEventListener('click', () => runExport(button.dataset.export)));

  $('#btn-projects').addEventListener('click', () => {
    $('#dlg-projects').showModal();
    loadProjects();
  });
  $('#portfolio-sales').addEventListener('change', (event) => {
    const sales = Math.max(0, Number(event.target.value) || 0);
    loadPortfolio(sales);
  });
  $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());

  $('#btn-copy').addEventListener('click', async () => {
    const text = $('#copybox').textContent;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('kopiert', 'is-good');
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('#copybox'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      setStatus('markiert – Strg/Cmd + C', '');
    }
  });

  $$('.dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

async function init() {
  wire();
  setStatus('lade Daten …', 'is-busy');
  try {
    const [catalog, niches] = await Promise.all([api('/api/catalog'), api('/api/niches')]);
    state.catalog = catalog;
    state.niches = niches.niches;

    $('#f-generator').innerHTML = Object.entries(catalog.generators)
      .map(([id, gen]) => `<option value="${id}">${escapeXml(gen.label)}</option>`)
      .join('');
    $('#f-trim').innerHTML = Object.entries(catalog.trims)
      .map(([id, trim]) => `<option value="${id}">${escapeXml(trim.label)}</option>`)
      .join('');

    state.nicheId = state.niches[0].id;
    state.config = baseConfig(state.niches[0]);
    syncFields();
    renderNiches();
    renderWordsets();
    renderCoverStyles();
    renderSelectedKeywords();
    await refreshPreview();
    setStatus('bereit', 'is-good');
  } catch (error) {
    setStatus('Server nicht erreichbar', 'is-bad');
    $('#inspector-note').textContent = `Fehler beim Start: ${error.message}`;
  }
}

init();
