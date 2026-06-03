/**
 * Shop system — token catalog + per-user inventory
 *
 * Slots:
 *   ttt_x       — emoji shown on the player's X board squares
 *   ttt_o       — emoji shown on the player's O board squares
 *   ttt_turn    — emoji shown next to their name when it's their turn
 *
 * Catalog: admin-defined tokens with emoji, name, price, slot
 * Inventory: players buy tokens and equip one per slot
 */
const { db } = require('./database');

// ── Catalog — add/remove tokens here ────────────────────────────────────────
// slot: 'ttt_piece' = usable as X or O  |  'ttt_turn' = turn indicator
const CATALOG = [
  // ── Defaults (free) ──────────────────────────────────────────────────────────
  { id: 'piece_patricia',   slot: 'ttt_piece', emoji: '<:patricia:1478990722135887902>',              name: 'Patricia',          price: 0    },
  { id: 'piece_donkey',     slot: 'ttt_piece', emoji: '<:Donkey:1478985472503054428>',                name: 'Donkey',            price: 0    },
  { id: 'turn_default',     slot: 'ttt_turn',  emoji: '▶️',                                          name: 'Arrow',             price: 0    },

  // ── Non-Animated 500 oops ─────────────────────────────────────────────────────
  { id: 'piece_cube',       slot: 'ttt_piece', emoji: '<:cube:1479234101624967300>',                  name: 'Heart Cube',        price: 500  },
  { id: 'piece_ppbutter',   slot: 'ttt_piece', emoji: '<:powderpuffbuttercup:1479234113213960262>',   name: 'Powerpuff',         price: 500  },
  { id: 'piece_ppblossom',  slot: 'ttt_piece', emoji: '<:powerpuffblossom:1479234115168505990>',      name: 'Powerpuff 2',       price: 500  },
  { id: 'piece_pp3',        slot: 'ttt_piece', emoji: '<:powerpuff:1479234118591185006>',             name: 'Powerpuff 3',       price: 500  },
  { id: 'piece_evilapple',  slot: 'ttt_piece', emoji: '<:evilapple:1479234120184762368>',             name: 'Evil Apple',        price: 500  },
  { id: 'piece_planet',     slot: 'ttt_piece', emoji: '<:planetyt:1479234126526681190>',              name: 'Planet',            price: 500  },
  { id: 'piece_witchcat',   slot: 'ttt_piece', emoji: '<:witchcat:1479234138971177110>',              name: 'Witch Cat',         price: 500  },
  { id: 'piece_coffee',     slot: 'ttt_piece', emoji: '<:coffee:1479234150060916796>',                name: 'Coffee',            price: 500  },
  { id: 'piece_terrifier',  slot: 'ttt_piece', emoji: '<:terrifier:1479234151029805056>',             name: 'Terrifier',         price: 500  },
  { id: 'piece_chucky',     slot: 'ttt_piece', emoji: '<:chucky:1479234157635829790>',                name: 'Chucky',            price: 500  },
  { id: 'piece_crown',      slot: 'ttt_piece', emoji: '<:crown:1479234159183401051>',                 name: 'Crown',             price: 500  },
  { id: 'piece_freddy',     slot: 'ttt_piece', emoji: '<:freddykrueger:1479234162652348436>',         name: 'Freddy Krueger',    price: 500  },
  { id: 'piece_woozy',      slot: 'ttt_piece', emoji: '<:woozykisses:1479234166108328039>',           name: 'Woozy Kisses',      price: 500  },
  { id: 'piece_superman',   slot: 'ttt_piece', emoji: '<:supermanwhatisthis:1479234167475539989>',    name: 'Superman',          price: 500  },
  { id: 'piece_gengar',     slot: 'ttt_piece', emoji: '<:gengar:1479234171665649766>',                name: 'Gengar',            price: 500  },
  { id: 'piece_icebear',    slot: 'ttt_piece', emoji: '<a:icebeargoomy:1479234175788781578>',         name: 'Ice Bear',          price: 500  },
  { id: 'piece_brownbear',  slot: 'ttt_piece', emoji: '<a:brownbeargoomy:1479234176560402442>',       name: 'Brown Bear',        price: 500  },
  { id: 'piece_vaporskull', slot: 'ttt_piece', emoji: '<:vaporwaveskull:1479234178150174853>',        name: 'Skull',             price: 500  },

  // ── Animated 1000 oops ────────────────────────────────────────────────────────
  { id: 'piece_marlboro',   slot: 'ttt_piece', emoji: '<a:marlborospin:1479234103894216880>',         name: 'Marlboro',          price: 1000 },
  { id: 'piece_alien',      slot: 'ttt_piece', emoji: '<a:alienangel:1479234117101944923>',           name: 'Alien Angel',       price: 1000 },
  { id: 'piece_pinkpaw',    slot: 'ttt_piece', emoji: '<a:paw:1479234128699195463>',                  name: 'Pink Paw',          price: 1000 },
  { id: 'piece_earth',      slot: 'ttt_piece', emoji: '<a:earth:1479234132000247858>',                name: 'Earth',             price: 1000 },
  { id: 'piece_fairy',      slot: 'ttt_piece', emoji: '<a:fairy:1479234139982008381>',                name: 'Fairy',             price: 1000 },
  { id: 'piece_pinkpeace',  slot: 'ttt_piece', emoji: '<a:pinkpeacesign:1479234141265334332>',        name: 'Pink Peace Sign',   price: 1000 },
  { id: 'piece_grimreaper', slot: 'ttt_piece', emoji: '<a:grimreaper:1479234147170914525>',           name: 'Grim Reaper',       price: 1000 },
  { id: 'piece_pinkgengar', slot: 'ttt_piece', emoji: '<a:pinkgengar:1479234134294401148>',           name: 'Pink Gengar',       price: 1000 },
  { id: 'piece_xmastree',   slot: 'ttt_piece', emoji: '<a:christmastree:1479234148098117836>',        name: 'Christmas Tree',    price: 1000 },
  { id: 'piece_pinkcrystal',slot: 'ttt_piece', emoji: '<a:spinningpinkcrystalheart:1479234163788742811>', name: 'Pink Crystal Heart', price: 1000 },
  { id: 'piece_pinkknife',  slot: 'ttt_piece', emoji: '<a:pinkknife:1479234164900368494>',            name: 'Pink Knife',        price: 1000 },
  { id: 'piece_mariorun',   slot: 'ttt_piece', emoji: '<a:marionarutorun:1479234173066543204>',       name: 'Mario Run',         price: 1000 },
  { id: 'piece_bears',      slot: 'ttt_piece', emoji: '<a:webarebearsgoomy:1479234174517772500>',     name: 'Bears',             price: 1000 },
  { id: 'piece_rosesparkle',slot: 'ttt_piece', emoji: '<a:rose_sparkle:1479234179488284785>',         name: 'Rose Sparkle',      price: 1000 },
  { id: 'piece_lipssparkle',slot: 'ttt_piece', emoji: '<a:sparkle_lips:1479234180394254396>',         name: 'Lips Sparkle',      price: 1000 },


];

const SLOT_LABELS = {
  ttt_piece: '🎮 Piece (X & O)',
  ttt_x:     '🎮 X Piece',
  ttt_o:     '🎮 O Piece',
  ttt_turn:  '▶️ Turn Indicator',
};

const shop = {
  CATALOG,
  SLOT_LABELS,

  async init() {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS shop_inventory (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id   TEXT NOT NULL,
        token_id  TEXT NOT NULL,
        bought_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, token_id)
      );
      CREATE TABLE IF NOT EXISTS shop_equipped (
        user_id   TEXT NOT NULL,
        slot      TEXT NOT NULL,
        token_id  TEXT NOT NULL,
        PRIMARY KEY (user_id, slot)
      );
    `);
    // Legacy migration — keep old shop_items working
    await db.exec(`
      CREATE TABLE IF NOT EXISTS shop_items (
        user_id   TEXT NOT NULL,
        item_type TEXT NOT NULL,
        emoji     TEXT NOT NULL,
        equipped  INTEGER DEFAULT 1,
        bought_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, item_type)
      );
    `).catch(() => {});
  },

  // Get all tokens a user owns (including free defaults)
  async getInventory(userId) {
    const rows = await db.all('SELECT token_id FROM shop_inventory WHERE user_id = ?', [userId]);
    const owned = new Set(rows.map(r => r.token_id));
    CATALOG.filter(t => t.price === 0).forEach(t => owned.add(t.id));
    return CATALOG.filter(t => owned.has(t.id));
  },

  async hasToken(userId, tokenId) {
    const token = CATALOG.find(t => t.id === tokenId);
    if (!token) return false;
    if (token.price === 0) return true;
    const row = await db.get('SELECT id FROM shop_inventory WHERE user_id = ? AND token_id = ?', [userId, tokenId]);
    return !!row;
  },

  async buyToken(userId, tokenId) {
    await db.run('INSERT OR IGNORE INTO shop_inventory (user_id, token_id) VALUES (?, ?)', [userId, tokenId]);
  },

  // Equip any token — piece tokens always go to 'ttt_piece' slot
  async equip(userId, tokenId) {
    const token = CATALOG.find(t => t.id === tokenId);
    if (!token) return false;
    const slot = token.slot; // 'ttt_piece' or 'ttt_turn'
    await db.run(
      'INSERT OR REPLACE INTO shop_equipped (user_id, slot, token_id) VALUES (?, ?, ?)',
      [userId, slot, tokenId]
    );
    return true;
  },

  async db_equipSlot(userId, slot, tokenId) {
    await this.equip(userId, tokenId);
  },

  // Get equipped token — ttt_x and ttt_o both use the single 'ttt_piece' slot
  async getEquipped(userId, slot) {
    const lookupSlot = (slot === 'ttt_x' || slot === 'ttt_o') ? 'ttt_piece' : slot;
    const row = await db.get('SELECT token_id FROM shop_equipped WHERE user_id = ? AND slot = ?', [userId, lookupSlot]);
    if (!row) {
      if (slot === 'ttt_x') return CATALOG.find(t => t.id === 'piece_patricia');
      if (slot === 'ttt_o') return CATALOG.find(t => t.id === 'piece_donkey');
      return CATALOG.find(t => t.slot === 'ttt_turn' && t.price === 0) || null;
    }
    return CATALOG.find(t => t.id === row.token_id) || null;
  },

  // Used by tictactoe.js — both ttt_x and ttt_o pull from single ttt_piece slot
  async getItem(userId, itemType) {
    const slotMap = { ttt_x: 'ttt_x', ttt_o: 'ttt_o', ping_emoji: 'ttt_turn', ttt_turn: 'ttt_turn' };
    const slot = slotMap[itemType];
    if (!slot) return null;
    const token = await this.getEquipped(userId, slot);
    if (!token) return null;
    return { emoji: token.emoji, equipped: 1 };
  },

  async setItem(userId, itemType, emoji) {
    await db.run(
      'INSERT OR REPLACE INTO shop_items (user_id, item_type, emoji, equipped) VALUES (?, ?, ?, 1)',
      [userId, itemType, emoji]
    );
  },

  async getUserItems(userId) {
    return db.all('SELECT * FROM shop_items WHERE user_id = ?', [userId]);
  },

  price(itemType) {
    return { ttt_x: 500, ttt_o: 500, ping_emoji: 300 }[itemType] || 0;
  },

  SHOP_PRICES: { ttt_x: 500, ttt_o: 500, ping_emoji: 300 },
};

module.exports = shop;
