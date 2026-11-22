/* Netra assistant: asks the DR stage, explains it, then finds doctors from the CSV. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#3ddc97', '#b8e04a', '#ffc233', '#ff7a3d', '#ff3d6e'];
  const STAGES = ['No DR', 'Mild', 'Moderate', 'Severe', 'Proliferative DR'];
  const STEPS = ['Stage', 'Area', 'Experience', 'Fee', 'Doctors'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, reduce ? Math.min(ms, 80) : ms));
  const PIN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6l-.9 6.6L14 12 2.5 13.8z"/></svg>';

  const S = { started: false, busy: false, awaiting: null, cls: null, city: null, exp: 0, fee: null,
    sort: 'best', offset: 0, refine: false, lastScan: null };
  let CLASSES = null, META = null, body, input, sendBtn, panel, launch, tip, form;

  /* ---------- build the widget ---------- */
  function build() {
    launch = document.createElement('button');
    launch.className = 'nc-launch'; launch.type = 'button'; launch.setAttribute('aria-label', 'Open Netra assistant');
    launch.innerHTML = '<svg viewBox="0 0 32 32" fill="none"><path class="lid" d="M2 16s5-9 14-9 14 9 14 9-5 9-14 9S2 16 2 16z" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="5" fill="currentColor"/></svg>';
    tip = document.createElement('div'); tip.className = 'nc-tip'; tip.textContent = 'Need an eye doctor? Ask me.';
    panel = document.createElement('section');
    panel.className = 'nc'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Netra assistant');
    panel.innerHTML = `
      <div class="nc-head">
        <div class="nc-avatar"><i></i></div>
        <div class="nc-title"><b>Netra Assistant</b><span>Online</span></div>
        <button class="nc-ibtn" id="ncWide" type="button" aria-label="Make chat wider">&#x2922;</button>
        <button class="nc-ibtn" id="ncClose" type="button" aria-label="Close chat">&times;</button>
      </div>
      <div class="nc-steps" id="ncSteps">${STEPS.map(s => `<div>${s}</div>`).join('')}</div>
      <div class="nc-body" id="ncBody" aria-live="polite"></div>
      <form class="nc-form" id="ncForm" autocomplete="off">
        <input id="ncInput" type="text" maxlength="120" placeholder="Type your answer..." aria-label="Your message">
        <button class="nc-send" id="ncSend" type="submit" aria-label="Send">${SEND}</button>
      </form>`;
    document.body.append(launch, tip, panel);
    body = panel.querySelector('#ncBody'); input = panel.querySelector('#ncInput');
    sendBtn = panel.querySelector('#ncSend'); form = panel.querySelector('#ncForm');
    launch.onclick = () => open();
    tip.onclick = () => open();
    panel.querySelector('#ncClose').onclick = close;
    panel.querySelector('#ncWide').onclick = () => panel.classList.toggle('wide');
    form.onsubmit = e => {
      e.preventDefault();
      const t = input.value.trim(); if (!t || S.busy) return;
      input.value = ''; removeChips(); addUser(t); route(t);
    };
    addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
    if (!sessionStorage.getItem('ncTip')) {
      setTimeout(() => { if (!panel.classList.contains('open')) { tip.classList.add('show'); sessionStorage.setItem('ncTip', '1'); setTimeout(() => tip.classList.remove('show'), 7000); } }, 5000);
    }
  }

  /* ---------- UI helpers ---------- */
  function setStep(n) {
    [...panel.querySelectorAll('#ncSteps div')].forEach((d, i) => {
      d.classList.toggle('done', i < n); d.classList.toggle('now', i === n);
    });
  }
  function scroll() { requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; }); }
  function lock(on, ph) { S.busy = on; input.disabled = on; sendBtn.disabled = on; if (ph) input.placeholder = ph; if (!on) input.focus({ preventScroll: true }); }
  function row(html, cls = '', extra = '') {
    const r = document.createElement('div'); r.className = 'nc-row ' + cls;
    r.innerHTML = cls === 'user' ? `<div class="nc-b">${html}</div>`
      : `<div class="nc-mini"><i></i></div><div class="nc-b ${extra}">${html}</div>`;
    body.append(r); scroll(); return r;
  }
  const addUser = t => row(esc(t), 'user');
  async function say(html, extra = '', style = '') {
    const t = document.createElement('div'); t.className = 'nc-row';
    t.innerHTML = '<div class="nc-mini"><i></i></div><div class="nc-b nc-typing"><i></i><i></i><i></i></div>';
    body.append(t); scroll();
    await sleep(Math.min(1500, 500 + html.replace(/<[^>]+>/g, '').length * 7));
    t.remove();
    const r = row(html, '', extra); if (style) r.style.cssText = style; return r;
  }
  function removeChips() { body.querySelectorAll('.nc-chips').forEach(c => c.remove()); }
  /* chips: [{label, fn, hot}] ; clicking shows the label as the user's message */
  function chips(list) {
    const box = document.createElement('div'); box.className = 'nc-chips';
    list.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'nc-chip' + (c.hot ? ' hot' : ''); b.style.setProperty('--d', i * 0.06 + 's');
      b.textContent = c.label;
      b.onclick = () => { if (S.busy) return; removeChips(); addUser(c.label); c.fn(c.label); };
      box.append(b);
    });
    body.append(box); scroll();
  }
  async function api(url, payload) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return r.json();
  }

  /* ---------- conversation ---------- */
  async function start() {
    S.started = true; lock(true);
    try {
      [CLASSES, META] = await Promise.all([
        fetch('/api/classes').then(r => r.json()).then(j => j.classes),
        fetch('/api/doctors/meta').then(r => r.json())]);
    } catch {
      await say('I cannot reach the server. Start <em>app.py</em> and reopen this chat.'); S.started = false; lock(false); return;
    }
    await say('Hi, I am <em>Netra</em>. I can explain your diabetic retinopathy stage and help you find an ophthalmologist.');
    if (S.lastScan) await offerScan(S.lastScan.index); else await askClass();
  }

  async function askClass() {
    setStep(0); S.awaiting = null; lock(true);
    await say('Which stage were you told you have?');
    const list = STAGES.map((s, i) => ({ label: s, fn: l => route(l, 'class') }));
    if (S.lastScan) list.unshift({ label: `Use my scan: ${S.lastScan.label}`, hot: true, fn: () => useClass(S.lastScan.index) });
    list.push({ label: 'I am not sure', fn: l => route(l, 'class') });
    S.awaiting = 'class'; chips(list); lock(false, 'Type a stage, like mild or severe');
  }

  async function offerScan(idx) {
    lock(true);
    await say(`Your scan suggests <em>${STAGES[idx]}</em>. Should I use that stage?`);
    S.awaiting = 'class';
    chips([{ label: `Yes, ${STAGES[idx]}`, hot: true, fn: () => useClass(idx) },
           { label: 'Choose another stage', fn: () => askClass() }]);
    lock(false, 'Type a stage, like mild or severe');
  }

  async function route(text, forced) {
    const step = forced || S.awaiting;
    if (!step) return afterResults(text);
    lock(true);
    let res;
    try { res = await api('/api/chat/parse', { step, text }); }
    catch { await say('I lost the connection. Check that the server is running and try again.'); return lock(false); }
    if (!res.ok) {
      await say(esc(res.message || 'Please try again.'));
      if (res.unknown) {
        S.awaiting = 'class';
        chips([{ label: 'Scan a retina photo', hot: true, fn: () => { close(); document.getElementById('detect').scrollIntoView({ behavior: 'smooth' }); } },
               { label: 'Pick a stage', fn: () => askClass() }]);
        return lock(false);
      }
      return retry(step);
    }
    if (step === 'class') return useClass(res.value);
    if (step === 'city') { S.city = res.value; S.cityLabel = res.label; }
    if (step === 'experience') { S.exp = res.value; S.expLabel = res.label; }
    if (step === 'fee') { S.fee = res.value; S.feeLabel = res.label; }
    next(step);
  }

  function retry(step) {
    ({ class: askClass, city: askCity, experience: askExp, fee: askFee })[step]();
  }
  function next(step) {
    if (S.refine) { S.refine = false; return search(true); }
    ({ city: askExp, experience: askFee, fee: () => search(true) })[step]();
  }

  async function useClass(idx) {
    S.cls = idx; S.awaiting = null; lock(true);
    const c = CLASSES[idx];
    await say(`<span class="nc-tag" style="--c:${c.color}">${esc(c.urgency)}</span><h5>${esc(c.stage)}</h5><p>${esc(c.summary)}</p>` +
      c.what_it_is.map(t => `<p>${esc(t)}</p>`).join(''), 'stage', `--c:${c.color}`);
    await say(`<h5 style="--c:${c.color}">Why it happens</h5><ul>${c.causes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`, '', `--c:${c.color}`);
    await say(`<h5 style="--c:${c.color}">What you can do</h5><ul>${c.precautions.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`, '', `--c:${c.color}`);
    const urgent = c.urgency_level >= 3;
    await say(`<p><b>${urgent ? 'Do not wait. ' : ''}${esc(c.see_doctor)}</b></p>` +
      (idx >= 2 ? '<p>The directory lists general ophthalmologists. When you call, ask whether the doctor treats diabetic retinopathy or has a retina specialist.</p>' : ''),
      urgent ? 'urgent' : '');
    await say('Now let me find you a doctor.');
    askCity();
  }

  async function askCity() {
    setStep(1); S.awaiting = 'city'; lock(true);
    await say('Which city or area would you like?');
    chips([...META.cities.map(c => ({ label: c.city, fn: l => route(l, 'city') })),
           { label: 'Any city', fn: l => route(l, 'city') }]);
    lock(false, 'Type a city, like Pune');
  }
  async function askExp() {
    setStep(2); S.awaiting = 'experience'; lock(true);
    await say(`Good, <em>${esc(S.cityLabel)}</em>. How many years of experience should the doctor have at least?`);
    chips(['Any', '3+ years', '5+ years', '8+ years', '10+ years'].map(l => ({ label: l, fn: l2 => route(l2, 'experience') })));
    lock(false, 'Type years, like 5');
  }
  async function askFee() {
    setStep(3); S.awaiting = 'fee'; lock(true);
    await say('What is the most you want to pay per consultation?');
    chips(['Up to \u20b9500', 'Up to \u20b9700', 'Up to \u20b9900', 'Any fee'].map(l => ({ label: l, fn: l2 => route(l2, 'fee') })));
    lock(false, 'Type an amount, like 700');
  }

  /* ---------- search + results ---------- */
  async function search(fresh) {
    setStep(4); S.awaiting = null; lock(true);
    if (fresh) S.offset = 0;
    await say(fresh ? 'Searching the doctor list...' : 'Loading more doctors...');
    let res;
    try {
      res = await api('/api/doctors', { city: S.city, min_experience: S.exp, max_fee: S.fee, class_index: S.cls, sort: S.sort, offset: S.offset, limit: 6 });
    } catch { await say('The search failed. Check the server and try again.'); return lock(false); }

    if (fresh) {
      const f = [`<b>${esc(S.cityLabel || 'Any city')}</b>`, `<b>${esc(S.expLabel || 'Any experience')}</b>`, `<b>${esc(S.feeLabel || 'Any fee')}</b>`].join(', ');
      const d = document.createElement('div'); d.className = 'nc-found';
      d.innerHTML = res.relaxed.length
        ? `No doctor matched all three, so I relaxed the <b>${res.relaxed[0]}</b> rule. Showing <b>${res.total}</b> doctors for ${f}.`
        : `Found <b>${res.total}</b> doctors for ${f}.`;
      body.append(d);
    }
    const wrap = document.createElement('div'); wrap.className = 'nc-docs'; body.append(wrap);
    res.doctors.forEach((doc, i) => wrap.append(card(doc, S.offset + i + 1, i * 0.12)));
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.querySelectorAll('.nc-bar i').forEach(b => b.style.width = b.dataset.w)));
    const note = document.createElement('p'); note.className = 'nc-note';
    note.textContent = `Showing ${S.offset + 1} to ${S.offset + res.doctors.length} of ${res.total}. Details come from your doctor list. Call the clinic to confirm fee and timing.`;
    body.append(note); scroll();

    const opts = [];
    if (res.has_more) opts.push({ label: 'Show more', hot: true, fn: () => { S.offset += 6; search(false); } });
    opts.push({ label: 'Lowest fee first', fn: () => { S.sort = 'fee'; search(true); } },
              { label: 'Most experienced first', fn: () => { S.sort = 'experience'; search(true); } },
              { label: 'Change city', fn: () => { S.refine = true; askCity(); } },
              { label: 'Change experience', fn: () => { S.refine = true; askExp(); } },
              { label: 'Change fee', fn: () => { S.refine = true; askFee(); } },
              { label: 'Start over', fn: restart });
    chips(opts); lock(false, 'Ask me to sort or change something');
  }

  function card(d, rank, delay) {
    const el = document.createElement('article'); el.className = 'nc-doc'; el.style.setProperty('--d', delay + 's');
    el.innerHTML = `
      <span class="nc-rank">${rank}</span>
      <h6>${esc(d.name)}</h6>
      <p class="nc-q">${esc(d.qualifications)}</p>
      <div class="nc-badges">${d.pg ? '<span class="nc-badge">Postgraduate</span>' : ''}${d.online ? '<span class="nc-badge on">Online consult</span>' : ''}<span class="nc-badge">${esc(d.city)}</span></div>
      <div class="nc-meta">
        <div class="nc-exp"><small>Experience</small><b>${d.experience} years</b><div class="nc-bar"><i data-w="${Math.min(100, d.experience / 15 * 100)}%"></i></div></div>
        <div class="nc-fee"><small>Consultation</small><b>\u20b9${d.fee.toLocaleString('en-IN')}</b></div>
      </div>
      <p class="nc-loc">${PIN}<span>${esc(d.clinic)}${d.clinic.includes(d.state) ? '' : ', ' + esc(d.state)}</span></p>
      <div class="nc-acts">${d.map_url ? `<a href="${d.map_url}" target="_blank" rel="noopener">Open in Maps</a>` : ''}<button type="button">Copy details</button></div>`;
    const btn = el.querySelector('button');
    btn.onclick = async () => {
      const txt = `${d.name}\n${d.qualifications}\nExperience: ${d.experience} years\nFee: Rs ${d.fee}\n${d.clinic}, ${d.state}`;
      try { await navigator.clipboard.writeText(txt); btn.textContent = 'Copied'; btn.classList.add('ok'); }
      catch { btn.textContent = 'Copy failed'; }
      setTimeout(() => { btn.textContent = 'Copy details'; btn.classList.remove('ok'); }, 1500);
    };
    return el;
  }

  async function afterResults(text) {
    const t = text.toLowerCase();
    lock(true);
    if (/cheap|fee|price|low/.test(t)) { S.sort = 'fee'; return search(true); }
    if (/experience|senior|expert/.test(t)) { S.sort = 'experience'; return search(true); }
    if (/more|next/.test(t)) { S.offset += 6; return search(false); }
    if (/city|area|place|location/.test(t)) { S.refine = true; return askCity(); }
    if (/budget/.test(t)) { S.refine = true; return askFee(); }
    if (/start|restart|new|again|reset/.test(t)) return restart();
    await say('I can show more doctors, sort by fee or experience, change the city, experience or fee, or start over.');
    lock(false);
  }

  async function restart() {
    Object.assign(S, { cls: null, city: null, exp: 0, fee: null, sort: 'best', offset: 0, refine: false });
    await askClass();
  }

  /* ---------- open / close ---------- */
  function open(opts = {}) {
    if (opts.classIndex != null) S.lastScan = { index: opts.classIndex, label: STAGES[opts.classIndex] };
    tip.classList.remove('show'); launch.classList.add('hide'); panel.classList.add('open');
    if (!S.started) start();
    else if (opts.classIndex != null && !S.busy) { removeChips(); offerScan(opts.classIndex); }
    setTimeout(() => !input.disabled && input.focus({ preventScroll: true }), 500);
  }
  function close() { panel.classList.remove('open'); launch.classList.remove('hide'); }

  build();
  window.NetraChat = { open, close };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-open-chat]');
    if (t) { e.preventDefault(); open(); }
  });
})();
