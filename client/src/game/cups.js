// Grand Prix cups: three races in a row, points per finishing place, a podium at the end.
export const CUPS = Object.freeze([
  { id: 'kueste', name: 'Küsten-Cup', maps: ['coast', 'canyon', 'neon'], color: '#ff653d' },
  { id: 'wildnis', name: 'Wildnis-Cup', maps: ['jungle', 'savanna', 'forest'], color: '#7ad35a' },
  { id: 'gipfel', name: 'Gipfel-Cup', maps: ['volcano', 'glacier', 'sakura'], color: '#ffd04a' },
  { id: 'sterne', name: 'Sternen-Cup', maps: ['stars', 'sky', 'moon'], color: '#bda0ff' },
  { id: 'abenteuer', name: 'Abenteuer-Cup', maps: ['pirate', 'candy', 'castle'], color: '#ff8ac0' },
  { id: 'kosmos', name: 'Kosmos-Cup', maps: ['arctic', 'rooftops', 'galaxy'], color: '#7af4ff' },
].map(cup => Object.freeze({ ...cup, maps: Object.freeze(cup.maps) })));

export const CUP_POINTS = Object.freeze([15, 12, 10, 8, 6, 4, 2, 1]);
export const CUP_TROPHIES = Object.freeze(['gold', 'silver', 'bronze']);
export const cupById = id => CUPS.find(cup => cup.id === id) || CUPS[0];

// Finishing order of one race: the player at their place, the bots by how far they got when the player crossed the line.
export function raceOrder(playerPlace, player, bots) {
  const order = [...bots].sort((a, b) => b.progress - a.progress);
  order.splice(Math.max(0, Math.min(order.length, playerPlace - 1)), 0, player);
  return order;
}

// Adds one race to the running totals ({ id → { …driver, points, places: [] } }) and returns the new table.
export function addRace(totals, order) {
  const next = { ...totals };
  order.forEach((driver, i) => {
    const old = next[driver.id] || { ...driver, points: 0, places: [] };
    next[driver.id] = { ...old, points: old.points + (CUP_POINTS[i] || 0), places: [...old.places, i + 1] };
  });
  return next;
}

// Sorted standings: most points first; ties go to the better last result.
export function standings(totals) {
  return Object.values(totals).sort((a, b) => b.points - a.points || (a.places.at(-1) ?? 9) - (b.places.at(-1) ?? 9));
}
