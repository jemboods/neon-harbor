// Neon Harbor: Streets of Azul — every constant and data table in one place.
// Pure data only: no imports, no browser calls, so Node (main.ts) can load this
// file at hand-in time and verify the shipped numbers against the brief.

export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-harbor-save-v7';
export const GAME_TITLE = 'Neon Harbor: Streets of Azul';
export const GAME_VERSION = '7.0.0';

// ---------------------------------------------------------------- the city grid
// Roads run on multiples of PITCH; blocks fill the squares between them.
// x grows east, z grows south; the harbour water lies past the south edge.
export const GRID = { half: 4, pitch: 56, block: 40, road: 16 };
export const CITY_EDGE = (GRID.half + 0.5) * GRID.pitch; // 252: last road centre + half pitch
export const WATER_Z = CITY_EDGE + 26; // water plane starts south of the promenade
export const DAY_LENGTH_SECONDS = 260;
export const NIGHT_START = 0.78; // day-cycle fraction where night begins
export const NIGHT_END = 0.22;

// ---------------------------------------------------------------- districts
export const DISTRICTS = [
  { id: 'palmas', name: 'Las Palmas', tint: 0x2e8f6e },
  { id: 'alto', name: 'Alto Azul', tint: 0x3f6fd8 },
  { id: 'mercado', name: 'Mercado', tint: 0xd88f2e },
  { id: 'centro', name: 'Centro', tint: 0x8f4fd8 },
  { id: 'harbor', name: 'Old Harbor', tint: 0x5a7d8c },
  { id: 'playa', name: 'Playa Este', tint: 0xd85f8f },
];

// Points of interest: name, district and a ground position on a street
// corner (road lines run on multiples of 56), so a POI is always reachable
// on foot and by car — never inside a building footprint.
export const POIS = [
  { id: 'bank', name: 'Azul Bank', district: 'centro', x: 56, z: -56 },
  { id: 'needle', name: 'Sky Needle', district: 'centro', x: -28, z: 50 },
  { id: 'marina', name: 'Neon Marina', district: 'harbor', x: -112, z: 224 },
  { id: 'lighthouse', name: 'Harbor Lighthouse', district: 'harbor', x: 56, z: 224 },
  { id: 'crane', name: 'Dockyard Crane', district: 'harbor', x: -224, z: 168 },
  { id: 'casino', name: 'Playa Casino', district: 'playa', x: 168, z: 168 },
  { id: 'market', name: 'Mercado Central', district: 'mercado', x: -168, z: 0 },
  { id: 'museum', name: 'Azul Museum', district: 'alto', x: 168, z: -168 },
  { id: 'hotel', name: 'Palm Court Hotel', district: 'palmas', x: -168, z: -168 },
  { id: 'volthub', name: 'Volt Charging Hub', district: 'alto', x: 112, z: -112 },
];

// ---------------------------------------------------------------- vehicles
// topSpeed in m/s, accel in m/s^2, grip scales steering bite, size is length/width.
export const VEHICLES = [
  { id: 'voltgt', name: 'Aurora Volt GT', topSpeed: 52, accel: 17, grip: 1.15, len: 4.4, wid: 1.9, color: 0x18c8e8, tier: 3 },
  { id: 'fluxs', name: 'Meridian Flux S', topSpeed: 42, accel: 12, grip: 1.0, len: 4.6, wid: 1.9, color: 0xb8c4d4, tier: 2 },
  { id: 'royale', name: 'Castellan Royale', topSpeed: 40, accel: 11, grip: 0.95, len: 5.2, wid: 2.0, color: 0x2a2f3a, tier: 3 },
  { id: 'corso', name: 'Vanta Corso', topSpeed: 47, accel: 15, grip: 1.1, len: 4.0, wid: 1.8, color: 0xe83a5f, tier: 2 },
  { id: 'city', name: 'Ordina City', topSpeed: 36, accel: 10, grip: 1.0, len: 3.8, wid: 1.7, color: 0x7dd84a, tier: 1 },
  { id: 'micro', name: 'Pico Micro', topSpeed: 29, accel: 9, grip: 1.05, len: 2.6, wid: 1.4, color: 0xf2d13c, tier: 1 },
  { id: 'cab', name: 'Azul Cab', topSpeed: 38, accel: 11, grip: 0.95, len: 4.6, wid: 1.9, color: 0xf5a623, tier: 1 },
  { id: 'hauler', name: 'Hauler Van', topSpeed: 34, accel: 8, grip: 0.85, len: 5.4, wid: 2.1, color: 0x9aa4ae, tier: 1 },
  { id: 'interceptor', name: 'Interceptor', topSpeed: 50, accel: 16, grip: 1.1, len: 4.7, wid: 1.95, color: 0xe8ecf2, tier: 3 },
];
export const TRAFFIC_MODELS = ['fluxs', 'city', 'micro', 'cab', 'hauler', 'corso', 'royale'];
export const CAR_HP = 100;
export const RAM_DAMAGE = 26;

// ---------------------------------------------------------------- weapons
// Vehicles-only damage. rateMs between shots, mag rounds before a reload.
export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 14, rateMs: 340, mag: 12, reloadMs: 900, spread: 0.012, pellets: 1 },
  { id: 'smg', name: 'Micro SMG', damage: 8, rateMs: 95, mag: 30, reloadMs: 1200, spread: 0.03, pellets: 1 },
  { id: 'rifle', name: 'Assault Rifle', damage: 22, rateMs: 140, mag: 30, reloadMs: 1400, spread: 0.008, pellets: 1 },
  { id: 'scatter', name: 'Scatter Gun', damage: 7, rateMs: 820, mag: 6, reloadMs: 1800, spread: 0.06, pellets: 5 },
];
export const WEAPON_RANGE = 130;

// ---------------------------------------------------------------- wanted / police
export const MAX_STARS = 5;
export const HEAT_DECAY_SECONDS = 14; // unseen this long, one star cools off
export const CRUISERS_PER_STAR = [0, 1, 2, 3, 4, 6];
export const ROADBLOCK_MIN_STARS = 4;
export const HELI_MIN_STARS = 3;
export const HELI_LOSE_SIGHT_SECONDS = 6;

// ---------------------------------------------------------------- story
export const DEBT = 100000;
export const CHAPTERS = ['Fresh Off the Boat', 'Moving Up', 'Heat', 'Kingpin of Azul'];
// type: goto | deliver | chase | escape | collect | timerun
// at: a POI id or a district id the target is anchored to.
export const STORY = [
  { ch: 0, title: 'Welcome to Azul', type: 'goto', at: 'marina', payout: 250, text: 'You made it off the boat. Come see the marina, then we talk about your debt.' },
  { ch: 0, title: 'First Fare', type: 'deliver', at: 'hotel', payout: 450, text: 'A guest at Palm Court needs a quiet ride to the bank. No questions.' },
  { ch: 0, title: 'Market Run', type: 'deliver', at: 'market', payout: 700, text: 'Crates from Mercado Central to the docks. Drive like you mean it.' },
  { ch: 0, title: 'Three Corners', type: 'collect', at: 'centro', payout: 1000, text: 'Three drops around Centro. All of them. Then the chapter closes.' },
  { ch: 0, title: 'Needle in the Sky', type: 'timerun', at: 'needle', payout: 1400, text: 'A courier is late to the Sky Needle. Beat his clock, take his fee.' },
  { ch: 1, title: 'Museum Piece', type: 'deliver', at: 'museum', payout: 1800, text: 'One fragile crate for the Azul Museum. A scratch costs us both.' },
  { ch: 1, title: 'Casino Courtesy', type: 'goto', at: 'casino', payout: 2300, text: 'The Playa Casino wants a word. Show up looking like money.' },
  { ch: 1, title: 'Rival Colours', type: 'chase', at: 'mercado', payout: 2800, text: 'A Corso in rival colours keeps circling Mercado. End the tour.' },
  { ch: 1, title: 'Charged Up', type: 'collect', at: 'alto', payout: 3400, text: 'Three dead EVs in Alto Azul need their charge packs pulled. Go.' },
  { ch: 1, title: 'Harbor Lights', type: 'escape', payout: 4000, text: 'The dock pickup went loud. Shake the heat, keep the cargo.' },
  { ch: 2, title: 'Crane Game', type: 'goto', at: 'crane', payout: 4600, text: 'Meet my man under the Dockyard Crane. Alone. He insists.' },
  { ch: 2, title: 'Hot Sedan', type: 'chase', payout: 5200, text: 'A Flux S lifted from the Volt Hub is running north. Stop it.' },
  { ch: 2, title: 'Bank Holiday', type: 'deliver', at: 'bank', payout: 5800, text: 'Bank bags to the marina, midday, broad daylight. Smile at cameras.' },
  { ch: 2, title: 'Five Corners', type: 'collect', at: 'harbor', payout: 6600, text: 'Old Harbor hides five markers tonight. Sweep them all.' },
  { ch: 2, title: 'Outrun the Chopper', type: 'escape', payout: 7400, text: 'They put the helicopter up for you. Ground it by disappearing.' },
  { ch: 3, title: 'Royale Procession', type: 'deliver', at: 'hotel', payout: 8200, text: 'A Royale, a wedding, a hotel. Deliver the car like a parade.' },
  { ch: 3, title: 'Last Rival', type: 'chase', payout: 9000, text: 'The last rival Wheelman drives a Volt GT out of Playa. Finish it.' },
  { ch: 3, title: 'Needle Run', type: 'timerun', at: 'needle', payout: 10100, text: 'One final clock at the Sky Needle. The whole city is watching.' },
  { ch: 3, title: 'Kingpin Errand', type: 'deliver', at: 'casino', payout: 11000, text: 'Casino chips to the bank vault. This is the big one, amor.' },
  { ch: 3, title: 'Kingpin of Azul', type: 'escape', payout: 14000, text: 'Everything burns behind you. Lose them all and the debt is dead.' },
];

// ---------------------------------------------------------------- side money
export const STASH_REWARD = 150;
// Every stash sits on a road line (a multiple of 56 on at least one axis),
// so it is always reachable and never buried in a building.
export const STASHES = [
  [0, -196], [-112, -196], [168, -140], [224, -28], [-224, -84], [-56, -168], [112, 28],
  [-168, 84], [56, -84], [224, 140], [-56, 140], [28, 112], [196, 224], [-196, 224],
  [84, 168], [-28, 224], [140, -224], [-224, -196], [0, 0], [224, -224],
].map(([x, z]) => ({ x, z }));

export const GIG_PAY = { taxi: 160, courier: 210 };
export const RACE_PRIZES = [500, 300, 150];
export const RACES = [
  { id: 'harborgp', name: 'Harbor GP', laps: 1, points: [[-224, 224], [-56, 224], [112, 224], [224, 112], [224, -56], [112, -224]] },
  { id: 'skyline', name: 'Skyline Sprint', laps: 1, points: [[224, -224], [56, -224], [-112, -224], [-224, -112], [-224, 56], [-56, 224]] },
];

export const BOUNTIES = [
  { name: 'Rex Marlowe', car: 'corso', district: 'mercado', reward: 400 },
  { name: 'Vera Lindt', car: 'fluxs', district: 'alto', reward: 450 },
  { name: 'Odo Ferreira', car: 'hauler', district: 'harbor', reward: 500 },
  { name: 'Mina Castellan', car: 'royale', district: 'centro', reward: 550 },
  { name: 'Yusuf Ade', car: 'cab', district: 'palmas', reward: 600 },
  { name: 'Petra Vane', car: 'city', district: 'playa', reward: 650 },
  { name: 'Hugo Salas', car: 'corso', district: 'centro', reward: 700 },
  { name: 'Ines Duarte', car: 'fluxs', district: 'mercado', reward: 750 },
  { name: 'Karl Brandt', car: 'royale', district: 'alto', reward: 850 },
  { name: 'Sable Quinn', car: 'voltgt', district: 'playa', reward: 950 },
];
export const BOUNTY_RESPAWN_SECONDS = 60;
export const BOUNTY_PIN_SECONDS = 2;

export const CONTRACTS = [
  { client: 'A nervous banker', from: 'bank', to: 'marina', seconds: 75, starCap: 1, fee: 380 },
  { client: 'A wedding singer', from: 'hotel', to: 'casino', seconds: 90, starCap: 0, fee: 420 },
  { client: 'A chef with a knife roll', from: 'market', to: 'needle', seconds: 70, starCap: 1, fee: 460 },
  { client: 'A retired racer', from: 'casino', to: 'volthub', seconds: 95, starCap: 2, fee: 520 },
  { client: 'A museum courier', from: 'museum', to: 'bank', seconds: 80, starCap: 1, fee: 560 },
  { client: 'A lighthouse keeper', from: 'lighthouse', to: 'market', seconds: 100, starCap: 0, fee: 600 },
  { client: 'A dock foreman', from: 'crane', to: 'hotel', seconds: 85, starCap: 2, fee: 640 },
  { client: 'A card sharp', from: 'casino', to: 'marina', seconds: 70, starCap: 1, fee: 690 },
  { client: 'A storm chaser', from: 'volthub', to: 'lighthouse', seconds: 90, starCap: 2, fee: 740 },
  { client: 'Marisol herself', from: 'needle', to: 'casino', seconds: 80, starCap: 1, fee: 800 },
];
export const CONTRACT_EARLY_BONUS = 0.5; // fraction of fee per full half of the clock left

export const PROPERTIES = [
  { id: 'palmflat', name: 'Palm Court Flat', district: 'palmas', x: -196, z: -112, price: 8000, rent: 90 },
  { id: 'mercadoloft', name: 'Mercado Loft', district: 'mercado', x: -140, z: 106, price: 18000, rent: 210 },
  { id: 'marinapent', name: 'Marina Penthouse', district: 'harbor', x: -112, z: 196, price: 35000, rent: 420 },
];
export const RENT_PERIOD_SECONDS = 60;

export const MOD_SHOP = { name: 'Neon Works Garage', x: 84, z: 50, district: 'centro' };
export const PAINTS = [
  { name: 'Factory', color: null, price: 0 },
  { name: 'Neon Cyan', color: 0x18e0e8, price: 300 },
  { name: 'Sunset Magenta', color: 0xe83a9f, price: 300 },
  { name: 'Acid Lime', color: 0x9fe83a, price: 350 },
  { name: 'Midnight Violet', color: 0x5a2ee8, price: 400 },
  { name: 'Chrome Gold', color: 0xf2c13c, price: 600 },
];
export const GLOWS = [
  { name: 'No underglow', color: null, price: 0 },
  { name: 'Cyan glow', color: 0x18e0ff, price: 450 },
  { name: 'Magenta glow', color: 0xff2ea6, price: 450 },
  { name: 'Lime glow', color: 0x8cff2e, price: 500 },
];
export const MOD_TIERS = {
  grip: { name: 'Grip', prices: [0, 500, 1100, 1900], perTier: 0.08 },
  turbo: { name: 'Turbo', prices: [0, 700, 1500, 2600], perTier: 0.07 },
  armor: { name: 'Armor', prices: [0, 600, 1300, 2200], perTier: 0.18 },
};

// ---------------------------------------------------------------- progression
export const RANKS = [
  { name: 'Nobody', at: 0 },
  { name: 'Runner', at: 500 },
  { name: 'Fixer', at: 2000 },
  { name: 'Wheelman', at: 6000 },
  { name: 'Made Man', at: 15000 },
  { name: 'Shot Caller', at: 30000 },
  { name: 'Kingpin of Azul', at: 60000 },
];
export const STANDING_LEVELS = [0, 30, 80, 160, 300]; // points to reach levels 0..4
export const STYLE_EVENTS = { nearMiss: 25, driftSecond: 18, airSecond: 30 };
export const STYLE_MAX_MULT = 5;
export const CREW_COOLDOWN_SECONDS = 90;
export const DRONE_BATTERY_SECONDS = 45;
export const DRONE_PHOTO_PAY = 120;
export const RADIO_STATIONS = [
  { id: 'pulse', name: 'Azul Pulse FM', bpm: 122 },
  { id: 'harbor', name: 'Harbor Wave', bpm: 96 },
  { id: 'neon', name: 'Neon Nights', bpm: 108 },
];
