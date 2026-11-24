// The systems inventory: every system the game ships, the module that
// implements it and a one-line summary. The phone's About page reads this
// list in play, and main.ts copies it into the hand-in's build metadata,
// so what the dossier claims is what the code contains.

export const SYSTEMS = [
  { id: 'world', name: 'World & City', module: 'src/world.js', blurb: 'Seeded 9x9-block harbour city, 6 districts, 10 POIs, day/night cycle.' },
  { id: 'vehicles', name: 'Vehicles & Traffic', module: 'src/vehicles.js', blurb: '9 EV-era models, arcade driving, lane-changing traffic AI, carjacking.' },
  { id: 'police', name: 'Police & Wanted', module: 'src/police.js', blurb: '5-star wanted, cruiser pursuit, roadblocks, spike strips, searchlight helicopter.' },
  { id: 'weapons', name: 'Weapons', module: 'src/weapons.js', blurb: 'Q-hold wheel, 4 hitscan weapons, tracers, vehicles-only damage.' },
  { id: 'phone', name: 'Smartphone', module: 'src/phone.js', blurb: 'Marisol briefings, job list, standings, properties, bounties, contracts, career.' },
  { id: 'drone', name: 'Camera Drone', module: 'src/drone.js', blurb: '45-second battery drone; POI photo-drops pay side cash.' },
  { id: 'races', name: 'Street Races', module: 'src/missions.js', blurb: 'Harbor GP and Skyline Sprint against 3 rubber-banded AI rivals.' },
  { id: 'progression', name: 'Progression', module: 'src/progression.js', blurb: 'Style combo to x5, district standing, respect ranks, crew, radio, stashes, gigs, saves.' },
  { id: 'properties', name: 'Properties', module: 'src/properties.js', blurb: '3 buyable addresses, rent income, a garage that stores one car across saves.' },
  { id: 'bounties', name: 'Bounty Board', module: 'src/missions.js', blurb: '10 named targets in marked cars; wreck or pin them to collect.' },
  { id: 'modshop', name: 'Mod Shop', module: 'src/properties.js', blurb: 'Neon Works Garage: paints, underglow, staged grip/turbo/armor tiers.' },
  { id: 'contracts', name: 'Getaway Contracts', module: 'src/missions.js', blurb: '10 repeatable pickups against a clock under a wanted-star cap.' },
  { id: 'weather', name: 'Weather', module: 'src/world.js', blurb: 'Seeded rain fronts: wet grip, rain audio, sheltering pedestrians, slower traffic.' },
  { id: 'photomode', name: 'Photo Mode', module: 'src/drone.js', blurb: 'Free camera with the HUD hidden; every shot counted in the career stats.' },
  { id: 'audio', name: 'Synthesized Audio', module: 'src/audio.js', blurb: 'All WebAudio: engine, shots, stings and 3 sequenced radio stations.' },
];
