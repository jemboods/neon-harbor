// All 2D interface: HUD stats, the nautical-chart radar, subtitles, prompts,
// slams, the cargo-manifest phone, the weapon wheel and the overlay panels.
import { INK, WATER_Z, WEAPONS } from './config.js';

export const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Shift', 'Sprint / drift'], ['Space', 'Jump / handbrake'],
  ['E', 'Drive, talk, use'], ['Enter', 'Start job'], ['T', 'Phone'], ['Q (hold)', 'Weapon wheel'],
  ['Mouse', 'Aim, click fires'], ['G', 'Drone'], ['B', 'Call crew'], ['C', 'Radio'],
  ['Y', 'Take the gig'], ['U', 'Take the contract'], ['M', 'Mod shop'], ['V', 'Horn'],
  ['P', 'Photo mode'], ['H', 'Help'], ['Esc', 'Close / back'],
];
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function createHud() {
  const el = {};
  for (const id of ['hud', 'objective', 'objLabel', 'objText', 'toasts', 'clock', 'cash', 'debt', 'healthFill',
    'stars', 'weaponBox', 'radar', 'combo', 'comboMult', 'comboScore', 'bustWrap', 'bustFill', 'zoneName',
    'speedo', 'prompt', 'subtitle', 'centerMsg', 'phone', 'phoneTabs', 'phoneBody', 'jobcard', 'jcTitle',
    'jcText', 'jcPay', 'help', 'helpList', 'modmenu', 'modList', 'wheel', 'photoUi', 'chapter',
    'chapterTitle', 'chapterText', 'slam', 'slamWord', 'slamLine', 'title', 'titleControls', 'btnNew',
    'btnContinue', 'fade', 'status']) el[id] = $(id);
  const controlsHtml = CONTROLS.map(([k, v]) => `<div class="ctl"><span>${v}</span><b>${k}</b></div>`).join('');
  el.helpList.innerHTML = controlsHtml;
  el.titleControls.innerHTML = controlsHtml;
  const rctx = el.radar.getContext('2d');
  let subTimer = 0, zoneTimer = 0, centerTimer = 0;
  const api = {
    el,
    show(id, on = true) { el[id].classList.toggle('hidden', !on); },
    setTitle(on, hasSave) {
      api.show('title', on);
      el.btnContinue.classList.toggle('hidden', !hasSave);
      api.show('hud', !on);
    },
    toast(text, seconds = 4) {
      const d = document.createElement('div');
      d.className = 'toast'; d.textContent = text;
      el.toasts.appendChild(d);
      while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
      setTimeout(() => d.remove(), seconds * 1000);
    },
    subtitle(speaker, text, seconds = 4) {
      el.subtitle.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : text;
      api.show('subtitle', true);
      subTimer = seconds;
    },
    prompt(text) {
      if (text) { el.prompt.textContent = text; api.show('prompt', true); }
      else api.show('prompt', false);
    },
    objective(label, text) {
      if (!text) { api.show('objective', false); return; }
      el.objLabel.textContent = label || '';
      el.objText.textContent = text;
      api.show('objective', true);
    },
    centerMsg(text, seconds = 2) {
      el.centerMsg.textContent = text;
      api.show('centerMsg', !!text);
      centerTimer = seconds;
    },
    zone(name) {
      el.zoneName.textContent = name;
      el.zoneName.style.opacity = 1;
      zoneTimer = 3.4;
    },
    slam(kind, word, line) {
      el.slamWord.textContent = word;
      el.slamWord.className = kind;
      el.slamLine.textContent = line || '';
      api.show('slam', true);
      el.status.textContent = word;
    },
    hideSlam() { api.show('slam', false); },
    fade(on) { el.fade.classList.toggle('on', on); },
    chapter(title, text, seconds = 4) {
      el.chapterTitle.textContent = title;
      el.chapterText.textContent = text;
      api.show('chapter', true);
      setTimeout(() => api.show('chapter', false), seconds * 1000);
    },
    jobCard(job) {
      if (!job) { api.show('jobcard', false); return; }
      el.jcTitle.textContent = job.title;
      el.jcText.textContent = job.text;
      el.jcPay.textContent = 'Pays ' + money(job.pay);
      api.show('jobcard', true);
    },
    wheel(show, selected, weapons) {
      if (!show) { api.show('wheel', false); return; }
      el.wheel.innerHTML = WEAPONS.map((w, i) =>
        `<div class="slot ${i === selected ? 'sel' : ''}"><div>${w.name}</div><div class="ammo">${weapons[i].mag} / ${weapons[i].reserve}</div></div>`).join('')
        + `<div class="slot ${selected === -1 ? 'sel' : ''}"><div>Fists</div><div class="ammo">No heat</div></div>`;
      api.show('wheel', true);
    },
    modMenu(lines, selected) {
      if (!lines) { api.show('modmenu', false); return; }
      el.modList.innerHTML = lines.map((l, i) => `<div class="row ${i === selected ? 'sel' : ''}"><span>${l[0]}</span><span>${l[1]}</span></div>`).join('');
      api.show('modmenu', true);
    },
    phone(show, page, pages, title, bodyHtml) {
      if (!show) { api.show('phone', false); return; }
      el.phoneTabs.innerHTML = pages.map((p, i) => `<span class="${i === page ? 'sel' : ''}" data-page="${i}">${p}</span>`).join('');
      el.phoneBody.innerHTML = bodyHtml;
      $('phoneTitle').textContent = title;
      api.show('phone', true);
    },
    /** Per-frame HUD refresh. view: {state, hour, speedKmh, driving, heatFresh} */
    update(dt, v) {
      const s = v.state;
      const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
      el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      el.cash.textContent = money(s.cash);
      el.debt.textContent = v.debtLeft > 0 ? `Debt left ${money(v.debtLeft)}` : 'Debt paid — the harbor is yours';
      el.healthFill.style.width = Math.max(0, s.health) + '%';
      el.healthFill.classList.toggle('low', s.health < 30);
      el.stars.innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= s.stars ? 'on' : ''}">★</span>`).join('');
      el.stars.classList.toggle('flash', v.heatFresh && s.stars > 0);
      el.weaponBox.textContent = s.weapon >= 0 ? `${WEAPONS[s.weapon].name} — ${s.weapons[s.weapon].mag} / ${s.weapons[s.weapon].reserve}` : '';
      if (s.bust > 0.5) {
        api.show('bustWrap', true);
        el.bustFill.style.width = s.bust + '%';
      } else api.show('bustWrap', false);
      if (v.driving) {
        el.speedo.innerHTML = `${Math.round(v.speedKmh)} <small>km/h</small>`;
        api.show('speedo', true);
      } else api.show('speedo', false);
      if (s.combo.timer > 0 && s.combo.mult > 1) {
        api.show('combo', true);
        el.comboMult.textContent = 'x' + s.combo.mult.toFixed(1).replace('.0', '');
        el.comboScore.textContent = money(s.combo.score) + ' in play';
      } else api.show('combo', false);
      if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) api.show('subtitle', false); }
      if (zoneTimer > 0) { zoneTimer -= dt; if (zoneTimer <= 0) el.zoneName.style.opacity = 0; }
      if (centerTimer > 0) { centerTimer -= dt; if (centerTimer <= 0) api.show('centerMsg', false); }
    },
    /** Radar as a nautical chart. view: {px, pz, fx, fz, markers, range} */
    drawRadar(v) {
      const g = rctx, C = 95, R = 88, scale = R / v.range;
      g.clearRect(0, 0, 190, 190);
      g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2);
      g.fillStyle = INK.azul; g.fill();
      g.save();
      g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
      // Chart grid: the street lattice, faint foam strokes.
      g.strokeStyle = 'rgba(234,246,255,.16)'; g.lineWidth = 1;
      const pitchPx = 110 * scale;
      const ox = C - ((v.px % 110) + 110) % 110 * scale, oz = C - ((v.pz % 110) + 110) % 110 * scale;
      for (let x = ox % pitchPx; x < 190; x += pitchPx) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 190); g.stroke(); }
      for (let y = oz % pitchPx; y < 190; y += pitchPx) { g.beginPath(); g.moveTo(0, y); g.lineTo(190, y); g.stroke(); }
      // Coastline: the quay edge where the water starts.
      const wy = C + (WATER_Z - v.pz) * scale;
      if (wy > -20 && wy < 210) {
        g.strokeStyle = 'rgba(234,246,255,.35)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, wy);
        for (let x = 0; x <= 190; x += 14) g.lineTo(x, wy + Math.sin(x * 0.11 + v.px * 0.01) * 2.5);
        g.stroke();
        g.fillStyle = 'rgba(10,50,71,.85)';
        g.fillRect(0, wy + 2, 190, 190 - wy);
      }
      g.restore();
      // Markers: typed dots with labels that flip side, clamped to the rim.
      g.font = '600 10px Saira, sans-serif';
      const labelRows = { left: [], right: [], center: [] }; // rim labels yield instead of stacking
      for (const m of v.markers) {
        let dx = (m.x - v.px) * scale, dy = (m.z - v.pz) * scale;
        const d = Math.hypot(dx, dy), lim = R - 9;
        const far = d > lim;
        if (far && !m.always && d > R * 2.6) continue;
        if (far) { dx = dx / d * lim; dy = dy / d * lim; }
        const x = C + dx, y = C + dy, r = m.big ? 5.5 : 3.6;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = m.color; g.fill();
        g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,.65)'; g.stroke();
        // Labels stay readable: places and the mission always carry one, the
        // rest only when near; far markers ride the rim as bare dots.
        if (!(m.big || m.tag === 'place' || m.dist < 140)) continue;
        const label = far ? `${m.label} — ${Math.round(m.dist)} m` : m.label;
        const side = dx < -R * 0.35 ? 'left' : dx > R * 0.35 ? 'right' : 'center';
        if (!m.big && labelRows[side].some((ly) => Math.abs(ly - y) < 11)) continue;
        labelRows[side].push(y);
        g.fillStyle = m.big ? INK.farol : INK.espuma;
        g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
        if (side === 'left') { g.textAlign = 'left'; g.fillText(label, x + r + 3, y + 3); }
        else if (side === 'right') { g.textAlign = 'right'; g.fillText(label, x - r - 3, y + 3); }
        else { g.textAlign = 'center'; g.fillText(label, x, y - r - 4); }
        g.shadowBlur = 0;
      }
      // Player arrow rotates with heading; Farol tick at the rim marks north of travel.
      const a = Math.atan2(v.fx, -v.fz);
      g.save();
      g.translate(C, C); g.rotate(a);
      g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath();
      g.fillStyle = INK.espuma; g.fill();
      g.restore();
      g.beginPath(); g.arc(C, C, R - 1, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(234,246,255,.35)'; g.lineWidth = 1.5; g.stroke();
    },
  };
  return api;
}
export { money };
