// Builds dist/ from content/site.json + src/ + media/. No dependencies. Run: node build.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'dist');
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8'));
// Hidden from search while the switch is on, and always on previews and draft branches.
const NOINDEX = c.seo?.hide_from_search !== false || (Boolean(process.env.CONTEXT) && process.env.CONTEXT !== 'production');

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// **text** becomes bold. Everything else is plain text.
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const list = a => (Array.isArray(a) ? a : []).filter(x => x !== null && x !== undefined && x !== '');
const href = u => { const s = String(u || '').trim(); return /^(https?:|mailto:|\/)/i.test(s) ? esc(s) : '#'; };
const media = p => { const s = String(p || '').trim(); if (!s) return ''; return s.startsWith('/') || /^https?:/.test(s) ? s : '/' + s; };
// A plain percentage like "30%" counts up; anything else shows as written.
const gaugeValue = v => { const m = String(v ?? '').trim().match(/^(\d+)%$/); return m ? `<span data-count="${m[1]}">${m[1]}</span>%` : esc(v); };
const clampFill = f => { const n = Number(f); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : 1; };

const STOP_ORDER = [['kyiv', 'kyiv'], ['daytona', 'daytona'], ['atlanta', 'atlanta'], ['mexico', 'mexico'], ['ai', 'orbit']];
const stop = (key, globeKey) => {
  const s = c.stops?.[key] || {};
  return `    <article class="chapter" data-stop="${globeKey}">
      <p class="stop">${esc(s.label)}</p>
      <h2>${esc(s.heading)}</h2>
      ${s.body ? `<p>${rich(s.body)}</p>` : ''}
      ${list(s.facts).length ? `<ul class="facts">
        ${list(s.facts).map(f => `<li>${rich(f)}</li>`).join('\n        ')}
      </ul>` : ''}
    </article>`;
};
const resume = media(c.contact?.resume);
const GAUGE_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="g-track" cx="60" cy="60" r="52"/><circle class="g-arc" cx="60" cy="60" r="52"/></svg>';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<title>${esc(c.seo?.title)}</title>
<meta name="description" content="${esc(c.seo?.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<script>try{var t=localStorage.getItem('kb-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}</script>
</head>
<body>

<header class="bar">
  <a class="mark" href="#top" aria-label="${esc(c.hero?.name)}, back to top">KB</a>
  <div class="bar-right">
  <button class="cabin-toggle" type="button" title="Pull the shade" aria-pressed="false" aria-label="Night mode: pull the window shade down">
    <span class="cabin" aria-hidden="true"><span class="cabin-glass"><span class="cabin-sky"></span><span class="cabin-shade"></span></span></span>
    <span class="cabin-label" aria-hidden="true"><span class="to-night"><span class="long">Night flight</span><span class="short">Night</span></span><span class="to-day"><span class="long">Daylight</span><span class="short">Day</span></span></span>
  </button>
  <nav class="langs" aria-label="Language">
    <span class="lang is-on" aria-current="true">EN</span>
    <span class="lang" title="Spanish version coming soon">ES</span>
    <span class="lang" title="Russian version coming soon">RU</span>
  </nav>
  </div>
</header>

<main id="top">

<section class="journey" aria-label="Career route">
  <div class="plate" aria-hidden="true">
    <div class="plate-shadow"></div>
    <canvas id="globe"></canvas>
    <div class="plate-fallback"></div>
  </div>

  <div class="chapters">

    <article class="chapter hero" data-stop="hero">
      <p class="eyebrow">${esc(c.hero?.eyebrow)}</p>
      <h1>${esc(c.hero?.name)}</h1>
      <p class="lede">${rich(c.hero?.intro)}</p>
      ${c.hero?.status ? `<p class="meta">${c.hero?.show_status_dot !== false ? '<span class="dot" aria-hidden="true"></span>' : ''}${esc(c.hero.status)}</p>` : ''}
      ${c.hero?.scroll_cue ? `<p class="scroll-cue">${esc(c.hero.scroll_cue)}</p>` : ''}
    </article>

${STOP_ORDER.map(([k, g]) => stop(k, g)).join('\n\n')}

  </div>
</section>

<section class="roles" aria-labelledby="roles-h">
  <div class="wrap">
    <p class="eyebrow">${esc(c.experience?.kicker)}</p>
    <h2 id="roles-h" class="section-h">${esc(c.experience?.heading)}</h2>
    <div class="cards">
${list(c.experience?.jobs).map(j => `      <article class="card">
        <p class="when">${esc(j.when)}</p>
        <h3>${esc(j.company)}</h3>
        <p class="role">${esc(j.title)}</p>
        ${list(j.bullets).length ? `<ul>
          ${list(j.bullets).map(b => `<li>${rich(b)}</li>`).join('\n          ')}
        </ul>` : ''}
      </article>`).join('\n\n')}
    </div>
  </div>
</section>

<section class="impact" aria-labelledby="impact-h">
  <div class="wrap">
    <p class="eyebrow">${esc(c.impact?.kicker)}</p>
    <h2 id="impact-h" class="section-h">${esc(c.impact?.heading)}</h2>
    <div class="gauges">
${list(c.impact?.gauges).slice(0, 4).map(g => `      <figure class="gauge" data-fill="${clampFill(g.fill)}">
        ${GAUGE_SVG}
        <div class="g-val">${gaugeValue(g.value)}</div>
        <figcaption>${esc(g.caption)}</figcaption>
      </figure>`).join('\n')}
    </div>
  </div>
</section>

<section class="caps" aria-labelledby="caps-h">
  <div class="wrap">
    <p class="eyebrow">${esc(c.capabilities?.kicker)}</p>
    <h2 id="caps-h" class="section-h">${esc(c.capabilities?.heading)}</h2>
    <ul class="cap-list">
      ${list(c.capabilities?.items).map(i => `<li><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></li>`).join('\n      ')}
    </ul>
    ${list(c.capabilities?.credentials).length ? `<p class="creds">${list(c.capabilities.credentials).map(esc).join(' · ')}</p>` : ''}
  </div>
</section>

<section class="contact" aria-labelledby="contact-h">
  <div class="wrap">
    <h2 id="contact-h" class="section-h">${esc(c.contact?.heading)}</h2>
    <div class="contact-row">
      ${c.contact?.email ? `<a class="btn" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a>` : ''}
      ${c.contact?.linkedin ? `<a class="btn" href="${href(c.contact.linkedin)}" rel="noopener" target="_blank">LinkedIn</a>` : ''}
      ${resume ? `<a class="btn btn-solid" href="${href(resume)}" download>${esc(c.contact?.resume_label || 'Download resume')}</a>` : ''}
    </div>
  </div>
</section>

</main>

<footer class="foot">
  <div class="wrap">
    <p>© ${esc(c.footer?.year)} ${esc(c.footer?.name)}</p>
    <p class="credits">Earth at night: NASA Black Marble 2016, NASA Goddard Space Flight Center. "Airliner" by <a href="https://vinish.dev/free-3d-models/">vinish.dev</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, landing gear removed, recoloured. "Radar Imaging Satellite" by <a href="https://vinish.dev/free-3d-models/">vinish.dev</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, recoloured.</p>
  </div>
</footer>

<script type="importmap">{"imports":{"three":"./assets/vendor/three.module.min.js"}}</script>
<script type="module" src="main.js"></script>
</body>
</html>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'src'), OUT, { recursive: true });
if (fs.existsSync(path.join(ROOT, 'media'))) fs.cpSync(path.join(ROOT, 'media'), path.join(OUT, 'media'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
const headers = ['/*', ...(NOINDEX ? ['  X-Robots-Tag: noindex, nofollow'] : []), '  Referrer-Policy: strict-origin-when-cross-origin', '  X-Content-Type-Options: nosniff', '', '/assets/*', '  Cache-Control: public, max-age=604800', ''];
fs.writeFileSync(path.join(OUT, '_headers'), headers.join('\n'));
fs.writeFileSync(path.join(OUT, 'robots.txt'), NOINDEX ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n');
if (resume && !resume.startsWith('http') && !fs.existsSync(path.join(OUT, resume))) {
  console.error(`Resume file not found: ${resume}. Upload it in the editor or fix the path.`);
  process.exit(1);
}
console.log(`Built dist/index.html (${html.length} bytes), ${list(c.experience?.jobs).length} roles, ${NOINDEX ? 'hidden from search' : 'visible to search'}.`);
