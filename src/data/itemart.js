// Which uploaded item / projectile sprites represent what. Sprite ids are
// "<sheet id>_<index>" where index counts left-to-right, top-to-bottom from 1.
const range = (sheet, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${sheet}_${String(a + i).padStart(2, '0')}`);

// Armour & ring icons (picked per item from its seed)
export const ITEM_ICON_POOLS = {
  body: [...range('it_armor1', 1, 10), ...range('it_armor2', 1, 10)],
  legs: [...range('it_armor1', 11, 30), ...range('it_armor2', 11, 30)],
  head: [...range('it_armor1', 31, 40), ...range('it_armor2', 31, 40)],
  ring: [...range('it_rings_relics', 1, 20), ...range('it_jewelry_gear', 1, 15)],
};

// Key cards, chest, coin
export const KEY_SPRITES = { red: 'it_keys_currency_11', blue: 'it_keys_currency_12', yellow: 'it_keys_currency_13', green: 'it_keys_currency_14', purple: 'it_keys_currency_15' };
// Chests are closed / open pairs from the scatter chest sheet (manifest
// scatterSets id CHEST_SET): skull chests in hell / gothic / dark themes,
// light-strip tech chests in stations, cities and cyberspace - picked per
// level by data/scatter.js (chest style) in game/scatter.js. CHEST_SPRITE is
// the old single icon, only used when that sheet is missing.
export const CHEST_SET = 'scatter_chests';
export const CHEST_SPRITE = 'it_currency_treasure_48';
export const COIN_SPRITE = 'it_keys_currency_23';

// Reagent icons
export const REAGENT_SPRITES = {
  nano_paste: 'it_crafting_29', servo_scrap: 'it_crafting_15', logic_chip: 'it_crafting_08', static_coil: 'it_crafting_09',
  urchin_spine: 'it_crafting_17', brimstone_shard: 'it_crafting_02', demon_ichor: 'it_crafting_16', chitin_plate: 'it_crafting_18',
  bio_gel: 'it_crafting_24', grave_dust: 'it_crafting_20', soul_wisp: 'it_crafting_25', void_crystal: 'it_crafting_22',
  cyber_core: 'it_crafting_13', penitent_chain: 'it_crafting_06', boss_soul_shard: 'it_keys_currency_31',
  tyrant_heart: 'it_currency_treasure_27', astral_sigil: 'it_relics_05',
};

// Player projectile sprites by kind. Bullets & rockets are drawn from
// behind (what you see as they fly away from you).
export const PLAYER_PROJ = {
  bullet_physical: range('proj_03', 1, 4),
  bullet_elemental: range('proj_03', 5, 10),
  rocket: range('proj_08', 1, 5),
  rocket_multi: range('proj_08', 6, 10),
  grenade: ['proj_01_13', 'proj_01_14', 'proj_01_22'],
  nail: ['proj_01_11', 'proj_01_16'],
  disc: ['proj_01_01', 'proj_01_02', 'proj_01_07'],
};
// Sheets enemies may use (never bullets, shells or rockets)
export const ENEMY_PROJ_SHEETS = ['orbs_set_01', 'proj_02', 'proj_04', 'proj_05', 'proj_06', 'proj_07', 'proj_09', 'proj_10', 'proj_11', 'proj_12'];
// Sheets for the player's elemental orbs / plasma / flames
export const ENERGY_PROJ_SHEETS = ['orbs_set_01', 'proj_02', 'proj_04', 'proj_05', 'proj_06', 'proj_09', 'proj_11'];
