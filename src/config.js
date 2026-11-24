// Neon Harbor constants and data tables: one place for every limit, roster and price.
export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-harbor.save.v1';

// Design tokens (frontend plan): five colours, Farol is the only accent, Perigo is danger only.
export const INK = { azul: '#07293D', asfalto: '#13242E', espuma: '#EAF6FF', farol: '#FFB43A', perigo: '#E5484D' };
export const FONT = '"Saira", system-ui, sans-serif';
export const FONT_DISPLAY = '"Saira Condensed", "Saira", system-ui, sans-serif';

// City grid: streets on both axes every PITCH metres, centred on 0; water south of WATER_Z.
export const PITCH = 110;
export const GRID = 4; // street lines run from -GRID to +GRID on each axis
export const ROAD_HALF = 13;
export const BOUND = 468;
export const WATER_Z = 452;
export const DAY_LENGTH = 480; // seconds per full day
export const START_HOUR = 17.4; // dusk, the title screen's hour

export const DISTRICTS = [
  { name: 'Las Palmas', x0: -468, x1: -156, z0: -468, z1: 0 },
  { name: 'Alto Azul', x0: -156, x1: 156, z0: -468, z1: 0 },
  { name: 'Mercado', x0: 156, x1: 468, z0: -468, z1: 0 },
  { name: 'Old Harbor', x0: -468, x1: -156, z0: 0, z1: 468 },
  { name: 'Centro', x0: -156, x1: 156, z0: 0, z1: 468 },
  { name: 'Playa Este', x0: 156, x1: 468, z0: 0, z1: 468 },
];
export const STANDING_LEVELS = ['Stranger', 'Face', 'Regular', 'Insider', 'Family'];
export const STANDING_STEP = 60; // points per level

export const POIS = [
  { name: 'Pier 3', x: -330, z: 418 },
  { name: 'Old Harbor police post', x: -300, z: 62 },
  { name: 'Playa Este clinic', x: 330, z: 118 },
  { name: "Marisol's cantina", x: 44, z: 218 },
  { name: 'Torque mod shop', x: 296, z: -222 },
  { name: 'Harbor garage', x: -118, z: 332 },
  { name: 'Ferry terminal', x: -44, z: 428 },
  { name: 'Mercado market hall', x: 330, z: -330 },
  { name: 'Alto Azul lookout', x: 4, z: -404 },
  { name: 'Las Palmas boatyard', x: -384, z: -162 },
];
export const POLICE_POST = 1;
export const CLINIC = 2;
export const MOD_SHOP = 4;
export const GARAGE = 5;

// kind: 0 car, 1 sport, 2 van, 3 cab, 4 police. speed m/s, accel m/s^2.
export const VEHICLES = [
  { name: 'Volt GT', kind: 1, speed: 52, accel: 15, grip: 1.05, len: 4.4, colors: [0xd8483c, 0x2e6fd8, 0xf2f2f2, 0x22262c] },
  { name: 'Flux S', kind: 0, speed: 42, accel: 11, grip: 1.0, len: 4.5, colors: [0x9fb4c4, 0x5a6b7a, 0x30363e, 0x7a2e2e] },
  { name: 'Royale', kind: 0, speed: 44, accel: 11, grip: 1.0, len: 5.0, colors: [0x1c2733, 0x3d2f52, 0x6e1423, 0xc0c6cc] },
  { name: 'Corso', kind: 0, speed: 38, accel: 10, grip: 1.0, len: 3.9, colors: [0xe8a13a, 0x3fae6a, 0xd8d8d8, 0x35507a] },
  { name: 'City', kind: 0, speed: 34, accel: 9, grip: 0.95, len: 3.6, colors: [0xb9c4cc, 0x7a8894, 0x4a5560, 0x94552e] },
  { name: 'Micro', kind: 0, speed: 28, accel: 8, grip: 0.9, len: 2.8, colors: [0xe8e2d2, 0x8fd0d8, 0xf0a8b8, 0xa8c686] },
  { name: 'Cab', kind: 3, speed: 40, accel: 10, grip: 1.0, len: 4.6, colors: [0xf2b13a] },
  { name: 'Hauler Van', kind: 2, speed: 36, accel: 8, grip: 0.9, len: 5.2, colors: [0xd8d8d8, 0x5a6b7a, 0x30363e] },
  { name: 'Interceptor', kind: 4, speed: 54, accel: 14, grip: 1.05, len: 4.7, colors: [0x1f3b73] },
];
export const INTERCEPTOR = 8;

export const WEAPONS = [
  { name: 'Pistol', mag: 12, damage: 34, rate: 0.32, reload: 1.1, range: 90, reserve: 96 },
  { name: 'Micro SMG', mag: 30, damage: 18, rate: 0.09, reload: 1.5, range: 75, reserve: 240 },
  { name: 'Assault rifle', mag: 30, damage: 26, rate: 0.13, reload: 1.7, range: 120, reserve: 240 },
];

// Character specs from the owner's reference sheet.
export const CHARACTERS = {
  player: { skin: 0xa0693f, shirt: 0xf2f2f2, arm: 'skin', pants: 0x2f4f8f, shoe: 0xe8e8e8, hat: 'bandana', hatColor: 0x2e8b3d, glasses: false, extra: 'chain' },
  homie: { skin: 0x6b4426, shirt: 0x6a2c91, arm: 'skin', pants: 0x1c1c24, shoe: 0x111111, hat: 'cap', hatColor: 0x6a2c91, glasses: true, extra: '' },
  officer: { skin: 0xd9a679, shirt: 0x1f3b73, arm: 'shirt', pants: 0x14203d, shoe: 0x0b0b0b, hat: 'cop', hatColor: 0x14203d, glasses: true, extra: 'badge' },
};
export const PED_SHIRTS = [0x6a2c91, 0x2e6f8f, 0x94552e, 0x3fae6a, 0x8a8f96, 0x7a2e4e];

// Story: 20 jobs, 4 chapters. Route kinds: r ride, p pickup+drop, e drop then lose heat, d drop.
export const CHAPTERS = ['Fresh Off the Boat', 'Moving Up', 'Heat', 'Kingpin of Azul'];
export const STORY_PAYOUTS = [250, 450, 700, 1000, 1400, 1800, 2300, 2800, 3400, 4000, 4600, 5200, 5800, 6600, 7400, 8200, 9000, 10100, 11000, 14000];
export const DEBT_TOTAL = 100000;
// [title, card sentence, giver, route kind, pickup poi, drop poi]
export const STORY = [
  ['First fare', 'Drive Marisol to Pier 3 so she can settle the dock ledger.', 'Marisol', 'r', 3, 0],
  ['Cold boxes', 'Pick up the fish boxes at the boatyard and drop them at the market hall.', 'Marisol', 'p', 9, 7],
  ['Quiet passenger', 'Pick up the courier at the ferry terminal and take him to the lookout.', 'Marisol', 'p', 6, 8],
  ['Harbor dues', 'Take the dues bag from Pier 3 to the cantina before the shift changes.', 'Marisol', 'p', 0, 3],
  ['Night manifest', 'Drive the manifest from the market hall to the ferry terminal, no stops.', 'Marisol', 'p', 7, 6],
  ['A friend in Centro', 'Pick up Dario at the cantina and drop him at the mod shop.', 'Dario', 'p', 3, 4],
  ['Spare parts', 'Collect the parts crate at the mod shop and deliver it to the boatyard.', 'Dario', 'p', 4, 9],
  ['Clinic run', 'Pick up the nurse at the clinic and get her to Pier 3 fast.', 'Dario', 'p', 2, 0],
  ['Lookout drop', 'Take the spotter from the lookout to the market hall.', 'Dario', 'p', 8, 7],
  ['Shift change', 'Drive the off-duty guard from the police post to the cantina. Act normal.', 'Dario', 'p', 1, 3],
  ['Warm cargo', 'Pick up the warm cargo at the boatyard, drop it at the lookout, then lose any heat.', 'Marisol', 'e', 9, 8],
  ['Marked van', 'Take the marked crate from the market hall to Pier 3, then shake the patrol.', 'Marisol', 'e', 7, 0],
  ['Two stops', 'Collect the diver at the clinic, drop him at the ferry terminal, then disappear.', 'Dario', 'e', 2, 6],
  ['Decoy run', 'Drive the decoy bag from the cantina to the boatyard and lose the tail.', 'Dario', 'e', 3, 9],
  ['Hot manifest', 'Move the hot manifest from the lookout to the market hall, then cool off.', 'Marisol', 'e', 8, 7],
  ['The buyer', 'Pick up the buyer at the ferry terminal and take him to the lookout.', 'Marisol', 'p', 6, 8],
  ['Full ledger', 'Take the full ledger from the cantina to Pier 3. This one matters.', 'Marisol', 'p', 3, 0],
  ['Harbor lights', 'Drive the electrician from the boatyard to the market hall.', 'Dario', 'p', 9, 7],
  ['Last passenger', 'Pick up the last passenger at the clinic and take her to the cantina.', 'Marisol', 'p', 2, 3],
  ['Pay the harbor', 'Take the final payment from the cantina to Pier 3 and close the debt.', 'Marisol', 'p', 3, 0],
];
export const JOB_LINES = {
  go: 'Get to the marker',
  pickup: 'Pick up the passenger',
  drop: 'Drop off at the destination',
  escape: 'Lose the heat',
  done: 'Job done',
};

// [name, car index, district index, reward]
export const BOUNTIES = [
  ['Rato', 0, 0, 600], ['Vela', 3, 1, 650], ['Tubarão', 1, 2, 700], ['Nina', 4, 3, 750],
  ['Ostra', 5, 4, 800], ['Faro', 2, 5, 900], ['Manga', 3, 0, 950], ['Cais', 0, 2, 1000],
  ['Lula', 1, 4, 1100], ['Rei do Cais', 2, 5, 1400],
];
// [client, pickup poi, drop poi, seconds, star cap, pay]
export const CONTRACTS = [
  ['Aiko', 6, 7, 150, 1, 500], ['Bento', 0, 8, 170, 2, 650], ['Celia', 2, 3, 140, 1, 550],
  ['Duda', 9, 6, 180, 2, 700], ['Enzo', 7, 0, 190, 3, 850], ['Fefa', 3, 2, 130, 1, 520],
  ['Guto', 8, 9, 200, 3, 900], ['Hana', 4, 1, 210, 2, 780], ['Igor', 1, 5, 160, 2, 680],
  ['Jade', 5, 4, 150, 1, 600],
];
export const RACES = [
  { name: 'Harbor loop', x: -330, z: 330, par: 95 },
  { name: 'Mercado sprint', x: 330, z: -222, par: 80 },
  { name: 'North climb', x: 4, z: -330, par: 85 },
];
export const PROPERTIES = [
  { name: 'Pier 3 bunkhouse', x: -352, z: 384, price: 4000, rent: 90 },
  { name: 'Centro flat', x: 62, z: 148, price: 9000, rent: 210 },
  { name: 'Playa Este villa', x: 352, z: 262, price: 16000, rent: 420 },
];
export const STASH_COUNT = 20;
export const STASH_SEED = 90210;
export const RANKS = [
  [0, 'Nobody'], [1500, 'Runner'], [5000, 'Hustler'], [12000, 'Earner'],
  [25000, 'Fixer'], [45000, 'Captain'], [75000, 'Kingpin of Azul'],
];
export const RADIO = ['Rádio Farol', 'Ondas do Sul', 'Noite FM'];

// Police and bust tuning (Fix 1).
export const COP_SPAWN_MIN = 180;
export const COP_DESPAWN_DIST = 260;
export const COP_UNSEEN_DESPAWN = 10;
export const HEAT_UNSEEN = 8;
export const HEAT_DECAY = 1.1; // per second, only when unseen long enough and no cruiser is tasked
export const BUST_RANGE = 6;
export const BUST_FILL = 35;
export const BUST_DRAIN = 25;
export const BUST_PIN_SPEED = 2;
export const STAR_HEAT = [10, 30, 60, 100, 150]; // heat where stars 1..5 begin
export const COPS_BY_STAR = [0, 1, 2, 3, 4, 5];
export const SIREN_RANGE = 90;

// Player tuning.
export const WALK_SPEED = 5.2;
export const SPRINT_SPEED = 8.4;
export const CARJACK_RANGE = 7;
export const INTERACT_RANGE = 6;
export const DRONE_BATTERY = 45;
export const COMBO_WINDOW = 6;
