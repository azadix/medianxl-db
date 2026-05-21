import { getTreeArrowPairsForSkillsInTab } from '@/shared/tree-struct.js';

/**
 * Add overlay arrows to show skill prerequisites
 * @param {HTMLElement} contentDiv - The grid container for skills
 * @param {Array} skillsInTab - Array of skills in the current tab
 * @param {number} minRow - Minimum row index
 * @param {number} minCol - Minimum column index
 */
export function addOverlayArrows(contentDiv, skillsInTab, minRow, minCol) {
  const drawn = new Set();

  for (const [fromId, toId] of getTreeArrowPairsForSkillsInTab(skillsInTab)) {
    const prereqSkill = skillsInTab.find((s) => s.id === fromId);
    const sk = skillsInTab.find((s) => s.id === toId);
    if (!prereqSkill || !sk) continue;
    const key = `${fromId}\0${toId}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    createOverlayArrow(contentDiv, prereqSkill, sk, minRow, minCol);
  }
}

/**
 * @param {HTMLElement} contentDiv
 * @param {object} fromSkill
 * @param {object} toSkill
 * @param {number} minRow
 * @param {number} minCol
 */
function createOverlayArrow(contentDiv, fromSkill, toSkill, minRow, minCol) {
  const fromRow = fromSkill.row - minRow + 1;
  const fromCol = fromSkill.col - minCol + 1;
  const toRow = toSkill.row - minRow + 1;
  const toCol = toSkill.col - minCol + 1;

  const allCards = contentDiv.querySelectorAll('.skill-card, .empty-skill-card');
  let fromCard = null;
  let toCard = null;

  allCards.forEach((card) => {
    const gridArea = card.style.gridArea;
    let gridRow;
    let gridCol;

    if (gridArea && gridArea.includes('/')) {
      const parts = gridArea.split('/');
      gridRow = parseInt(parts[0].trim(), 10);
      gridCol = parseInt(parts[1].trim(), 10);
    } else {
      gridRow = parseInt(card.style.gridRow, 10);
      gridCol = parseInt(card.style.gridColumn, 10);
    }

    if (gridRow === fromRow && gridCol === fromCol) {
      fromCard = card;
    }
    if (gridRow === toRow && gridCol === toCol) {
      toCard = card;
    }
  });

  if (!fromCard || !toCard) {
    return;
  }

  const fromRect = fromCard.getBoundingClientRect();
  const toRect = toCard.getBoundingClientRect();
  const gridRect = contentDiv.getBoundingClientRect();

  const fromX = fromRect.left + fromRect.width / 2 - gridRect.left;
  const fromY = fromRect.top + fromRect.height / 2 - gridRect.top;
  const toX = toRect.left + toRect.width / 2 - gridRect.left;
  const toY = toRect.top + toRect.height / 2 - gridRect.top;

  const arrow = document.createElement('div');
  arrow.className = 'overlay-arrow';
  arrow.style.position = 'absolute';
  arrow.style.left = '0';
  arrow.style.top = '0';
  arrow.style.width = '100%';
  arrow.style.height = '100%';
  arrow.style.pointerEvents = 'none';
  arrow.style.zIndex = '10';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.position = 'absolute';
  svg.style.left = '0';
  svg.style.top = '0';

  function getIntersectionPoint(centerX, centerY, targetX, targetY, cw, ch) {
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) {
      return { x: centerX, y: centerY };
    }

    const unitX = dx / len;
    const unitY = dy / len;

    const halfW = cw / 2;
    const halfH = ch / 2;

    const intersections = [];

    if (unitY !== 0) {
      const t = -halfH / unitY;
      if (t > 0) {
        const x = centerX + t * unitX;
        if (x >= centerX - halfW && x <= centerX + halfW) {
          intersections.push({ x, y: centerY - halfH, t });
        }
      }
    }

    if (unitY !== 0) {
      const t = halfH / unitY;
      if (t > 0) {
        const x = centerX + t * unitX;
        if (x >= centerX - halfW && x <= centerX + halfW) {
          intersections.push({ x, y: centerY + halfH, t });
        }
      }
    }

    if (unitX !== 0) {
      const t = -halfW / unitX;
      if (t > 0) {
        const y = centerY + t * unitY;
        if (y >= centerY - halfH && y <= centerY + halfH) {
          intersections.push({ x: centerX - halfW, y, t });
        }
      }
    }

    if (unitX !== 0) {
      const t = halfW / unitX;
      if (t > 0) {
        const y = centerY + t * unitY;
        if (y >= centerY - halfH && y <= centerY + halfH) {
          intersections.push({ x: centerX + halfW, y, t });
        }
      }
    }

    if (intersections.length > 0) {
      const closest = intersections.reduce((min, curr) => (curr.t < min.t ? curr : min));
      return { x: closest.x, y: closest.y };
    }

    return { x: centerX, y: centerY };
  }

  const startPoint = getIntersectionPoint(fromX, fromY, toX, toY, fromRect.width, fromRect.height);
  const endPoint = getIntersectionPoint(toX, toY, fromX, fromY, toRect.width, toRect.height);

  const edx = endPoint.x - startPoint.x;
  const edy = endPoint.y - startPoint.y;
  const elength = Math.sqrt(edx * edx + edy * edy);

  if (elength === 0) {
    return;
  }

  const eunitX = edx / elength;
  const eunitY = edy / elength;

  const startX = startPoint.x;
  const startY = startPoint.y;
  const endPadding = 4;
  const endX = endPoint.x - eunitX * endPadding;
  const endY = endPoint.y - eunitY * endPadding;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(startX));
  line.setAttribute('y1', String(startY));
  line.setAttribute('x2', String(endX));
  line.setAttribute('y2', String(endY));
  line.setAttribute('stroke', '#8a8a8a');
  line.setAttribute('stroke-width', '3.75');
  line.setAttribute('stroke-linecap', 'round');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', `arrowhead-${Date.now()}-${Math.random()}`);
  marker.setAttribute('markerWidth', '5');
  marker.setAttribute('markerHeight', '4');
  marker.setAttribute('refX', '3.5');
  marker.setAttribute('refY', '2');
  marker.setAttribute('orient', 'auto');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 5 2, 0 4');
  polygon.setAttribute('fill', '#8a8a8a');

  marker.appendChild(polygon);
  defs.appendChild(marker);
  svg.appendChild(defs);

  line.setAttribute('marker-end', `url(#${marker.getAttribute('id')})`);

  svg.appendChild(line);
  arrow.appendChild(svg);

  contentDiv.appendChild(arrow);
}
