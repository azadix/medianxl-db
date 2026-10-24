import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getWalkRunBase,
  morphsForClass,
  parseSpeedCalcClassKey,
} from '@/speedcalc/movement-baselines.js';
import {
  activeItemsFolder,
  collectMovePenaltyOptions,
  formatMovePenaltyOption,
  stripBaseItemTier,
} from '@/speedcalc/movement-armor-options.js';
import {
  MOVE_CURSE_GROUPS,
  MOVE_CURSE_OPTIONS,
  formatMoveCurseOption,
  navigatorSkillFrw,
  sumSelectedMoveCurses,
} from '@/speedcalc/movement-debuff-options.js';
import {
  FRAME_DISTANCE_YARDS,
  annotateBreakpointRows,
  buildBreakpointRows,
  buildSpeedGraphSeries,
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
    expect(getWalkRunBase('Amazon', 'wereowl')).toEqual({ walk: 10, run: 15 });
    expect(getWalkRunBase('Sorceress', 'deathlord')).toEqual({ walk: 11, run: 15 });
    expect(morphsForClass('Druid').map((row) => row.id)).toEqual(['werewolf', 'wereowl', 'werebear']);
    expect(morphsForClass('Barbarian').map((row) => row.id)).toEqual(['treewarden']);
    expect(morphsForClass('Paladin').map((row) => row.id)).toEqual(['superbeast']);
    expect(morphsForClass('Assassin')).toEqual([]);
    expect(getWalkRunBase('Barbarian', 'treewarden')).toEqual({ walk: 10, run: 11 });
    expect(getWalkRunBase('Paladin', 'superbeast')).toEqual({ walk: 10, run: 15 });
    expect(morphsForClass('Amazon')).toEqual([]);
    expect(parseSpeedCalcClassKey('Druid:wereowl')).toEqual({ className: 'Druid', morphId: 'wereowl' });
    expect(parseSpeedCalcClassKey('Amazon:wereowl')).toEqual({ className: 'Amazon', morphId: 'none' });
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
    expect(sprint.speedPct).toBe(100);
    expect(sprint.yardsPerSec).toBe(15);
    expect(sprint.frames).toBe(17);
  });

  it('sprints at RunVelocity for Sorceress', () => {
    const { walk, sprint } = computeMovement({
      className: 'Sorceress',
      morphId: 'none',
      itemFrw: 0,
    });
    expect(walk.yardsPerSec).toBe(11);
    expect(sprint.speedPct).toBe(100);
    expect(sprint.yardsPerSec).toBe(15);
  });

  it('counts integer frames for 10 floored yards', () => {
    expect(FRAME_DISTANCE_YARDS).toBe(10);
    const walkVel = internalVelocity(10, 100);
    expect(framesForDistance(walkVel)).toBe(25);
    const sprintVel = internalVelocity(15, 100);
    expect(framesForDistance(sprintVel)).toBe(17);
  });

  it('builds walk and sprint graph points across item FRW', () => {
    const series = buildSpeedGraphSeries({
      className: 'Amazon',
      morphId: 'none',
    }, 100);
    expect(series.walk).toHaveLength(101);
    expect(series.walk[0]).toMatchObject({ itemFrw: 0, yardsPerSec: 10 });
    expect(series.sprint[0]).toMatchObject({ itemFrw: 0, yardsPerSec: 15 });
    expect(series.walk[100].yardsPerSec).toBe(16);
    expect(series.sprint[100].yardsPerSec).toBe(24);
  });

  it('adds 100 item FRW as 60 effective', () => {
    const { walk, sprint } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 100,
    });
    expect(walk.speedPct).toBe(160);
    expect(walk.yardsPerSec).toBe(16);
    expect(sprint.speedPct).toBe(160);
    expect(sprint.yardsPerSec).toBe(24);
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

  it('applies decrepify as linear velocitypercent', () => {
    const { walk } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 0,
      skillFrw: -30,
    });
    expect(walk.speedPct).toBe(70);
    expect(walk.yardsPerSec).toBe(7);
  });

  it('applies unseelie item FRW on the 150 curve', () => {
    const { walk } = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 0,
      curseItemFrw: -100,
    });
    expect(walk.speedPct).toBe(25);
    const stacked = computeMovement({
      className: 'Amazon',
      morphId: 'none',
      itemFrw: 100,
      curseItemFrw: -100,
    });
    expect(stacked.walk.speedPct).toBe(100);
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

describe('movement-debuff-options', () => {
  it('lists monster movement curses with engine amounts', () => {
    const decrep = MOVE_CURSE_OPTIONS.find((row) => row.key === 'decrepify');
    const unseelie = MOVE_CURSE_OPTIONS.find((row) => row.key === 'unseelie');
    expect(decrep).toMatchObject({ skillFrw: -30, itemFrw: 0 });
    expect(unseelie).toMatchObject({ skillFrw: 0, itemFrw: -100 });
    expect(formatMoveCurseOption(decrep)).toBe('Decrepify (-30%)');
    expect(formatMoveCurseOption(unseelie)).toBe('Unseelie Curse (-100%)');
    expect(MOVE_CURSE_GROUPS.map((g) => g.id)).toEqual(['item', 'after']);
    expect(sumSelectedMoveCurses(['decrepify', 'unseelie'])).toEqual({ skillFrw: -30, itemFrw: -100 });
    const phoboss = MOVE_CURSE_OPTIONS.find((row) => row.key === 'phoboss');
    const navigator = MOVE_CURSE_OPTIONS.find((row) => row.key === 'navigator');
    expect(phoboss).toMatchObject({ skillFrw: -20, itemFrw: 0 });
    expect(navigatorSkillFrw(1)).toBe(-40);
    expect(navigatorSkillFrw(10)).toBe(-58);
    expect(formatMoveCurseOption(phoboss)).toBe('Phoboss (-20%)');
    expect(formatMoveCurseOption(navigator, 1)).toBe('Navigator (-40%)');
    expect(formatMoveCurseOption(navigator, 10)).toBe('Navigator (-58%)');
    expect(sumSelectedMoveCurses(['navigator'], 10)).toEqual({ skillFrw: -58, itemFrw: 0 });
    const whirlwind = MOVE_CURSE_OPTIONS.find((row) => row.key === 'whirlwind');
    expect(whirlwind).toMatchObject({ skillFrw: -10, itemFrw: 0 });
    expect(formatMoveCurseOption(whirlwind)).toBe('Whirlwinding (-10%)');
  });
});
