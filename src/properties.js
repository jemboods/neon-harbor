// Properties and the mod shop: three buyable addresses that pay rent and
// hold a garage (one stored car, mods and all, across saves), and the Neon
// Works Garage where side cash becomes paint, underglow and staged
// grip/turbo/armor tiers on the car you drove in.

import * as THREE from 'three';
import { GLOWS, MOD_SHOP, MOD_TIERS, PAINTS, PROPERTIES, RENT_PERIOD_SECONDS } from './config.js';

const BUY_RANGE = 6;
const GARAGE_RANGE = 7;
const SHOP_RANGE = 8;

export function createProperties(scene, world, vehicles, progression, hooks) {
  const rings = new Map();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x57f2a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  for (const prop of PROPERTIES) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.3, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(prop.x, 0.07, prop.z);
    scene.add(ring);
    rings.set(prop.id, ring);
  }
  const shopRing = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.2, 28), new THREE.MeshBasicMaterial({ color: 0x18c8e8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  shopRing.rotation.x = -Math.PI / 2;
  shopRing.position.set(MOD_SHOP.x, 0.07, MOD_SHOP.z);
  scene.add(shopRing);

  let rentTimer = 0;
  const owned = (id) => progression.state.properties.includes(id);
  const near = (x, z, px, pz, range) => Math.hypot(x - px, z - pz) < range;

  return {
    owned,
    /** The context action available at a position, or null. */
    promptAt(focus, inCar) {
      for (const prop of PROPERTIES) {
        if (!near(prop.x, prop.z, focus.x, focus.z, inCar ? GARAGE_RANGE : BUY_RANGE)) continue;
        if (!owned(prop.id)) {
          return { key: 'KeyE', text: `Buy ${prop.name} — $${prop.price.toLocaleString()} (rent $${prop.rent}/min)`, act: () => this.buy(prop) };
        }
        if (inCar) return { key: 'KeyE', text: `Store your car in the ${prop.name} garage`, act: () => this.storeCar(prop, focus.carRef) };
        if (progression.state.garage) return { key: 'KeyE', text: `Take your ${progression.state.garage.modelName} from the garage`, act: () => this.takeCar(prop) };
        return { key: 'KeyE', text: `${prop.name} — garage empty`, act: null };
      }
      return null;
    },
    buy(prop) {
      if (!progression.spendSide(prop.price)) {
        if (hooks?.onToast) hooks.onToast(`Not enough side cash for ${prop.name}`);
        return false;
      }
      progression.state.properties.push(prop.id);
      progression.save();
      if (hooks?.onToast) hooks.onToast(`🏠 You own the ${prop.name}! Rent lands every minute.`);
      if (hooks?.onCashSound) hooks.onCashSound();
      return true;
    },
    storeCar(prop, car) {
      if (!car) return false;
      progression.state.garage = {
        model: car.spec.id,
        modelName: car.spec.name,
        color: car.color,
        mods: { ...car.mods },
        hp: car.hp,
      };
      progression.state.lastCar = null;
      if (hooks?.onStoreCar) hooks.onStoreCar(car);
      progression.save();
      if (hooks?.onToast) hooks.onToast(`🚗 Stored in the ${prop.name} garage`);
      return true;
    },
    takeCar(prop) {
      const record = progression.state.garage;
      if (!record) return null;
      progression.state.garage = null;
      const car = vehicles.spawnCar(record.model, prop.x + 4, prop.z + 4, Math.PI / 2, 'parked', { color: record.color, mods: record.mods });
      car.hp = record.hp;
      progression.save();
      if (hooks?.onTakeCar) hooks.onTakeCar(car);
      return car;
    },
    inShopZone(focus) {
      return near(MOD_SHOP.x, MOD_SHOP.z, focus.x, focus.z, SHOP_RANGE);
    },
    /** The mod shop catalogue for a car: what each next purchase costs. */
    catalogue(car) {
      const rows = [];
      PAINTS.forEach((paint, i) => rows.push({ kind: 'paint', index: i, name: `Paint: ${paint.name}`, price: paint.price, owned: car.mods.paint === i, can: car.mods.paint !== i }));
      GLOWS.forEach((glow, i) => rows.push({ kind: 'glow', index: i, name: `Underglow: ${glow.name}`, price: glow.price, owned: car.mods.glow === i, can: car.mods.glow !== i }));
      for (const kind of ['grip', 'turbo', 'armor']) {
        const tier = MOD_TIERS[kind];
        const current = car.mods[kind];
        const nextPrice = current < 3 ? tier.prices[current + 1] : null;
        rows.push({ kind, index: current + 1, name: `${tier.name} tier ${current} → ${current + 1}`, price: nextPrice, owned: current >= 3, can: nextPrice !== null });
      }
      return rows;
    },
    buyMod(car, row) {
      if (!row.can || row.price === null) return false;
      if (!progression.spendSide(row.price)) {
        if (hooks?.onToast) hooks.onToast('Not enough side cash for that mod');
        return false;
      }
      if (row.kind === 'paint') {
        car.mods.paint = row.index;
        car.mods.paintColor = PAINTS[row.index].color ?? car.color;
        if (PAINTS[row.index].color === null) delete car.mods.paintColor;
      } else if (row.kind === 'glow') {
        car.mods.glow = row.index;
        car.mods.glowColor = GLOWS[row.index].color;
        if (!car.mods.glowColor) delete car.mods.glowColor;
      } else {
        car.mods[row.kind] = row.index;
      }
      vehicles.applyMods(car);
      progression.save();
      if (hooks?.onCashSound) hooks.onCashSound();
      if (hooks?.onToast) hooks.onToast(`🔧 Fitted: ${row.name}`);
      return true;
    },
    update(dt) {
      rentTimer += dt;
      if (rentTimer >= RENT_PERIOD_SECONDS) {
        rentTimer -= RENT_PERIOD_SECONDS;
        const rent = PROPERTIES.filter((p) => owned(p.id)).reduce((sum, p) => sum + p.rent, 0);
        if (rent > 0) {
          progression.paySide(rent);
          if (hooks?.onToast) hooks.onToast(`🏠 Rent collected: +$${rent}`);
          progression.save();
        }
      }
    },
  };
}
