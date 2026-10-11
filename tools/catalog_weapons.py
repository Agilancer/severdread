#!/usr/bin/env python3
"""Catalogue of the uploaded weapon sheets: archetype per weapon (chosen by
looking at each gun), rarity from the folder, element from glow colour, and a
generated name. Writes entries into tools/art_config.json.
Run: python3 tools/catalog_weapons.py && python3 tools/process_art.py"""
import json, os, glob, random, re
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, 'tools', 'art_config.json')
X = None  # use sheet default

A = {
 'epic_01': ('plasma', ['minigun', 'grenade', 'plasma', 'rocket', 'spreader']),
 'epic_02': ('plasma', ['spreader', 'spreader', 'plasma', 'lightning', 'plasma']),
 'epic_03': ('plasma', ['shotgun', 'spreader', 'super_shotgun', 'lightning', 'rail']),
 'epic_04': ('plasma', ['launcher', 'launcher', 'rail', 'minigun', 'rail']),
 'epic_05': ('rocket', ['rocket', 'minigun', 'spreader', 'grenade', 'plasma']),
 'common_01': ('plasma', [X, X, X, X, X, 'rail', X, X, X, X]),
 'common_02': ('rifle', ['lmg', 'rifle', 'lmg', 'rifle', 'flamer', 'rifle', 'minigun', 'sniper', 'rifle', 'grenade']),
 'common_03': ('pistol', None),
 'common_04': ('rifle', ['lmg', 'lmg', X, X, 'plasma', 'minigun', X, X, X, 'lmg']),
 'common_05': ('revolver', None),
 'common_06': ('club', [X, X, X, X, 'mace', 'mace', 'mace', X, X, 'mace']),
 'common_07': ('plasma', [X, X, X, X, 'spreader', X, X, X, X, X]),
 'common_08': ('pistol', None),
 'common_09': ('rifle', [X, X, 'shotgun', X, X, X, X, X, X, X]),
 'common_10': ('rifle', ['rifle', 'rifle', 'shotgun', 'nailgun', 'flamer', 'harpoon', 'launcher', 'sprayer', 'sprayer', 'grenade']),
 'common_11': ('shotgun', ['shotgun', 'super_shotgun', 'shotgun', 'smg', 'revolver', 'rail']),
 'common_12': ('plasma', [X, X, X, X, 'rail', X, X, 'spreader', X, 'rocket']),
 'common_13': ('plasma', ['grenade', X, 'shotgun', X, 'rocket', 'lightning', X, 'minigun', X, 'lightning']),
 'common_14': ('sniper', None),
 'common_15': ('pistol', None),
 'common_16': ('blade', ['shuriken', 'blade', 'javelin', 'shuriken', 'crossbow', 'crossbow', 'crossbow', 'blade', 'launcher', 'nailgun']),
 'common_17': ('blade', None),
 'common_18': ('grenade', ['grenade', 'rocket', 'grenade', 'rocket', 'grenade', 'minigun', 'plasma', 'grenade', 'rocket', 'rocket']),
 'common_19': ('pistol', None),
 'common_20': ('shotgun', [X, X, 'super_shotgun', 'super_shotgun', X, X, X, X, 'super_shotgun']),
 'common_21': ('blade', [X, X, X, X, 'mace', 'mace', X, 'mace', X, 'club']),
 'common_22': ('shotgun', [X, X, 'super_shotgun', X, X, 'super_shotgun', X, X, 'super_shotgun']),
 'common_23': ('grenade', [X, X, X, X, 'launcher', 'harpoon', X, X, X, 'rocket']),
 'common_24': ('revolver', None),
 'legendary_01': ('plasma', ['rocket', 'lightning', 'launcher', 'minigun', 'spreader']),
 'legendary_02': ('plasma', ['plasma', 'rocket', 'rail', 'spreader', 'plasma']),
 'legendary_03': ('rocket', ['rocket', 'rail', 'rocket', 'spreader', 'launcher']),
 'legendary_04': ('minigun', ['minigun', 'rifle', 'minigun', 'minigun', 'rocket']),
 'legendary_05': ('mace', ['mace', 'mace', 'blade', 'mace', 'mace']),
 'legendary_06': ('blade', None),
 'legendary_07': ('plasma', ['plasma', 'lightning', 'spreader', 'grenade', 'spreader']),
 'legendary_08': ('plasma', ['spreader', 'lightning', 'sprayer', 'rail', 'plasma'], 5),
 'legendary_09': ('plasma', ['rail', 'lightning', 'plasma', 'rocket', 'plasma'], 5),
 'legendary_10': ('plasma', ['minigun', 'rail', 'lightning', 'rocket', 'plasma']),
 'rare_01': ('lmg', [X, X, X, X, 'sniper', 'grenade', 'grenade', 'rocket', 'rocket', 'grenade']),
 'rare_02': ('blade', ['mace', X, X, X, X, X, X, 'mace', X, X]),
 'rare_03': ('rifle', ['sniper', X, X, X, X, X, 'sniper', X, 'sniper', X]),
 'rare_04': ('revolver', ['revolver', 'super_shotgun', 'rail', 'shotgun', 'grenade']),
 'rare_05': ('plasma', ['spreader', 'plasma', 'plasma', 'lightning', 'spreader']),
 'rare_06': ('plasma', [X, X, 'rail', 'rocket', X]),
 'rare_07': ('plasma', ['lightning', 'spreader', 'plasma', 'grenade', 'plasma', 'rail']),
 'rare_08': ('plasma', ['launcher', 'plasma', 'rocket', 'spreader', 'grenade']),
 'rare_09': ('plasma', ['lightning', 'plasma', 'spreader', 'lightning', 'plasma']),
 'rare_10': ('minigun', ['minigun', 'lightning', 'minigun', 'launcher', 'rail']),
 'rare_11': ('plasma', ['shotgun', 'rocket', 'minigun', 'minigun', 'plasma']),
 'rare_12': ('plasma', ['flamer', 'spreader', X, 'sprayer', X, X, 'lightning', 'spreader', X, X]),
 'rare_13': ('rifle', [X, 'revolver', X, 'plasma', 'plasma', 'spreader', X, X, 'plasma', 'plasma']),
 'rare_14': ('rail', ['launcher', X, 'plasma', X, 'launcher']),
 'rare_15': ('rail', [X, X, 'plasma', 'rifle', 'launcher']),
 'rare_16': ('plasma', None, 5),
 'rare_17': ('blade', None),
 'rare_18': ('blade', [X, X, X, X, X, X, X, X, 'shuriken', X]),
 'rare_19': ('blade', None),
 'uncommon_01': ('blade', None),
 'uncommon_02': ('shotgun', [X, X, 'super_shotgun', X, X, X, X, X, X, X]),
 'uncommon_03': ('javelin', None, 10),
 'uncommon_04': ('mace', None),
 'uncommon_05': ('grenade', ['super_shotgun', 'grenade', 'smg', 'super_shotgun', 'minigun', 'rocket', 'rifle', 'grenade', 'rail', 'grenade']),
 'uncommon_06': ('revolver', None),
 'uncommon_07': ('smg', None),
 'uncommon_08': ('blade', [X, X, X, X, X, X, 'shuriken', X, X, X], 10),
 'uncommon_09': ('grenade', ['grenade', 'spreader', 'sprayer', 'launcher', 'plasma']),
 'uncommon_10': ('super_shotgun', [X, 'shotgun', X, X, X]),
 'uncommon_11': ('plasma', ['lightning', 'rail', X, X, 'spreader', X, 'pistol', X, 'spreader', 'lightning']),
 'uncommon_12': ('crossbow', [X, X, 'harpoon', 'launcher', X, X, 'sprayer', 'sprayer', 'rocket', 'spreader']),
 'uncommon_13': ('shuriken', None),
 'uncommon_14': ('mace', [X, X, X, X, X, X, X, 'blade', X, X]),
 'uncommon_15': ('grenade', ['grenade', 'shotgun', 'sprayer', 'launcher', 'minigun']),
 'uncommon_16': ('pistol', [X, X, X, X, X, X, X, X, 'shotgun', X]),
 'uncommon_17': ('lmg', [X, X, 'grenade', 'grenade', 'rocket', 'flamer', 'harpoon', 'sprayer', 'rifle', 'sniper']),
 'uncommon_18': ('smg', None),
 'uncommon_19': ('rifle', [X, X, X, X, X, X, X, X, X, 'sniper']),
 'uncommon_20': ('pistol', None),
 'uncommon_21': ('plasma', [X, X, X, X, X, 'grenade', 'spreader', X, 'rail', X]),
 'uncommon_22': ('plasma', ['rocket', X, X, X, 'rail', X, X, 'spreader', 'minigun', 'lightning']),
 'uncommon_23': ('plasma', ['rocket', 'flamer', X, 'lightning', 'lightning', 'rail', 'spreader', 'grenade', 'lightning', X]),
}
ROWS = {'common_08': 6, 'common_11': 6, 'common_20': 9, 'common_22': 9, 'rare_07': 6}

NOUNS = {
 'pistol': ['Sidearm', 'Service Pistol', 'Autoloader', 'Handgun', 'Peacekeeper', 'Blaster', 'Hand Cannon', 'Ninemil'],
 'revolver': ['Revolver', 'Six-Shooter', 'Magnum', 'Wheelgun', 'Hogleg', 'Peacemaker'],
 'smg': ['SMG', 'Stinger', 'Chopper', 'Machine Pistol', 'Spitter', 'Bullet Hose'],
 'rifle': ['Rifle', 'Carbine', 'Battle Rifle', 'Assault Rifle', 'Repeater', 'Ranger'],
 'lmg': ['LMG', 'Squad Gun', 'Suppressor', 'Belt Gun', 'Light Machine Gun'],
 'sniper': ['Sniper', 'Longshot', 'Marksman Rifle', 'Deadeye', 'Lancer'],
 'shotgun': ['Shotgun', 'Scattergun', 'Boomstick', 'Breacher', 'Pump-Action'],
 'super_shotgun': ['Double Barrel', 'Coach Gun', 'Super Shotgun', 'Hydra', 'Twin Thunder'],
 'minigun': ['Minigun', 'Gatling', 'Shredder', 'Rotary Cannon', 'Buzzsaw'],
 'rocket': ['Rocket Launcher', 'Missile Pod', 'Bazooka', 'Howitzer', 'Siege Tube'],
 'grenade': ['Grenade Launcher', 'Thumper', 'Bomb Lobber', 'Drum Cannon', 'Mortar'],
 'nailgun': ['Nail Driver', 'Nailstorm', 'Spiker'],
 'plasma': ['Plasma Caster', 'Pulse Cannon', 'Ray Gun', 'Emitter', 'Reactor Gun', 'Orb Cannon'],
 'rail': ['Railgun', 'Lance', 'Beam Rifle', 'Spear Cannon', 'Linear Driver'],
 'flamer': ['Flamethrower', 'Torch', 'Pyre', 'Scorcher'],
 'sprayer': ['Sprayer', 'Mister', 'Fogger', 'Dispersal Gun'],
 'lightning': ['Lightning Gun', 'Tesla Coil', 'Arc Caster', 'Storm Rod'],
 'launcher': ['Disc Launcher', 'Saw Thrower', 'Ring Caster', 'Ripper'],
 'spreader': ['Spreader', 'Scatter Cannon', 'Fan Caster', 'Shard Thrower'],
 'harpoon': ['Harpoon Gun', 'Spear Gun', 'Whaler'],
 'crossbow': ['Crossbow', 'Bolt Thrower', 'Longbow', 'Arbalest'],
 'javelin': ['Javelin', 'Spear', 'Pilum', 'Lance'],
 'shuriken': ['Throwing Star', 'Chakram', 'Shuriken', 'Disc'],
 'blade': ['Blade', 'Sword', 'Cleaver', 'Axe', 'Dagger', 'Edge', 'Machete'],
 'mace': ['Mace', 'Maul', 'Warhammer', 'Flail', 'Morning Star', 'Crusher'],
 'club': ['Club', 'Bat', 'Bludgeon', 'Cudgel', 'Pipe'],
}
ADJ = {'fire': ['Ember', 'Cinder', 'Inferno', 'Magma', 'Blaze'], 'ice': ['Frost', 'Glacier', 'Cryo', 'Rime'], 'lightning': ['Volt', 'Storm', 'Arc', 'Tesla'],
       'poison': ['Venom', 'Toxin', 'Blight', 'Bile'], 'void': ['Void', 'Abyss', 'Null', 'Eclipse'], 'holy': ['Gilded', 'Seraph', 'Sun', 'Halo'],
       'plasma': ['Plasma', 'Ion', 'Fusion', 'Quasar'], 'blood': ['Blood', 'Crimson', 'Sanguine', 'Vein'], 'arcane': ['Hex', 'Rune', 'Mystic', 'Astral'],
       'physical': ['Iron', 'Steel', 'Rust', 'Black', 'Grim', 'Field', 'Trench', 'Scrap', 'Old', 'Heavy']}
ENERGY = {'plasma', 'rail', 'lightning', 'spreader', 'sprayer', 'flamer'}

def element_of(icon, arch):
    a = np.asarray(icon.convert('RGBA')).astype(float)
    m = a[..., 3] > 128
    if m.sum() < 20:
        return 'physical'
    rgb = a[..., :3][m]
    mx, mn = rgb.max(1), rgb.min(1)
    sat = (mx - mn) / np.maximum(mx, 1)
    glow = (sat > 0.55) & (mx > 170)
    frac = glow.mean()
    if frac < (0.035 if arch in ENERGY else 0.09):
        return 'physical' if arch not in ENERGY else 'plasma'
    r, g, b = rgb[glow].mean(0)
    if r > g * 1.6 and r > b * 1.6: return 'fire' if g > b else 'blood'
    if r > b and g > b * 1.3 and r > g * 1.15: return 'fire'
    if r > b and g > b * 1.3: return 'holy'
    if g > r * 1.3 and g > b * 1.1: return 'poison'
    if b > r and b > g * 1.25: return 'arcane' if r > g * 1.1 else 'lightning'
    if b >= g and g > r * 1.3: return 'ice'
    if r > g and b > g: return 'void'
    return 'plasma'

cfg = json.load(open(C))
cfg['sheets'] = [s for s in cfg['sheets'] if not (s['type'] == 'weapon_set' and s['id'] != 'smg_set_01')]
used = set()
total = 0
for path in sorted(glob.glob(os.path.join(ROOT, 'art/raw/weapons/*/*.webp'))):
    stem = os.path.splitext(os.path.basename(path))[0]
    rarity = os.path.basename(os.path.dirname(path))
    spec = A.get(stem)
    if not spec:
        print('no catalogue entry for', stem); continue
    default, rows = spec[0], spec[1]
    n = spec[2] if len(spec) > 2 else (len(rows) if rows else ROWS.get(stem, 10 if rarity in ('common', 'uncommon') else 5))
    sid = 'w_' + stem
    icons_png = os.path.join(ROOT, 'assets/sprites/weapons/auto_%s_%s_icons.png' % (rarity, stem))
    icon_img = Image.open(icons_png) if os.path.exists(icons_png) else None
    rnd = random.Random(stem)
    weapons = []
    for i in range(n):
        arch = (rows[i] if rows and i < len(rows) and rows[i] else default)
        el = 'physical'
        if icon_img is not None:
            ih = icon_img.height // max(1, round(icon_img.height / (icon_img.height / n)))
            ih = icon_img.height // n
            el = element_of(icon_img.crop((0, i * ih, icon_img.width, (i + 1) * ih)), arch)
        for _ in range(20):
            name = '%s %s' % (rnd.choice(ADJ[el]), rnd.choice(NOUNS[arch]))
            if name not in used: break
        used.add(name)
        weapons.append({'id': '%s_%d' % (sid, i), 'name': name, 'element': el, 'archetype': arch})
    total += n
    cfg['sheets'].append({'id': sid, 'type': 'weapon_set', 'rarity': rarity, 'archetype': default, 'src': os.path.relpath(path, ROOT),
                          'outFP': 'assets/sprites/weapons/%s_fp.png' % sid, 'outIcons': 'assets/sprites/weapons/%s_icons.png' % sid,
                          'muzzle': [0.45, 0.12], 'weapons': weapons})
json.dump(cfg, open(C, 'w'), indent=1)
print(total, 'weapons catalogued')
