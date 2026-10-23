/**
 * D2 isometric yard rings. A ground circle of R yards is a 2:1 ellipse on
 * screen: 32x16 pixels per yard at 800x600 (one subtile).
 */

export const D2_NATIVE_WIDTH = 800;
export const D2_NATIVE_HEIGHT = 600;
export const PX_PER_YARD_X = 32;
export const PX_PER_YARD_Y = 16;

/** Helper screenshot size and origin at the player's feet. */
export const YARD_HELPER = {
  width: 1024,
  height: 764,
  originX: 514,
  originY: 370,
  src: 'speedcalc/yard-helper.jpg',
};

export const YARD_RING_STEPS = [2, 4, 6, 8, 10];
export const YARD_RING_FOCUS = 10;

/**
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {{ scaleX: number, scaleY: number }}
 */
export function yardScaleForImage(imageWidth, imageHeight) {
  return {
    scaleX: Number(imageWidth) / D2_NATIVE_WIDTH,
    scaleY: Number(imageHeight) / D2_NATIVE_HEIGHT,
  };
}

/**
 * Isometric ground circle (screen ellipse) for a Euclidean yard radius.
 * @param {number} cx
 * @param {number} cy
 * @param {number} yards
 * @param {number} scaleX
 * @param {number} scaleY
 * @returns {{ cx: number, cy: number, rx: number, ry: number, top: [number, number], right: [number, number], bottom: [number, number], left: [number, number] }}
 */
export function yardEllipse(cx, cy, yards, scaleX, scaleY) {
  const rx = yards * PX_PER_YARD_X * scaleX;
  const ry = yards * PX_PER_YARD_Y * scaleY;
  return {
    cx,
    cy,
    rx,
    ry,
    top: [cx, cy - ry],
    right: [cx + rx, cy],
    bottom: [cx, cy + ry],
    left: [cx - rx, cy],
  };
}

/**
 * @param {{ width: number, height: number, originX: number, originY: number }} image
 * @param {number[]} [rings]
 */
export function buildYardOverlay(image = YARD_HELPER, rings = YARD_RING_STEPS) {
  const { scaleX, scaleY } = yardScaleForImage(image.width, image.height);
  return rings.map((yards) => ({
    yards,
    focus: yards === YARD_RING_FOCUS,
    ...yardEllipse(image.originX, image.originY, yards, scaleX, scaleY),
  }));
}
