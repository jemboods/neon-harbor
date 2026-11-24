// The HUD: cash and debt, wanted stars, clock and weather, the objective
// line, prompts, the style combo, the speedometer, the weapon wheel, the
// mod-shop menu and the live minimap. DOM text is rewritten only when it
// changes; the minimap redraws a few times a second.

import { MOD_SHOP, POIS, PROPERTIES, WEAPONS } from './config.js';

const money = (n) => `$${n.toLocaleString()}`;
const MAP_WORLD = 580; // metres spanned by the minimap

export function createHud(deps) {
  const { progression, police, world, missions } = deps;
  const el = (id) => document.getElementById(id);
  const cashEl = el('cash');
  const debtBarEl = el('debtbar');
  const debtTextEl = el('debttext');
  const starsEl = el('stars');
  const clockEl = el('clock');
  const weatherEl = el('weather');
  const objectiveEl = el('objective');
  const promptEl = el('prompt');
  const comboEl = el('combo');
  const comboMultEl = el('comboMult');
  const comboPtsEl = el('comboPts');
  const speedoEl = el('speedo');
  const toastEl = el('toast');
  const bannerEl = el('banner');
  const wheelEl = el('wheel');
  const mapCtx = el('minimap').getContext('2d');

  const cache = new Map();
  function setText(node, key, text) {
    if (cache.get(key) === text) return;
    cache.set(key, text);
    node.innerHTML = text;
  }
  let toastTimer = 0;
  let bannerTimer = 0;
  let mapTimer = 0;

  function drawMap(focus, focusAngle) {
    const S = 184;
    const scale = S / MAP_WORLD;
    const cx = S / 2;
    const cy = S / 2;
    mapCtx.fillStyle = '#0a1420';
    mapCtx.fillRect(0, 0, S, S);
    const toMap = (x, z) => [cx + (x - focus.x) * scale, cy + (z - focus.z) * scale];
    // Roads on the grid.
    mapCtx.strokeStyle = '#2c3646';
    mapCtx.lineWidth = 3;
    for (let k = -4; k <= 4; k++) {
      const [rx] = toMap(k * 56, 0);
      const [, rz] = toMap(0, k * 56);
      mapCtx.beginPath();
      mapCtx.moveTo(rx, 0);
      mapCtx.lineTo(rx, S);
      mapCtx.moveTo(0, rz);
      mapCtx.lineTo(S, rz);
      mapCtx.stroke();
    }
    // Water to the south.
    const [, wz] = toMap(0, 278);
    mapCtx.fillStyle = '#0d4a6b';
    mapCtx.fillRect(0, wz, S, S - wz);
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      if (mx < -6 || my < -6 || mx > S + 6 || my > S + 6) return;
      mapCtx.fillStyle = color;
      mapCtx.beginPath();
      mapCtx.arc(mx, my, r, 0, Math.PI * 2);
      mapCtx.fill();
    };
    for (const poi of POIS) dot(poi.x, poi.z, '#3d5a74', 2);
    for (const prop of PROPERTIES) dot(prop.x, prop.z, '#57f2a0', 3);
    dot(MOD_SHOP.x, MOD_SHOP.z, '#18c8e8', 3);
    const bounty = missions.bountyTarget();
    if (bounty) dot(bounty.x, bounty.z, '#ff4040', 3.5);
    for (const cruiser of police.cruisers) dot(cruiser.x, cruiser.z, '#4d8dff', 3);
    const marker = missions.markerPos();
    if (marker) dot(marker.x, marker.z, '#ffd23c', 4);
    // The player arrow (north-up map; heading a maps to a rotation of PI - a).
    mapCtx.save();
    mapCtx.translate(cx, cy);
    mapCtx.rotate(Math.PI - focusAngle);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4, 5);
    mapCtx.lineTo(-4, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    toast(text, seconds = 2.6) {
      toastEl.textContent = text;
      toastEl.style.opacity = '1';
      toastTimer = seconds;
    },
    banner(title, sub, seconds = 3.4) {
      el('bannerTitle').textContent = title;
      el('bannerSub').textContent = sub ?? '';
      bannerEl.classList.remove('hidden');
      bannerTimer = seconds;
    },
    setPrompt(text) {
      if (text) {
        promptEl.textContent = text;
        promptEl.classList.remove('hidden');
      } else {
        promptEl.classList.add('hidden');
      }
    },
    showWheel(weaponsApi) {
      wheelEl.innerHTML = WEAPONS.map((w, i) => {
        const sel = i === weaponsApi.selected ? ' sel' : '';
        return `<div class="slot${sel}"><b>${i + 1}. ${w.name}</b><span>${w.damage} dmg · mag ${w.mag}</span></div>`;
      }).join('') + '<div style="margin-top:8px;font-size:12px;color:#8fa8c8">Release Q to equip</div>';
      wheelEl.classList.remove('hidden');
    },
    hideWheel() {
      wheelEl.classList.add('hidden');
    },
    /** Render the mod shop menu; onBuy(row) is called from its buttons. */
    renderModShop(rows, carName, onBuy) {
      const body = el('modshopBody');
      body.innerHTML = `<div style="font-size:13px;color:#bcd2ee;margin-bottom:6px">${carName} · your cash ${money(progression.state.sideCash)}</div>`
        + rows.map((row, i) => `<div class="row"><span>${row.name}</span><span>${row.owned ? '<span style="color:#57f2a0">fitted</span>' : `<button data-row="${i}" ${!row.can || row.price > progression.state.sideCash ? 'disabled' : ''}>${row.price === 0 ? 'Fit' : money(row.price)}</button>`}</span></div>`).join('');
      body.querySelectorAll('button[data-row]').forEach((button) => {
        button.addEventListener('click', () => onBuy(rows[Number(button.dataset.row)]));
      });
    },
    update(dt, ctx) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.style.opacity = '0';
      bannerTimer -= dt;
      if (bannerTimer <= 0) bannerEl.classList.add('hidden');
      const s = progression.state;
      setText(cashEl, 'cash', money(s.sideCash));
      debtBarEl.style.width = `${Math.min(100, (s.storyEarned / 1000))}%`;
      setText(debtTextEl, 'debt', s.storyEarned >= 100000 ? 'Debt cleared — Kingpin of Azul' : `Debt left ${money(progression.debtLeft())} · ${progression.rank().name}`);
      const stars = police.stars;
      let starHtml = '';
      for (let i = 0; i < 5; i++) starHtml += i < stars ? '★' : '<span class="off">★</span>';
      if (police.bustMeter > 0.05) starHtml += ' <span style="color:#ff5a5a;font-size:15px">BUSTED…</span>';
      setText(starsEl, 'stars', starHtml);
      const rain = ctx.rain;
      setText(clockEl, 'clock', `${world.clockText()} · ${ctx.districtName}`);
      setText(weatherEl, 'weather', `${rain > 0.45 ? '🌧 Downpour' : rain > 0.08 ? '🌦 Showers' : '☀ Clear'}${ctx.radio ? ` · 📻 ${ctx.radio}` : ''}${ctx.drone ? ` · 🛸 ${Math.ceil(ctx.drone * 45)}s` : ''}`);
      const objective = missions.objective();
      setText(objectiveEl, 'obj', `${objective.title}${objective.sub ? `<small>${objective.sub}</small>` : ''}`);
      if (progression.stylePool > 0) {
        comboEl.classList.remove('hidden');
        setText(comboMultEl, 'cm', `x${progression.styleMult.toFixed(0)}`);
        setText(comboPtsEl, 'cp', `${Math.round(progression.stylePool)} style pts`);
      } else {
        comboEl.classList.add('hidden');
      }
      setText(speedoEl, 'spd', ctx.inCar ? `${Math.round(Math.abs(ctx.carSpeed) * 3.6)} km/h · ${ctx.weaponText}` : ctx.weaponText);
      mapTimer -= dt;
      if (mapTimer <= 0) {
        mapTimer = 0.12;
        drawMap(ctx.focus, ctx.focusAngle);
      }
    },
  };
}
