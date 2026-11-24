// The smartphone: Marisol's briefings and message log, the 20-job list
// with payouts, district standings, the player's assets (properties,
// garage, bounty board, contract offer) and the career page. T opens it,
// Tab cycles pages. Pure DOM over the game state; it never mutates play.

import { BOUNTIES, CHAPTERS, CONTRACTS, DISTRICTS, POIS, PROPERTIES, STORY } from './config.js';
import { SYSTEMS } from './systems.js';
import { districtName } from './world.js';

const PAGES = ['Jobs', 'Texts', 'City', 'Assets', 'Career', 'About'];
const money = (n) => `$${n.toLocaleString()}`;

export function createPhone(progression, missions) {
  const root = document.getElementById('phone');
  const body = document.getElementById('phoneBody');
  const tabs = document.getElementById('phoneTabs');
  let open = false;
  let page = 0;
  const messages = [{ from: 'Marisol', text: 'Welcome to Azul, amor. Twenty jobs between you and a clean slate. Start with the marina.' }];

  function jobsPage() {
    const index = progression.state.storyIndex;
    let html = '';
    let lastCh = -1;
    STORY.forEach((jobDef, i) => {
      if (jobDef.ch !== lastCh) {
        lastCh = jobDef.ch;
        html += `<h4>Chapter ${lastCh + 1} — ${CHAPTERS[lastCh]}</h4>`;
      }
      const state = i < index ? '<span class="good">✓ paid</span>' : i === index ? '<span class="good">● current</span>' : '<span class="dim">locked</span>';
      html += `<div class="row"><span>${i + 1}. ${jobDef.title}</span><span>${money(jobDef.payout)} · ${state}</span></div>`;
    });
    const current = STORY[index];
    return (current ? `<div class="msg"><b>Marisol:</b> ${current.text}</div>` : '<div class="msg"><b>Marisol:</b> The debt is dead. Azul is yours now.</div>') + html;
  }

  function textsPage() {
    return messages.slice(-14).reverse().map((m) => `<div class="msg"><b>${m.from}:</b> ${m.text}</div>`).join('');
  }

  function cityPage() {
    let html = '<h4>District standing</h4>';
    for (const d of DISTRICTS) {
      const level = progression.standingLevel(d.id);
      html += `<div class="row"><span>${d.name}</span><span>${'●'.repeat(level)}${'○'.repeat(4 - level)} <span class="dim">${progression.state.standing[d.id]} pts</span></span></div>`;
    }
    html += '<h4>Places</h4>';
    for (const poi of POIS) html += `<div class="row"><span>${poi.name}</span><span class="dim">${districtName(poi.district)}</span></div>`;
    return html;
  }

  function assetsPage() {
    let html = '<h4>Properties</h4>';
    for (const prop of PROPERTIES) {
      const owned = progression.state.properties.includes(prop.id);
      html += `<div class="row"><span>${prop.name}</span><span>${owned ? `<span class="good">owned · $${prop.rent}/min</span>` : money(prop.price)}</span></div>`;
    }
    const garage = progression.state.garage;
    html += `<div class="row"><span>Garage</span><span>${garage ? garage.modelName : '<span class="dim">empty</span>'}</span></div>`;
    html += '<h4>Bounty board</h4>';
    const active = missions.bountyDef();
    BOUNTIES.forEach((b, i) => {
      const done = i < BOUNTIES.indexOf(active);
      const state = b === active ? '<span class="bad">● active</span>' : done ? '<span class="good">✓ collected</span>' : '<span class="dim">queued</span>';
      html += `<div class="row"><span>${b.name} — ${districtName(b.district)}</span><span>${money(b.reward)} · ${state}</span></div>`;
    });
    const offer = missions.contractOffer();
    html += `<h4>Getaway contract (press U)</h4><div class="msg">${offer.client}: ${missionsWorldName(offer.from)} → ${missionsWorldName(offer.to)} in ${offer.seconds}s, stay under ${offer.starCap}★ — <b>${money(offer.fee)}</b></div>`;
    return html;
  }

  function missionsWorldName(poiId) {
    return POIS.find((p) => p.id === poiId)?.name ?? poiId;
  }

  function careerPage() {
    const s = progression.state;
    const rank = progression.rank();
    const next = progression.nextRank();
    const rows = [
      ['Rank', rank.name],
      ['Lifetime earnings', money(s.lifetime)],
      ['Next rank', next ? `${next.name} at ${money(next.at)}` : 'top of the city'],
      ['Side cash', money(s.sideCash)],
      ['Story repaid', `${money(s.storyEarned)} / $100,000`],
      ['Carjacks', s.stats.carjacks],
      ['Bounties collected', s.stats.bounties],
      ['Contracts done', s.stats.contracts],
      ['Gigs done', s.stats.gigs],
      ['Races won / run', `${s.stats.racesWon} / ${s.stats.racesRun}`],
      ['Stashes found', `${s.stashes.filter(Boolean).length} / 20`],
      ['Drone photos', s.stats.dronePhotos],
      ['Photo-mode shots', s.stats.photos],
      ['Shots fired', s.stats.shotsFired],
    ];
    return rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
  }

  function aboutPage() {
    return '<h4>Systems on board</h4>' + SYSTEMS.map((s) => `<div class="row"><span>${s.name}</span><span class="dim">${s.module.replace('src/', '')}</span></div>`).join('')
      + '<p class="dim">Neon Harbor: Streets of Azul. One seeded city, twenty jobs, a hundred grand of debt. Everything synthesized, everything offline.</p>';
  }

  const renderers = [jobsPage, textsPage, cityPage, assetsPage, careerPage, aboutPage];

  return {
    get isOpen() { return open; },
    pushMessage(text, from = 'Marisol') {
      messages.push({ from, text });
    },
    toggle() {
      open = !open;
      root.classList.toggle('hidden', !open);
      if (open) this.render();
      return open;
    },
    close() {
      open = false;
      root.classList.add('hidden');
    },
    nextPage() {
      page = (page + 1) % PAGES.length;
      if (open) this.render();
    },
    render() {
      if (!open) return;
      tabs.textContent = PAGES.map((p, i) => (i === page ? `[${p}]` : p)).join(' · ');
      body.innerHTML = renderers[page]();
    },
  };
}
