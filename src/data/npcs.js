// Space-station NPCs. They use the robot enemy sprite (Piston Monk) with a
// palette swap each, per the design brief. Swap `sprite` to a dedicated NPC
// sheet id once one is uploaded.
//
// Upgrade recipes: each step adds reagent `id` once the target upgrade level
// reaches `from`: amount = base + (level - from) * per.
export const NPCS = [
  {
    id: 'vendor', name: 'VEND-0R', title: 'Arms Dealer', role: 'shop', sprite: 'piston_monk',
    palette: { sat: 0.35, tint: [1.7, 1.35, 0.55], glow: [0.1, 0.07, 0] },
    lines: ['Credits for carnage, carnage for credits. Browse.', 'Fresh salvage from the possessed decks. Barely haunted.', 'I buy anything. Even the screaming ones.', 'No refunds. The previous owners are not available for comment.'],
  },
  {
    id: 'gunsmith', name: 'KAINE-7', title: 'Gunsmith', role: 'upgrade', kinds: ['weapon'], sprite: 'piston_monk',
    palette: { sat: 0.3, tint: [1.7, 0.6, 0.5], glow: [0.12, 0.02, 0] },
    recipe: [
      { id: 'nano_paste', from: 1, base: 2, per: 1 },
      { id: 'servo_scrap', from: 1, base: 1, per: 0.7 },
      { id: 'static_coil', from: 3, base: 1, per: 0.5 },
      { id: 'logic_chip', from: 5, base: 1, per: 0.4 },
      { id: 'boss_soul_shard', from: 7, base: 1, per: 0.34 },
      { id: 'tyrant_heart', from: 11, base: 1, per: 0.25 },
      { id: 'astral_sigil', from: 14, base: 1, per: 0.5 },
    ],
    lines: ['Bring me a gun and the guts of whatever you shot. I\'ll make it angrier.', 'Every bolt I tighten is a scream you won\'t hear.', 'This one has potential. And a slight curse.'],
  },
  {
    id: 'armorer', name: 'BULWARK', title: 'Armorer', role: 'upgrade', kinds: ['head', 'body', 'legs'], sprite: 'piston_monk',
    palette: { sat: 0.25, tint: [0.75, 0.95, 1.6], glow: [0, 0.04, 0.1] },
    recipe: [
      { id: 'nano_paste', from: 1, base: 2, per: 1 },
      { id: 'brimstone_shard', from: 1, base: 1, per: 0.6 },
      { id: 'servo_scrap', from: 2, base: 1, per: 0.5 },
      { id: 'penitent_chain', from: 5, base: 1, per: 0.34 },
      { id: 'demon_ichor', from: 7, base: 1, per: 0.4 },
      { id: 'boss_soul_shard', from: 8, base: 1, per: 0.34 },
      { id: 'tyrant_heart', from: 11, base: 1, per: 0.25 },
    ],
    lines: ['Plating stops claws. Mostly.', 'Hold still. This will only hurt the armor.', 'The Penitent\'s chains make excellent rivets.'],
  },
  {
    id: 'jeweler', name: 'OPALINE', title: 'Ringsmith', role: 'upgrade', kinds: ['ring'], sprite: 'piston_monk',
    palette: { sat: 0.35, tint: [1.4, 0.7, 1.7], glow: [0.08, 0.02, 0.12] },
    recipe: [
      { id: 'nano_paste', from: 1, base: 1, per: 1 },
      { id: 'static_coil', from: 1, base: 1, per: 0.7 },
      { id: 'urchin_spine', from: 3, base: 1, per: 0.4 },
      { id: 'void_crystal', from: 6, base: 1, per: 0.4 },
      { id: 'boss_soul_shard', from: 7, base: 1, per: 0.34 },
      { id: 'astral_sigil', from: 12, base: 1, per: 0.4 },
    ],
    lines: ['Rings remember. I teach them to remember louder.', 'A little void crystal and this band will sing.', 'Careful. That one bites its wearer on Tuesdays.'],
  },
  {
    id: 'quartermaster', name: 'LEDGER', title: 'Quartermaster', role: 'bag', sprite: 'piston_monk',
    palette: { sat: 0.3, tint: [0.7, 1.55, 0.7], glow: [0, 0.08, 0.02] },
    lines: ['More pockets? Pockets cost. Dimensional pockets cost more.', 'I can fold space into your pack. Five slots at a time.', 'Two hundred slots is the legal limit. Of physics.'],
  },
];
