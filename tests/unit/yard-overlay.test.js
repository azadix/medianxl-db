import { describe, expect, it } from 'vitest';
import {
  PX_PER_YARD_X,
  PX_PER_YARD_Y,
  YARD_HELPER,
  YARD_RING_FOCUS,
  buildYardOverlay,
  yardEllipse,
} from '@/speedcalc/yard-overlay.js';

describe('yard-overlay', () => {
  it('uses a 2:1 ellipse of 32x16 pixels per yard at 800x600', () => {
    const d = yardEllipse(400, 300, 10, 1, 1);
    expect(PX_PER_YARD_X).toBe(32);
    expect(PX_PER_YARD_Y).toBe(16);
    expect(d.rx).toBe(320);
    expect(d.ry).toBe(160);
    expect(d.right).toEqual([720, 300]);
    expect(d.top).toEqual([400, 140]);
  });

  it('centers the 10-yard ring on the helper screenshot feet', () => {
    const rings = buildYardOverlay();
    const ten = rings.find((row) => row.yards === YARD_RING_FOCUS);
    expect(ten.focus).toBe(true);
    expect(ten.cx).toBe(YARD_HELPER.originX);
    expect(ten.cy).toBe(YARD_HELPER.originY);
    expect(ten.rx).toBeCloseTo(10 * 32 * (1024 / 800));
    expect(ten.ry).toBeCloseTo(10 * 16 * (764 / 600));
  });
});
