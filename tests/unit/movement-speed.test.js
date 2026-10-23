import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWalkRunBase } from '@/speedcalc/movement-baselines.js';
import {
  activeItemsFolder,
  collectMovePenaltyOptions,
  formatMovePenaltyOption,
  stripBaseItemTier,
} from '@/speedcalc/movement-armor-options.js';
import {
  FRAME_DISTANCE_YARDS,
  annotateBreakpointRows,
  buildBreakpointRows,
  computeMovement,
  computeSpeedCalc,
  effectiveItemFrw,
  framesForDistance,
  internalVelocity,
  movementSpeedPercent,
} from '@/speedcalc/movement-speed.js';

describe('movement-speed', () => {
  it('applies the item FRW curve', () => {
    expect(effectiveItemFrw(0)).toBe(0);
    expect(effectiveItemFrw(100)).toBe(60);
    expect(effectiveItemFrw(200)).toBe(85);
  });

  it('uses Median charstats walk/run', () => {
    expect(getWalkRunBase('Amazon', 'none')).toEqual({ walk: 10, run: 15 });
    expect(getWalkRunBase('Sorceress', 'none')).toEqual({ walk: 11, run: 15 });
    expect(getWalkRunBase('Barbarian', 'none')).toEqual({ walk: 10, run: 14 });
    expect(getWalkRunBase('Druid', 'wereowl')).toEqual({ walk: 11, run: 16 });
    expect(getWalkRunBase('Sorceress', 'deathlord')).toEqual({ walk: 11, run: 15 });
  });

  it('walks 10 and sprints 15 with no gear on Amazon', () => {
    const { walk, sprint } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 0,
    });
    expect(walk.speedPct).toBe(100);
    expect(walk.yardsPerSec).toBe(10);
    expect(walk.frames).toBe(25);
    expect(sprint.speedPct).toBe(150);
    expect(sprint.yardsPerSec).toBe(15);
    expect(sprint.frames).toBe(17);
  });

  it('counts integer frames for 10 floored yards', () => {
    expect(FRAME_DISTANCE_YARDS).toBe(10);
    const walkVel = internalVelocity(10, 100);
    expect(framesForDistance(walkVel)).toBe(25);
    const sprintVel = internalVelocity(10, 150);
    expect(framesForDistance(sprintVel)).toBe(17);
  });

  it('adds 100 item FRW as 60 effective', () => {
    const { walk, sprint } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 100,
    });
    expect(walk.speedPct).toBe(160);
    expect(walk.yardsPerSec).toBe(16);
    expect(sprint.speedPct).toBe(210);
    expect(sprint.yardsPerSec).toBe(21);
  });

  it('subtracts armor penalty outside the curve', () => {
    expect(
      movementSpeedPercent({
        itemFrw: 0,
        armorPenalty: 9,
        shieldPenalty: 9,
        walk: 10,
        run: 15,
      })
    ).toBe(82);
    const { walk } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 100,
      armorPenalty: 9,
    });
    expect(walk.speedPct).toBe(151);
  });

  it('adds skill movement speed at full value', () => {
    const { walk } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 100,
      skillFrw: 30,
    });
    expect(walk.speedPct).toBe(190);
  });

  it('annotates +N on the next breakpoint', () => {
    const input = { className: 'Amazon', morphId: 'none', itemFrw: 0, sprint: false };
    const rows = buildBreakpointRows(input);
    expect(rows[0]).toEqual({ frames: 25, value: 0 });
    const current = computeMovement({ ...input, itemFrw: 0 }).walk;
    const annotated = annotateBreakpointRows(rows, 0, current.frames);
    const currentRow = annotated.find((row) => row.current);
    const nextRow = annotated[annotated.indexOf(currentRow) + 1];
    expect(currentRow.frames).toBe(25);
    expect(nextRow.extra).toBe(nextRow.value);
    expect(nextRow.value).toBeGreaterThan(0);
  });

  it('reports current frames and next delta from computeSpeedCalc', () => {
    const out = computeSpeedCalc({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 20,
    });
    const current = out.walkRows.find((row) => row.current);
    const next = out.walkRows[out.walkRows.indexOf(current) + 1];
    expect(current).toBeTruthy();
    expect(next.extra).toBe(next.value - 20);
  });
});

describe('movement-armor-options', () => {
  it('strips tier suffixes from base names', () => {
    expect(stripBaseItemTier('Ancient Armor (1)')).toBe('Ancient Armor');
    expect(stripBaseItemTier('Full Plate Mail (Sacred)')).toBe('Full Plate Mail');
  });

  it('uses the is_active versions.json row', () => {
    const versions = JSON.parse(readFileSync(resolve('public/tree_data/versions.json'), 'utf8'));
    expect(activeItemsFolder(versions)).toBe('2_14');
  });

  it('lists unique armor and shield bases with penalties', () => {
    const items = JSON.parse(readFileSync(resolve('public/items/2_14/baseitems.json'), 'utf8'));
    const { armor, shields } = collectMovePenaltyOptions(items);
    expect(armor[0]).toMatchObject({ key: 'none', penalty: 0 });
    const ancient = armor.find((row) => row.name === 'Ancient Armor');
    expect(ancient.penalty).toBe(9);
    expect(formatMovePenaltyOption(ancient)).toBe('Ancient Armor (9)');
    expect(shields.some((row) => row.penalty === 3)).toBe(true);
    expect(shields.some((row) => row.name.toLowerCase().includes('shield') || row.penalty > 0)).toBe(
      true
    );
  });
});
