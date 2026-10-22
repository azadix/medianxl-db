import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { isTswEnvelope, mapTswItemsToSnapshot } from '@/planner/tsw-build-import.js';
import {
  plannerItemToTswRow,
  savedBuildName,
  setSavedBuildName,
  wrapPlannerBuildForTswExport,
} from '@/planner/tsw-build-export.js';

const helm = {
  id: 'u:petulant:ssu',
  name: 'The Petulant',
  rarity: 'unique',
  uniqueKind: 'ssu',
  baseName: 'Hard Leather Armor (Sacred)',
  category: 'armor',
  slot: 'tors',
  reqLevel: 100,
  reqStr: 550,
  icon: 'invhvy',
  modifiers: ['+200% Enhanced Defense'],
};

describe('tsw build export', () => {
  it('emits TSW item rows with Gear slot names', () => {
    const row = plannerItemToTswRow(helm, { extras: ['+20 Required Level'] }, { location: 'Gear', slot: 'Torso' });
    expect(row.item).toBe('The Petulant');
    expect(row.location).toBe('Gear');
    expect(row.slot).toBe('Torso');
    expect(row.quality).toBe('Unique');
    expect(row.display_quality).toBe('SSU');
    expect(row.type).toBe('Hard Leather Armor (SSU)');
    expect(Array.isArray(row.description_lines)).toBe(true);
    expect(row.mystic_orbs).toEqual([]);
    expect(row.socketables).toEqual([]);
  });

  it('wraps a native planner snapshot in the TSW envelope', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [helm];
    store.catalogLoaded = true;
    const envelope = wrapPlannerBuildForTswExport(
      {
        name: 'Test',
        class: 'Amazon',
        level: 120,
        version: '2.14',
        skillPoints: { Barrage: 20 },
        oSkills: {},
        allSkillsBonus: 2,
        stats: '{{life}}=100',
        items: {
          weaponSet: 0,
          equipment: { tors: { defId: 'u:petulant:ssu', extras: ['+20 Required Level'] } },
          inventory: [],
          charms: [],
          relics: [],
        },
      },
      store
    );
    expect(isTswEnvelope(envelope)).toBe(true);
    expect(envelope.ok).toBe(true);
    expect(envelope.api_version).toBe(1);
    expect(envelope.build.name).toBe('Test');
    expect(envelope.build.items).toBeUndefined();
    expect(envelope.items).toHaveLength(1);
    expect(envelope.items[0].slot).toBe('Torso');
    const { snapshot } = mapTswItemsToSnapshot(envelope.items, store, 'Amazon');
    expect(snapshot.equipment.tors.defId).toBe('u:petulant:ssu');
    expect(envelope.build.items).toBeUndefined();
    expect(savedBuildName(envelope)).toBe('Test');
    setSavedBuildName(envelope, 'Renamed');
    expect(savedBuildName(envelope)).toBe('Renamed');
  });
});
