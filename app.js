// ================================================================
//  BIKE CONFIG TRACKER — app.js
// ================================================================

// ──────────── CONFIG ────────────
const SUPABASE_URL = 'https://lrzgcqoqcwicpuuuhaoj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uunR3UQ9rttiK8dG85IedQ__Tn1duVK';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const COOKIE = 'bikeconfig_user_id';

const BAUGRUPPE_ORDER = [
  'Frameset','Schaltgruppe','Fahrwerk','Sitzen',
  'Cockpit','Bremsen','Hinterrad','Vorderrad','Vorderrrad','Sonstiges'
];
const BAUGRUPPE_OPTIONS = [
  'Frameset','Schaltgruppe','Fahrwerk','Sitzen',
  'Cockpit','Bremsen','Hinterrad','Vorderrad','Sonstiges'
];

// ──────────── STATE ────────────
const S = {
  uid:          null,
  tab:          'bikes',
  bikeId:       null,
  bikes:        [],
  components:   [],
  suspComps:    [],
  suspSettings: {},   // { [compId]: [...settings] }
  serviceLog:   [],
  suspCompId:   null, // drill-down
};

// ──────────── USER-ID (Cookie) ────────────
function getUserId() {
  const name = COOKIE + '=';
  for (let c of document.cookie.split(';')) {
    c = c.trim();
    if (c.startsWith(name)) return c.substring(name.length);
  }
  const id = crypto.randomUUID();
  document.cookie = `${COOKIE}=${id};max-age=31536000;path=/`;
  return id;
}

// ──────────── HELPERS ────────────
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function openModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modal-bg').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Focus first input after animation
  setTimeout(() => {
    const first = document.querySelector('#modal input, #modal textarea, #modal select');
    if (first) first.focus();
  }, 320);
}

function closeModal() {
  document.getElementById('modal-bg').classList.add('hidden');
  document.body.style.overflow = '';
}

function fmtPrice(p) {
  if (p == null || p === '') return '';
  return Number(p).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function fmtSag(v) {
  if (v == null || v === '') return '';
  return Number(v).toFixed(1) + '%';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function getNum(id) {
  const v = getVal(id);
  return v === '' ? null : parseFloat(v);
}

function getInt(id) {
  const v = getVal(id);
  return v === '' ? null : parseInt(v, 10);
}

function lastBodyWeight() {
  const all = Object.values(S.suspSettings).flat().filter(s => s.body_weight);
  if (!all.length) return 95.7;
  return all.sort((a, b) => new Date(b.setting_date) - new Date(a.setting_date))[0].body_weight;
}

// ──────────── DATA LOADING ────────────
async function loadBikes() {
  const { data, error } = await sb
    .from('bikes').select('*').eq('user_id', S.uid).order('created_at');
  if (error) { toast('Fehler beim Laden der Räder', 'err'); return; }
  S.bikes = data || [];
  // Keep bikeId valid
  if (S.bikeId && !S.bikes.find(b => b.id === S.bikeId))
    S.bikeId = S.bikes[0]?.id ?? null;
  if (!S.bikeId && S.bikes.length)
    S.bikeId = S.bikes[0].id;
}

async function loadComponents() {
  if (!S.bikeId) { S.components = []; return; }
  const { data, error } = await sb
    .from('bike_components').select('*')
    .eq('bike_id', S.bikeId).order('baugruppe').order('created_at');
  if (error) { toast('Fehler beim Laden der Bauteile', 'err'); return; }
  S.components = data || [];
}

async function loadSuspComps() {
  if (!S.bikeId) { S.suspComps = []; return; }
  const { data, error } = await sb
    .from('suspension_components').select('*')
    .eq('bike_id', S.bikeId).order('created_at');
  if (error) { toast('Fehler beim Laden des Fahrwerks', 'err'); return; }
  S.suspComps = data || [];
}

async function loadSuspSettings(compId) {
  if (S.suspSettings[compId]) return; // cached
  const { data, error } = await sb
    .from('suspension_settings').select('*')
    .eq('component_id', compId)
    .order('setting_date', { ascending: false });
  if (error) { toast('Fehler beim Laden der Settings', 'err'); return; }
  S.suspSettings[compId] = data || [];
}

async function loadService() {
  const q = sb.from('service_log').select('*').eq('user_id', S.uid);
  if (S.bikeId) q.eq('bike_id', S.bikeId);
  const { data, error } = await q.order('service_date', { ascending: false });
  if (error) { toast('Fehler beim Laden des Service', 'err'); return; }
  S.serviceLog = data || [];
}

// ──────────── NAVIGATION ────────────
async function setTab(tab) {
  S.tab = tab;
  S.suspCompId = null;
  document.querySelectorAll('.nav-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  await loadTabData();
  render();
}

async function loadTabData() {
  if (S.tab === 'bikes') {
    await loadBikes();
  } else if (S.tab === 'bauteile') {
    await loadBikes(); await loadComponents();
  } else if (S.tab === 'fahrwerk') {
    await loadBikes(); await loadSuspComps();
  } else if (S.tab === 'service') {
    await loadBikes(); await loadService();
  }
}

async function selectBike(id) {
  S.bikeId       = id;
  S.suspCompId   = null;
  S.suspSettings = {};
  S.components   = [];
  S.suspComps    = [];
  S.serviceLog   = [];
  await loadTabData();
  render();
}

async function openSuspHistory(compId) {
  S.suspCompId = compId;
  await loadSuspSettings(compId);
  render();
}

// ──────────── RENDER ────────────
function render() {
  const view = document.getElementById('view');
  view.scrollTop = 0;
  if (S.tab === 'bikes')     renderBikes();
  else if (S.tab === 'bauteile')  renderBauteile();
  else if (S.tab === 'fahrwerk')  renderFahrwerk();
  else if (S.tab === 'service')   renderService();
}

// ── Bikes ──
function renderBikes() {
  const v = document.getElementById('view');
  if (!S.bikes.length) {
    v.innerHTML = `
      <div class="page-hdr">
        <h1>Meine Räder</h1>
        <button class="btn-add" onclick="showBikeForm()">+ Neu</button>
      </div>
      <div class="empty">
        <div class="empty-icon">🚵</div>
        <p>Noch kein Fahrrad angelegt</p>
        <button class="btn-empty" onclick="showBikeForm()">Erstes Rad hinzufügen</button>
      </div>`;
    return;
  }
  v.innerHTML = `
    <div class="page-hdr">
      <h1>Meine Räder</h1>
      <button class="btn-add" onclick="showBikeForm()">+ Neu</button>
    </div>
    <div class="card-list">
      ${S.bikes.map(b => `
        <div class="card bike-card ${b.id === S.bikeId ? 'selected' : ''}"
             onclick="selectBike('${b.id}')">
          <div class="bike-card-main">
            <div class="bike-card-info">
              <div class="bike-name">${b.name}</div>
              ${[b.brand, b.model_year, b.color].filter(Boolean).join(' · ')
                ? `<div class="bike-sub">${[b.brand, b.model_year, b.color].filter(Boolean).join(' · ')}</div>` : ''}
              ${b.notes ? `<div class="bike-notes">${b.notes}</div>` : ''}
            </div>
            <div class="bike-card-actions">
              <button class="btn-icon" onclick="event.stopPropagation();showBikeForm('${b.id}')">✏️</button>
              <button class="btn-icon danger" onclick="event.stopPropagation();deleteBike('${b.id}')">🗑️</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Bike chip selector ──
function renderBikeChips() {
  if (!S.bikes.length)
    return `<div class="chip-row"><span class="chip-hint">Zuerst ein Rad anlegen</span></div>`;
  return `<div class="chip-row">
    ${S.bikes.map(b =>
      `<button class="chip ${b.id === S.bikeId ? 'active' : ''}"
               onclick="selectBike('${b.id}')">${b.name}</button>`
    ).join('')}
  </div>`;
}

// ── Bauteile ──
function renderBauteile() {
  const v = document.getElementById('view');
  if (!S.bikes.length) {
    v.innerHTML = renderBikeChips()
      + `<div class="empty"><div class="empty-icon">🔧</div><p>Zuerst ein Fahrrad anlegen</p></div>`;
    return;
  }

  const totalVal = S.components.reduce((s, c) => s + (parseFloat(c.preis) || 0), 0);

  // Group by Baugruppe
  const grouped = {};
  S.components.forEach(c => {
    (grouped[c.baugruppe] = grouped[c.baugruppe] || []).push(c);
  });
  const groups = BAUGRUPPE_ORDER.filter(g => grouped[g]);
  Object.keys(grouped).forEach(g => { if (!groups.includes(g)) groups.push(g); });

  const bodyHtml = groups.length === 0
    ? `<div class="empty"><div class="empty-icon">🔩</div><p>Noch keine Bauteile</p>
        <button class="btn-empty" onclick="showComponentForm()">Bauteil hinzufügen</button></div>`
    : groups.map(g => `
        <div class="group-section">
          <div class="group-hdr">${g}</div>
          ${grouped[g].map(c => `
            <div class="comp-row">
              <div class="comp-info">
                <div class="comp-name">${c.komponente}</div>
                ${[c.marke, c.produktname].filter(Boolean).length
                  ? `<div class="comp-sub">${[c.marke, c.produktname].filter(Boolean).join(' · ')}</div>` : ''}
                ${c.infos ? `<div class="comp-notes">${c.infos}</div>` : ''}
                <div class="comp-meta">
                  ${c.preis ? `<span class="comp-price">${fmtPrice(c.preis)}</span>` : ''}
                  ${c.gekauft ? `<span class="comp-date">${fmtDate(c.gekauft)}</span>` : ''}
                </div>
              </div>
              <div class="comp-actions">
                <button class="btn-icon" onclick="showComponentForm('${c.id}')">✏️</button>
                <button class="btn-icon danger" onclick="deleteComponent('${c.id}')">🗑️</button>
              </div>
            </div>`).join('')}
        </div>`).join('');

  v.innerHTML = `
    ${renderBikeChips()}
    <div class="page-hdr">
      <h1>Bauteile</h1>
      <button class="btn-add" onclick="showComponentForm()">+ Neu</button>
    </div>
    ${totalVal > 0
      ? `<div class="total-bar">
           <span class="total-bar-lbl">Gesamtwert</span>
           <span class="total-bar-val">${fmtPrice(totalVal)}</span>
         </div>` : ''}
    ${bodyHtml}`;
}

// ── Fahrwerk dispatcher ──
function renderFahrwerk() {
  if (S.suspCompId) renderSuspHistory();
  else renderSuspList();
}

function renderSuspList() {
  const v = document.getElementById('view');
  if (!S.bikes.length) {
    v.innerHTML = renderBikeChips()
      + `<div class="empty"><div class="empty-icon">⚙️</div><p>Zuerst ein Fahrrad anlegen</p></div>`;
    return;
  }

  const cards = S.suspComps.length === 0
    ? `<div class="empty">
         <div class="empty-icon">⚙️</div>
         <p>Keine Fahrwerkskomponenten</p>
         <button class="btn-empty" onclick="showSuspCompForm()">Komponente hinzufügen</button>
       </div>`
    : S.suspComps.map(comp => {
        const cached = S.suspSettings[comp.id];
        const latest = cached?.[0] ?? null;
        const count  = cached ? cached.length : '?';
        const isFork = comp.typ === 'federgabel';

        return `
          <div class="susp-card">
            <div class="susp-card-hdr">
              <div>
                <div class="susp-name">${comp.name}</div>
                <div class="susp-type">
                  ${isFork ? '🍴 Federgabel' : '🔵 Dämpfer'}
                  ${comp.serial ? ' · <small>' + comp.serial + '</small>' : ''}
                </div>
              </div>
              <div class="susp-card-btns">
                <button class="btn-icon" onclick="showSuspCompForm('${comp.id}')">✏️</button>
                <button class="btn-icon danger" onclick="deleteSuspComp('${comp.id}')">🗑️</button>
              </div>
            </div>
            ${latest ? `
              <div class="susp-latest-meta">
                <span>📅 ${fmtDate(latest.setting_date)}</span>
                ${latest.location ? `<span>📍 ${latest.location}</span>` : ''}
              </div>
              <div class="badges">
                ${latest.psi       != null ? badge('PSI', latest.psi) : ''}
                ${latest.sag       != null ? badge('SAG', fmtSag(latest.sag)) : ''}
                ${latest.lsc       != null ? badge('LSC', latest.lsc) : ''}
                ${latest.hsc       != null ? badge('HSC', latest.hsc) : ''}
                ${latest.lsr       != null ? badge('LSR', latest.lsr) : ''}
                ${latest.hsr       != null ? badge('HSR', latest.hsr) : ''}
                ${latest.rebound   != null ? badge('REB', latest.rebound) : ''}
                ${latest.federharte != null ? badge('Feder', latest.federharte) : ''}
              </div>` : `<div class="susp-no-data">Noch keine Einstellungen</div>`}
            <button class="btn-history" onclick="openSuspHistory('${comp.id}')">
              Verlauf${cached ? ' (' + count + ')' : ''} →
            </button>
          </div>`;
      }).join('');

  v.innerHTML = `
    ${renderBikeChips()}
    <div class="page-hdr">
      <h1>Fahrwerk</h1>
      <button class="btn-add" onclick="showSuspCompForm()">+ Neu</button>
    </div>
    <div class="card-list">${cards}</div>`;
}

async function renderSuspHistory() {
  const v    = document.getElementById('view');
  const comp = S.suspComps.find(c => c.id === S.suspCompId);
  if (!comp) { S.suspCompId = null; renderSuspList(); return; }

  await loadSuspSettings(S.suspCompId);
  const settings = S.suspSettings[S.suspCompId] || [];
  const isFork = comp.typ === 'federgabel';

  const maxBadges = [
    comp.psi_max            ? `PSI max. ${comp.psi_max}` : '',
    comp.lsc_max            ? `LSC max. ${comp.lsc_max}` : '',
    comp.hsc_max            ? `HSC max. ${comp.hsc_max}` : '',
    isFork && comp.lsr_max  ? `LSR max. ${comp.lsr_max}` : '',
    isFork && comp.hsr_max  ? `HSR max. ${comp.hsr_max}` : '',
    comp.rebound_max        ? `REB max. ${comp.rebound_max}` : '',
    comp.volume_spacer_max  ? `VS max. ${comp.volume_spacer_max}` : '',
  ].filter(Boolean);

  const entries = settings.length === 0
    ? `<div class="empty">
         <div class="empty-icon">📊</div>
         <p>Noch keine Einstellungen</p>
         <button class="btn-empty" onclick="showSuspSettingForm()">Setting hinzufügen</button>
       </div>`
    : `<div class="card-list">
         ${settings.map(s => `
           <div class="entry-card">
             <div class="entry-hdr">
               <div>
                 <div class="entry-date">${fmtDate(s.setting_date)}</div>
                 ${s.location    ? `<div class="entry-loc">📍 ${s.location}</div>` : ''}
                 ${s.body_weight ? `<div class="entry-loc">⚖️ ${s.body_weight} kg</div>` : ''}
               </div>
               <div class="comp-actions">
                 <button class="btn-icon" onclick="showSuspSettingForm('${s.id}')">✏️</button>
                 <button class="btn-icon danger" onclick="deleteSuspSetting('${s.id}')">🗑️</button>
               </div>
             </div>
             <div class="badges">
               ${s.kartusche   ? badge('Kartusche', s.kartusche, 'wide') : ''}
               ${s.federharte  != null ? badge('Feder', s.federharte) : ''}
               ${s.psi         != null ? badge('PSI', s.psi) : ''}
               ${s.volume_spacer ? badge('VS', s.volume_spacer) : ''}
               ${s.sag         != null ? badge('SAG', fmtSag(s.sag)) : ''}
               ${s.lsc         != null ? badge('LSC', s.lsc) : ''}
               ${s.hsc         != null ? badge('HSC', s.hsc) : ''}
               ${s.lsr         != null ? badge('LSR', s.lsr) : ''}
               ${s.hsr         != null ? badge('HSR', s.hsr) : ''}
               ${s.rebound     != null ? badge('REB', s.rebound) : ''}
             </div>
             ${s.notes ? `<div class="entry-notes">${s.notes}</div>` : ''}
           </div>`).join('')}
       </div>`;

  v.innerHTML = `
    <div class="page-hdr hist-hdr">
      <button class="btn-back" onclick="S.suspCompId=null;render()">← Zurück</button>
      <button class="btn-add" onclick="showSuspSettingForm()">+ Neu</button>
    </div>
    <div class="history-comp-hdr">
      <div class="susp-name">${comp.name}</div>
      <div class="susp-type">${isFork ? '🍴 Federgabel' : '🔵 Dämpfer'}${comp.serial ? ' · ' + comp.serial : ''}</div>
      ${maxBadges.length
        ? `<div class="max-badges">${maxBadges.map(m => `<span class="max-badge">${m}</span>`).join('')}</div>` : ''}
      <div class="hint-clicks">Clicks immer vom voll geschlossen (voll im Uhrzeigersinn) Anschlag (= 0) zählen</div>
    </div>
    ${entries}
    <button class="fab" onclick="showSuspSettingForm()">＋</button>`;
}

function badge(lbl, val, cls = '') {
  return `<div class="badge ${cls}">
    <div class="badge-lbl">${lbl}</div>
    <div class="badge-val">${val}</div>
  </div>`;
}

// ── Service ──
function renderService() {
  const v = document.getElementById('view');
  const entries = S.serviceLog.length === 0
    ? `<div class="empty">
         <div class="empty-icon">🔧</div>
         <p>Noch keine Service-Einträge</p>
         <button class="btn-empty" onclick="showServiceForm()">Eintrag hinzufügen</button>
       </div>`
    : `<div class="card-list">
         ${S.serviceLog.map(s => `
           <div class="svc-card">
             <div class="svc-hdr">
               <div>
                 <div class="svc-comp">${s.component_name}</div>
                 <div class="svc-date">📅 ${fmtDate(s.service_date)}</div>
               </div>
               <div class="comp-actions">
                 <button class="btn-icon" onclick="showServiceForm('${s.id}')">✏️</button>
                 <button class="btn-icon danger" onclick="deleteService('${s.id}')">🗑️</button>
               </div>
             </div>
             <div class="svc-work">${s.work_done}</div>
           </div>`).join('')}
       </div>`;

  v.innerHTML = `
    ${renderBikeChips()}
    <div class="page-hdr">
      <h1>Service</h1>
      <button class="btn-add" onclick="showServiceForm()">+ Neu</button>
    </div>
    ${entries}`;
}

// ──────────── FORMS ────────────

// ── Bike form ──
function showBikeForm(id) {
  const b = id ? S.bikes.find(x => x.id === id) : null;
  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">${b ? 'Rad bearbeiten' : 'Neues Rad'}</h2>
      <button class="btn-icon" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg"><label class="fi">Name *
        <input id="f-name" type="text" value="${b?.name || ''}" placeholder="z.B. Spindrift 4 Cf">
      </label></div>
      <div class="fg"><label class="fi">Marke
        <input id="f-brand" type="text" value="${b?.brand || ''}" placeholder="z.B. Propain">
      </label></div>
      <div class="form-row">
        <div class="fg"><label class="fi">Modelljahr
          <input id="f-year" type="number" value="${b?.model_year || ''}" placeholder="2024">
        </label></div>
        <div class="fg"><label class="fi">Farbe
          <input id="f-color" type="text" value="${b?.color || ''}">
        </label></div>
      </div>
      <div class="fg"><label class="fi">Notizen
        <textarea id="f-notes" rows="2">${b?.notes || ''}</textarea>
      </label></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
      <button class="btn-primary" onclick="saveBike('${id || ''}')">Speichern</button>
    </div>`);
}

async function saveBike(id) {
  const name = getVal('f-name');
  if (!name) { toast('Name ist Pflichtfeld', 'err'); return; }
  const data = {
    user_id:    S.uid,
    name,
    brand:      getVal('f-brand') || null,
    model_year: getInt('f-year'),
    color:      getVal('f-color') || null,
    notes:      getVal('f-notes') || null,
  };
  let error, newId;
  if (id) {
    ({ error } = await sb.from('bikes').update(data).eq('id', id).eq('user_id', S.uid));
  } else {
    const res = await sb.from('bikes').insert(data).select().single();
    error = res.error; newId = res.data?.id;
  }
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  if (newId) S.bikeId = newId;
  closeModal();
  toast(id ? 'Rad aktualisiert ✓' : 'Rad hinzugefügt ✓', 'ok');
  await loadBikes(); render();
}

async function deleteBike(id) {
  if (!confirm('Dieses Fahrrad und ALLE zugehörigen Daten löschen?')) return;
  const { error } = await sb.from('bikes').delete().eq('id', id).eq('user_id', S.uid);
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  if (S.bikeId === id) S.bikeId = null;
  S.suspSettings = {};
  toast('Gelöscht', 'ok');
  await loadBikes(); render();
}

// ── Component form ──
function showComponentForm(id) {
  const c = id ? S.components.find(x => x.id === id) : null;
  const gekauft = c?.gekauft ? c.gekauft.split('T')[0] : '';
  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">${c ? 'Bauteil bearbeiten' : 'Neues Bauteil'}</h2>
      <button class="btn-icon" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg"><label class="fi">Baugruppe *
        <select id="f-baugruppe">
          ${BAUGRUPPE_OPTIONS.map(g =>
            `<option ${c?.baugruppe === g ? 'selected' : ''}>${g}</option>`
          ).join('')}
        </select>
      </label></div>
      <div class="fg"><label class="fi">Komponente *
        <input id="f-komponente" type="text" value="${c?.komponente || ''}" placeholder="z.B. Federgabel">
      </label></div>
      <div class="fg"><label class="fi">Marke
        <input id="f-marke" type="text" value="${c?.marke || ''}">
      </label></div>
      <div class="fg"><label class="fi">Produktname
        <input id="f-produktname" type="text" value="${c?.produktname || ''}">
      </label></div>
      <div class="fg"><label class="fi">Infos / Notizen
        <textarea id="f-infos" rows="2">${c?.infos || ''}</textarea>
      </label></div>
      <div class="form-row">
        <div class="fg"><label class="fi">Gekauft
          <input id="f-gekauft" type="date" value="${gekauft}">
        </label></div>
        <div class="fg"><label class="fi">Preis (€)
          <input id="f-preis" type="number" step="0.01" min="0" value="${c?.preis || ''}">
        </label></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
      <button class="btn-primary" onclick="saveComponent('${id || ''}')">Speichern</button>
    </div>`);
}

async function saveComponent(id) {
  const komp = getVal('f-komponente');
  if (!komp) { toast('Komponente ist Pflichtfeld', 'err'); return; }
  const data = {
    bike_id:    S.bikeId,
    user_id:    S.uid,
    baugruppe:  getVal('f-baugruppe'),
    komponente: komp,
    marke:      getVal('f-marke') || null,
    produktname: getVal('f-produktname') || null,
    infos:      getVal('f-infos') || null,
    gekauft:    getVal('f-gekauft') || null,
    preis:      getNum('f-preis'),
  };
  let error;
  if (id) {
    ({ error } = await sb.from('bike_components').update(data).eq('id', id).eq('user_id', S.uid));
  } else {
    ({ error } = await sb.from('bike_components').insert(data));
  }
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  closeModal(); toast('Gespeichert ✓', 'ok');
  await loadComponents(); render();
}

async function deleteComponent(id) {
  if (!confirm('Bauteil wirklich löschen?')) return;
  const { error } = await sb.from('bike_components').delete().eq('id', id).eq('user_id', S.uid);
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  toast('Gelöscht', 'ok');
  await loadComponents(); render();
}

// ── Suspension component form ──
function showSuspCompForm(id) {
  const c = id ? S.suspComps.find(x => x.id === id) : null;
  const isFork = !c || c.typ === 'federgabel';
  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">${c ? 'Fahrwerk bearbeiten' : 'Neue Fahrwerkskomponente'}</h2>
      <button class="btn-icon" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg"><label class="fi">Bezeichnung *
        <input id="f-name" type="text" value="${c?.name || ''}" placeholder="z.B. Fox 38">
      </label></div>
      <div class="form-row">
        <div class="fg"><label class="fi">Typ *
          <select id="f-typ" onchange="toggleSuspFields()">
            <option value="federgabel" ${isFork ? 'selected' : ''}>Federgabel</option>
            <option value="daempfer"   ${!isFork ? 'selected' : ''}>Dämpfer</option>
          </select>
        </label></div>
        <div class="fg"><label class="fi">Seriennummer
          <input id="f-serial" type="text" value="${c?.serial || ''}">
        </label></div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Max-Werte (Klick-Anzeige)</div>
        <div class="form-row">
          <div class="fg"><label class="fi">PSI max
            <input id="f-psi-max" type="number" value="${c?.psi_max || ''}">
          </label></div>
          <div class="fg"><label class="fi">LSC max
            <input id="f-lsc-max" type="number" value="${c?.lsc_max || ''}">
          </label></div>
        </div>
        <div class="form-row">
          <div class="fg"><label class="fi">HSC max
            <input id="f-hsc-max" type="number" value="${c?.hsc_max || ''}">
          </label></div>
          <div id="wrap-lsr" class="fg"><label class="fi">LSR max
            <input id="f-lsr-max" type="number" value="${c?.lsr_max || ''}">
          </label></div>
        </div>
        <div class="form-row">
          <div id="wrap-hsr" class="fg"><label class="fi">HSR max
            <input id="f-hsr-max" type="number" value="${c?.hsr_max || ''}">
          </label></div>
          <div class="fg"><label class="fi">Rebound max
            <input id="f-rebound-max" type="number" value="${c?.rebound_max || ''}">
          </label></div>
        </div>
        <div class="form-row">
          <div class="fg"><label class="fi">Vol.-Spacer max
            <input id="f-vs-max" type="number" value="${c?.volume_spacer_max || ''}">
          </label></div>
          <div id="wrap-federharte" class="fg"><label class="fi">Federhärte (Standard)
            <input id="f-federharte" type="number" value="${c?.federharte_default || ''}">
          </label></div>
        </div>
      </div>

      <div class="fg"><label class="fi">Kartusche (Standard)
        <input id="f-kartusche" type="text" value="${c?.kartusche_default || ''}" placeholder="z.B. Grip2">
      </label></div>
      <div class="fg"><label class="fi">Notizen
        <textarea id="f-notes" rows="2">${c?.notes || ''}</textarea>
      </label></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
      <button class="btn-primary" onclick="saveSuspComp('${id || ''}')">Speichern</button>
    </div>`);
  toggleSuspFields();
}

function toggleSuspFields() {
  const isFork = getVal('f-typ') === 'federgabel';
  const show = (el, v) => { if (el) el.style.display = v ? '' : 'none'; };
  show(document.getElementById('wrap-lsr'), isFork);
  show(document.getElementById('wrap-hsr'), isFork);
  show(document.getElementById('wrap-federharte'), !isFork);
}

async function saveSuspComp(id) {
  const name = getVal('f-name');
  if (!name) { toast('Bezeichnung ist Pflichtfeld', 'err'); return; }
  const isFork = getVal('f-typ') === 'federgabel';
  const data = {
    bike_id:            S.bikeId,
    user_id:            S.uid,
    name,
    typ:                getVal('f-typ'),
    serial:             getVal('f-serial') || null,
    psi_max:            getInt('f-psi-max'),
    lsc_max:            getInt('f-lsc-max'),
    hsc_max:            getInt('f-hsc-max'),
    lsr_max:            isFork ? getInt('f-lsr-max') : null,
    hsr_max:            isFork ? getInt('f-hsr-max') : null,
    rebound_max:        getInt('f-rebound-max'),
    volume_spacer_max:  getInt('f-vs-max'),
    federharte_default: isFork ? null : getInt('f-federharte'),
    kartusche_default:  getVal('f-kartusche') || null,
    notes:              getVal('f-notes') || null,
  };
  let error;
  if (id) {
    ({ error } = await sb.from('suspension_components').update(data).eq('id', id).eq('user_id', S.uid));
  } else {
    ({ error } = await sb.from('suspension_components').insert(data));
  }
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  closeModal(); toast('Gespeichert ✓', 'ok');
  S.suspSettings = {};
  await loadSuspComps(); render();
}

async function deleteSuspComp(id) {
  if (!confirm('Fahrwerkskomponente und alle Settings löschen?')) return;
  const { error } = await sb.from('suspension_components').delete().eq('id', id).eq('user_id', S.uid);
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  S.suspCompId = null;
  delete S.suspSettings[id];
  toast('Gelöscht', 'ok');
  await loadSuspComps(); render();
}

// ── Suspension setting form ──
function showSuspSettingForm(id) {
  const comp = S.suspComps.find(c => c.id === S.suspCompId);
  if (!comp) return;
  const isFork = comp.typ === 'federgabel';
  const s = id ? (S.suspSettings[S.suspCompId] || []).find(x => x.id === id) : null;
  const date = s?.setting_date?.split('T')[0] ?? today();
  const weight = s?.body_weight ?? lastBodyWeight();

  // Helper: number field with optional max hint
  const nf = (lbl, fid, val, max) =>
    `<div class="fg"><label class="fi">${lbl}${max ? ` <span class="form-hint">max ${max}</span>` : ''}
       <input id="${fid}" type="number" step="1" value="${val ?? ''}">
     </label></div>`;
  const tf = (lbl, fid, val, ph = '') =>
    `<div class="fg"><label class="fi">${lbl}
       <input id="${fid}" type="text" value="${val ?? ''}" placeholder="${ph}">
     </label></div>`;

  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">${s ? 'Setting bearbeiten' : 'Neues Setting'} · ${comp.name}</h2>
      <button class="btn-icon" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="fg"><label class="fi">Datum
          <input id="f-date" type="date" value="${date}">
        </label></div>
        <div class="fg"><label class="fi">Körpergewicht (kg)
          <input id="f-weight" type="number" step="0.1" value="${weight}">
        </label></div>
      </div>
      ${tf('Ort / Trail', 'f-location', s?.location, 'z.B. Finale Ligure')}

      ${isFork
        ? tf('Kartusche', 'f-kartusche', s?.kartusche ?? comp.kartusche_default)
        : nf('Federhärte', 'f-federharte', s?.federharte ?? comp.federharte_default)}

      <div class="form-row">
        ${nf(`PSI${comp.psi_max ? '' : ''}`, 'f-psi', s?.psi, comp.psi_max)}
        ${tf('Volume Spacer', 'f-vs', s?.volume_spacer)}
      </div>
      <div class="form-row">
        <div class="fg"><label class="fi">SAG (%)
          <input id="f-sag" type="number" step="0.1" value="${s?.sag ?? ''}">
        </label></div>
        ${nf('LSC', 'f-lsc', s?.lsc, comp.lsc_max)}
      </div>

      ${isFork ? `
        <div class="form-row">
          ${nf('HSC', 'f-hsc', s?.hsc, comp.hsc_max)}
          ${nf('LSR', 'f-lsr', s?.lsr, comp.lsr_max)}
        </div>
        <div class="form-row">
          ${nf('HSR', 'f-hsr', s?.hsr, comp.hsr_max)}
          ${nf('Rebound', 'f-rebound', s?.rebound, comp.rebound_max)}
        </div>` : `
        <div class="form-row">
          ${nf('Rebound', 'f-rebound', s?.rebound, comp.rebound_max)}
          <div class="fg"></div>
        </div>`}

      <div class="fg"><label class="fi">Notizen
        <textarea id="f-notes" rows="2">${s?.notes || ''}</textarea>
      </label></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
      <button class="btn-primary" onclick="saveSuspSetting('${id || ''}')">Speichern</button>
    </div>`);
}

async function saveSuspSetting(id) {
  const comp = S.suspComps.find(c => c.id === S.suspCompId);
  if (!comp) return;
  const isFork = comp.typ === 'federgabel';
  const data = {
    component_id:  S.suspCompId,
    user_id:       S.uid,
    setting_date:  getVal('f-date') || today(),
    location:      getVal('f-location') || null,
    body_weight:   getNum('f-weight'),
    kartusche:     isFork ? (getVal('f-kartusche') || null) : null,
    federharte:    isFork ? null : getInt('f-federharte'),
    psi:           getNum('f-psi'),
    volume_spacer: getVal('f-vs') || null,
    sag:           getNum('f-sag'),
    lsc:           getInt('f-lsc'),
    hsc:           isFork ? getInt('f-hsc') : null,
    lsr:           isFork ? getInt('f-lsr') : null,
    hsr:           isFork ? getInt('f-hsr') : null,
    rebound:       getInt('f-rebound'),
    notes:         getVal('f-notes') || null,
  };
  let error;
  if (id) {
    ({ error } = await sb.from('suspension_settings').update(data).eq('id', id).eq('user_id', S.uid));
  } else {
    ({ error } = await sb.from('suspension_settings').insert(data));
  }
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  closeModal(); toast('Gespeichert ✓', 'ok');
  delete S.suspSettings[S.suspCompId]; // bust cache
  await loadSuspSettings(S.suspCompId);
  render();
}

async function deleteSuspSetting(id) {
  if (!confirm('Dieses Setting löschen?')) return;
  const { error } = await sb.from('suspension_settings').delete().eq('id', id).eq('user_id', S.uid);
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  toast('Gelöscht', 'ok');
  delete S.suspSettings[S.suspCompId];
  await loadSuspSettings(S.suspCompId);
  render();
}

// ── Service form ──
function showServiceForm(id) {
  const s = id ? S.serviceLog.find(x => x.id === id) : null;
  const date = s?.service_date?.split('T')[0] ?? today();

  // Datalist options from known components + bikes
  const opts = [
    ...S.suspComps.map(c => c.name + (c.serial ? ` (${c.serial})` : '')),
    ...S.bikes.map(b => b.name),
  ];

  openModal(`
    <div class="modal-header">
      <h2 class="modal-title">${s ? 'Service bearbeiten' : 'Neuer Service-Eintrag'}</h2>
      <button class="btn-icon" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="fg"><label class="fi">Produkt / Komponente *
        <input id="f-comp" type="text" value="${s?.component_name || ''}"
               list="dl-comps" placeholder="z.B. Fox 38 (836518-0209-T)">
        <datalist id="dl-comps">
          ${opts.map(n => `<option value="${n}">`).join('')}
        </datalist>
      </label></div>
      <div class="fg"><label class="fi">Datum
        <input id="f-date" type="date" value="${date}">
      </label></div>
      <div class="fg"><label class="fi">Durchgeführte Arbeiten *
        <textarea id="f-work" rows="4"
                  placeholder="z.B. Ölwechsel Casting + Luftkammer">${s?.work_done || ''}</textarea>
      </label></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
      <button class="btn-primary" onclick="saveService('${id || ''}')">Speichern</button>
    </div>`);
}

async function saveService(id) {
  const comp = getVal('f-comp');
  const work = getVal('f-work');
  if (!comp || !work) { toast('Alle Pflichtfelder ausfüllen', 'err'); return; }
  const data = {
    bike_id:        S.bikeId,
    user_id:        S.uid,
    component_name: comp,
    service_date:   getVal('f-date') || today(),
    work_done:      work,
  };
  let error;
  if (id) {
    ({ error } = await sb.from('service_log').update(data).eq('id', id).eq('user_id', S.uid));
  } else {
    ({ error } = await sb.from('service_log').insert(data));
  }
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  closeModal(); toast('Gespeichert ✓', 'ok');
  await loadService(); render();
}

async function deleteService(id) {
  if (!confirm('Service-Eintrag löschen?')) return;
  const { error } = await sb.from('service_log').delete().eq('id', id).eq('user_id', S.uid);
  if (error) { toast('Fehler: ' + error.message, 'err'); return; }
  toast('Gelöscht', 'ok');
  await loadService(); render();
}

// ──────────── INIT ────────────
document.getElementById('modal-bg').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

(async function init() {
  S.uid = getUserId();
  await loadBikes();
  setTab('bikes');
})();
