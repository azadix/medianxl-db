/**
 * @file Tests for charm/relic enable lists and relic skill resolve.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore, itemsSnapshotHasState } from '@/stores/items.js';
import { MAX_RELICS, resolveRelicSkill, relicSlugFromId } from '@/items/relic-items.js';
import { isCharmItem } from '@/items/charm-items.js';
import * as skillDataStore from '@/shared/skill-data-store.js';
import * as versionConfig from '@/shared/version-config.js';
import * as utils from '@/shared/utils.js';

const charmA = {
  id: 'a60',
  name: "The Butcher's Tooth",
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  invWidth: 1,
  invHeight: 1,
  rarity: 'unique',
  icon: 'invbut',
  reqLevel: 100,
  modifiers: ['+10 to all Attributes'],
};

const charmB = {
  id: '|ld',
  name: "Lylia's Curse",
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  invWidth: 1,
  invHeight: 1,
  rarity: 'unique',
  icon: 'lyliascharm',
  reqLevel: 120,
  modifiers: ['+20 Life Regenerated per Second'],
};

const relicA = {
  id: 'relic:abyss',
  name: 'Relic (Abyss)',
  type: 'jewl',
  category: 'relics',
  keepInInventory: true,
  invWidth: 1,
  invHeight: 1,
  rarity: 'relic',
  icon: 'invjw1',
  reqLevel: 75,
  modifiers: ['+(19 to 29) to Abyss'],
};

const relicB = {
  id: 'relic:bone-spear',
  name: 'Relic (Bone Spear)',
  type: 'jewl',
  category: 'relics',
  keepInInventory: true,
  invWidth: 1,
  invHeight: 1,
  rarity: 'relic',
  icon: 'invjw1',
  reqLevel: 75,
  modifiers: ['+(10 to 20) to Bone Spear'],
};

const relicC = {
  id: 'relic:fire-ball',
  name: 'Relic (Fire Ball)',
  type: 'jewl',
  category: 'relics',
  keepInInventory: true,
  invWidth: 1,
  invHeight: 1,
  rarity: 'relic',
  icon: 'invjw1',
  reqLevel: 75,
  modifiers: ['+(10 to 20) to Fire Ball'],
};

const relicD = {
  id: 'relic:frost-nova',
  name: 'Relic (Frost Nova)',
  type: 'jewl',
  category: 'relics',
  keepInInventory: true,
  invWidth: 1,
  invHeight: 1,
  rarity: 'relic',
  icon: 'invjw1',
  reqLevel: 75,
  modifiers: ['+(10 to 20) to Frost Nova'],
};

function seedCatalog(store) {
  store.catalog = [charmA, charmB, relicA, relicB, relicC, relicD];
  store.catalogLoaded = true;
}

describe('isCharmItem vs relics', () => {
  it('does not treat relics as charms', () => {
    expect(isCharmItem(charmA)).toBe(true);
    expect(isCharmItem(relicA)).toBe(false);
  });
});

describe('relic skill resolve', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('strips relic: prefix', () => {
    expect(relicSlugFromId('relic:abyss')).toBe('abyss');
    expect(relicSlugFromId('relic:maelstrom-mki')).toBe('maelstrom-mki');
  });

  it('resolves by skill id', () => {
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      getSkillDetail: (id) =>
        id === 'abyss'
          ? { id: 'abyss', display_name: 'Abyss', image: 'icons-nec_12', className: 'Necromancer' }
          : null,
      catalogByInternalId: new Map(),
    });
    const skill = resolveRelicSkill(relicA);
    expect(skill?.id).toBe('abyss');
    expect(skill?.image).toBe('icons-nec_12');
  });

  it('falls back by stripping variant suffix then display name', () => {
    const byId = new Map([
      [
        'maelstrom',
        { id: 'maelstrom', displayName: 'Maelstrom', image: 'icons-sor_3', classId: 3 },
      ],
    ]);
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      getSkillDetail: (id) => {
        const row = byId.get(id);
        if (!row) return null;
        return {
          id: row.id,
          display_name: row.displayName,
          image: row.image,
          className: 'Sorceress',
        };
      },
      catalogByInternalId: byId,
      primaryClassDisplayName: () => 'Sorceress',
    });
    const skill = resolveRelicSkill({
      id: 'relic:maelstrom-mki',
      name: 'Relic (Maelstrom)',
      category: 'relics',
      rarity: 'relic',
    });
    expect(skill?.id).toBe('maelstrom');
    expect(skill?.image).toBe('icons-sor_3');
  });

  it('maps hyphenated relic slugs to underscore skill ids', () => {
    const byId = new Map([
      [
        'arrow',
        { id: 'arrow', displayName: 'Arrow', image: 'icons-shared_missing', classId: 1 },
      ],
      [
        'arrow_swarm',
        { id: 'arrow_swarm', displayName: 'Arrow Swarm', image: 'icons-shared_126', classId: 1 },
      ],
    ]);
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      getSkillDetail: (id) => {
        const row = byId.get(id);
        if (!row) return null;
        return {
          id: row.id,
          display_name: row.displayName,
          image: row.image,
          className: 'Amazon',
        };
      },
      catalogByInternalId: byId,
      primaryClassDisplayName: () => 'Amazon',
    });
    const skill = resolveRelicSkill({
      id: 'relic:arrow-swarm',
      name: 'Relic (Arrow Swarm)',
      category: 'relics',
      rarity: 'relic',
    });
    expect(skill?.id).toBe('arrow_swarm');
    expect(skill?.image).toBe('icons-shared_126');
  });
});

describe('items store enable lists', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    seedCatalog(store);
  });

  it('toggles charms and enableAllCharms', () => {
    expect(store.toggleCharm(charmA.id, true)).toBe(true);
    expect(store.enabledCharms[charmA.id]).toBeTypeOf('number');
    expect(store.isEnabled('charms', charmA.id)).toBe(true);

    const added = store.enableAllCharms();
    expect(added).toBe(1);
    expect(Object.keys(store.enabledCharms)).toHaveLength(2);

    expect(store.toggleCharm(charmA.id, false)).toBe(true);
    expect(store.enabledCharms[charmA.id]).toBeUndefined();
  });

  it('enforces relic max of 3', () => {
    expect(store.toggleRelic(relicA.id, true)).toBe(true);
    expect(store.toggleRelic(relicB.id, true)).toBe(true);
    expect(store.toggleRelic(relicC.id, true)).toBe(true);
    expect(store.enabledRelicCount).toBe(MAX_RELICS);
    expect(store.toggleRelic(relicD.id, true)).toBe(false);
    expect(store.enabledRelics[relicD.id]).toBeUndefined();

    store.toggleRelic(relicA.id, false);
    expect(store.toggleRelic(relicD.id, true)).toBe(true);
  });

  it('roundtrips charms/relics in snapshot', () => {
    store.toggleCharm(charmA.id, true);
    store.toggleRelic(relicA.id, true);
    const id = store.enabledCharms[charmA.id];
    store.updateInstanceRolls(id, { charmTrophy: 1 });

    const snap = store.toSnapshot();
    expect(snap.charms).toEqual([{ defId: charmA.id, rolls: { charmTrophy: 1 } }]);
    expect(snap.relics.map((r) => r.defId)).toEqual([relicA.id]);

    store.resetItems();
    seedCatalog(store);
    store.fromSnapshot(snap);
    expect(store.isEnabled('charms', charmA.id)).toBe(true);
    expect(store.getRollsForInstance(store.enabledCharms[charmA.id])).toEqual({
      charmTrophy: 1,
    });
    expect(store.isEnabled('relics', relicA.id)).toBe(true);
  });

  it('migrates legacy inventory charms/relics into enable maps', () => {
    store.fromSnapshot({
      weaponSet: 0,
      equipment: {},
      inventory: [
        { slot: 0, defId: charmA.id, rolls: { charmTrophy: 1 } },
        { slot: 1, defId: relicA.id },
        { slot: 2, defId: relicB.id },
        { slot: 3, defId: relicC.id },
        { slot: 4, defId: relicD.id },
      ],
    });
    expect(store.isEnabled('charms', charmA.id)).toBe(true);
    expect(store.getRollsForInstance(store.enabledCharms[charmA.id])).toEqual({
      charmTrophy: 1,
    });
    expect(store.enabledRelicCount).toBe(3);
    expect(store.enabledRelics[relicD.id]).toBeUndefined();
    expect(store.inventory.every((v) => v == null)).toBe(true);
  });

  it('selectEnabledItem wires inspector slot', () => {
    store.toggleCharm(charmA.id, true);
    expect(store.selectEnabledItem('charms', charmA.id)).toBe(true);
    expect(store.selectedSlot).toEqual({ location: 'charms', slot: charmA.id });
    expect(store.editingInstanceId).toBe(store.enabledCharms[charmA.id]);
    expect(store.isPickerOpen).toBe(false);
  });

  it('filters and rejects class-restricted charms/relics for the wrong class', () => {
    const druidCharm = {
      id: 'ccdru',
      name: 'Caoi Dulra Fruit',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
      classRestriction: 'Druid Only',
    };
    const raidRelic = {
      id: 'relic:raid',
      name: 'Relic (Raid)',
      category: 'relics',
      rarity: 'relic',
      keepInInventory: true,
      classRestriction: 'Druid Only',
    };
    store.catalog = [charmA, druidCharm, relicA, raidRelic];

    store.syncViewerClassName('Amazon');
    expect(store.charmCatalog.map((d) => d.id)).toEqual([charmA.id]);
    expect(store.relicCatalog.map((d) => d.id)).toEqual([relicA.id]);
    expect(store.toggleCharm(druidCharm.id, true)).toBe(false);
    expect(store.toggleRelic(raidRelic.id, true)).toBe(false);

    store.syncViewerClassName('Druid');
    expect(store.charmCatalog.map((d) => d.id).sort()).toEqual([charmA.id, druidCharm.id].sort());
    expect(store.toggleRelic(raidRelic.id, true)).toBe(true);
    expect(store.isEnabled('relics', raidRelic.id)).toBe(true);

    store.syncViewerClassName('Assassin');
    expect(store.isEnabled('relics', raidRelic.id)).toBe(false);
    expect(store.relicCatalog.map((d) => d.id)).toEqual([relicA.id]);
  });

  it('allows only one Dimensional Key enabled at a time', () => {
    const arcana = {
      id: 'ebw',
      name: 'Dimensional Key - Arcana',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
    };
    const mandate = {
      id: 'ebw-mandate',
      name: 'Dimensional Key - Mandate',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
    };
    store.catalog = [charmA, arcana, mandate];

    expect(store.toggleCharm(arcana.id, true)).toBe(true);
    expect(store.toggleCharm(mandate.id, true)).toBe(true);
    expect(store.isEnabled('charms', arcana.id)).toBe(false);
    expect(store.isEnabled('charms', mandate.id)).toBe(true);

    const added = store.enableAllCharms();
    expect(added).toBe(1);
    expect(store.isEnabled('charms', charmA.id)).toBe(true);
    expect(Object.keys(store.enabledCharms).filter((id) => id.startsWith('ebw'))).toHaveLength(1);
  });

  it('treats charms-only and relics-only snapshots as persistable', () => {
    expect(itemsSnapshotHasState(store.toSnapshot())).toBe(false);
    expect(itemsSnapshotHasState(null)).toBe(false);
    expect(
      itemsSnapshotHasState({
        weaponSet: 0,
        equipment: { head: null },
        inventory: [],
        charms: [],
        relics: [],
      })
    ).toBe(false);

    store.toggleCharm(charmA.id, true);
    expect(itemsSnapshotHasState(store.toSnapshot())).toBe(true);

    store.resetItems();
    seedCatalog(store);
    store.toggleRelic(relicA.id, true);
    expect(itemsSnapshotHasState(store.toSnapshot())).toBe(true);
  });

  it('restores class-restricted charms/relics when viewer class is set first', () => {
    const druidCharm = {
      id: 'ccdru',
      name: 'Caoi Dulra Fruit',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
      classRestriction: 'Druid Only',
    };
    const raidRelic = {
      id: 'relic:raid',
      name: 'Relic (Raid)',
      category: 'relics',
      rarity: 'relic',
      keepInInventory: true,
      classRestriction: 'Druid Only',
    };
    store.catalog = [charmA, druidCharm, relicA, raidRelic];

    const snap = {
      weaponSet: 0,
      equipment: {},
      inventory: [],
      charms: [{ defId: druidCharm.id }],
      relics: [{ defId: raidRelic.id }],
    };

    store.syncViewerClassName('Amazon');
    store.fromSnapshot(snap);
    expect(store.isEnabled('charms', druidCharm.id)).toBe(false);
    store.pruneClassRestrictedEnableList();
    expect(store.isEnabled('relics', raidRelic.id)).toBe(false);

    store.syncViewerClassName('Druid');
    store.fromSnapshot(snap);
    store.pruneClassRestrictedEnableList();
    expect(store.isEnabled('charms', druidCharm.id)).toBe(true);
    expect(store.isEnabled('relics', raidRelic.id)).toBe(true);
  });
});

describe('item catalog version reload', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('refetches when the loaded catalog version folder differs', async () => {
    store.catalog = [{ id: 'stale' }];
    store.catalogLoaded = true;
    store.catalogVersionFolder = '2_13';

    vi.spyOn(versionConfig, 'getCurrentVersion').mockReturnValue({ major: 2, minor: 14 });
    vi.spyOn(utils, 'getAssetUrl').mockImplementation((p) => `http://local/${p}`);

    const jsonOk = (body) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });
    const fetchMock = vi.fn((url) => {
      const href = String(url);
      if (href.includes('baseitems.json') || href.includes('charms.json') || href.includes('other.json')) {
        return jsonOk([]);
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await store.loadCatalog();
    expect(fetchMock).toHaveBeenCalled();
    expect(store.catalogVersionFolder).toBe('2_14');
    expect(store.isCatalogCurrent).toBe(true);

    fetchMock.mockClear();
    await store.loadCatalog();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
