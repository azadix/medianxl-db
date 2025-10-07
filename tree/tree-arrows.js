// Arrow rendering and direction calculations for skill prerequisites

// Helper functions for arrow direction calculation
export function getArrowDirection(row, col, skillsInTab) {
    // Look for skills with prerequisites in the current tab
    const skillsWithPrereqs = skillsInTab.filter(skill => 
        skill.prerequisites && skill.prerequisites.length > 0
    );

    for (const skill of skillsWithPrereqs) {
        // Check if this empty position is between a prerequisite skill and the dependent skill
        for (const prereq of skill.prerequisites) {
            const [type, value, target] = prereq.split(':');
            
            if (type === 'skill_level' && target) {
                // Find the prerequisite skill in the same tab
                const prereqSkill = skillsInTab.find(s => s.name === target);
                if (prereqSkill) {
                    // Check if this empty position is on the path between them
                    const direction = getDirectionBetweenSkills(prereqSkill, skill, row, col);
                    if (direction) return direction;
                }
            }
        }
    }
    return null;
}

function getDirectionBetweenSkills(fromSkill, toSkill, emptyRow, emptyCol) {
    const fromRow = fromSkill.row;
    const fromCol = fromSkill.col;
    const toRow = toSkill.row;
    const toCol = toSkill.col;

    // Check if empty position is on a direct line between the skills
    if (fromRow === toRow) {
        // Horizontal line
        if (emptyRow === fromRow && 
            ((fromCol < emptyCol && emptyCol < toCol) || (toCol < emptyCol && emptyCol < fromCol))) {
            return fromCol < toCol ? 'right' : 'left';
        }
    } else if (fromCol === toCol) {
        // Vertical line
        if (emptyCol === fromCol && 
            ((fromRow < emptyRow && emptyRow < toRow) || (toRow < emptyRow && emptyRow < fromRow))) {
            return fromRow < toRow ? 'down' : 'up';
        }
    } else {
        // Diagonal line - check if empty position is on the path
        const rowDiff = toRow - fromRow;
        const colDiff = toCol - fromCol;
        const steps = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
        
        for (let i = 1; i < steps; i++) {
            const checkRow = fromRow + Math.round((rowDiff * i) / steps);
            const checkCol = fromCol + Math.round((colDiff * i) / steps);
            
            if (checkRow === emptyRow && checkCol === emptyCol) {
                // Determine diagonal direction
                if (rowDiff > 0 && colDiff > 0) return 'down-right';
                if (rowDiff > 0 && colDiff < 0) return 'down-left';
                if (rowDiff < 0 && colDiff > 0) return 'up-right';
                if (rowDiff < 0 && colDiff < 0) return 'up-left';
            }
        }
    }
    return null;
}

export function getArrowSymbol(direction) {
    const arrows = {
        'up': '↑',
        'down': '↓',
        'left': '←',
        'right': '→',
        'up-right': '↗',
        'up-left': '↖',
        'down-right': '↘',
        'down-left': '↙'
    };
    return arrows[direction] || '→';
}

export function addOverlayArrows(contentDiv, skillsInTab, minRow, minCol, allClassSkills) {
    // Find skills with prerequisites
    const skillsWithPrereqs = skillsInTab.filter(skill => 
        skill.prerequisites && skill.prerequisites.length > 0
    );

    skillsWithPrereqs.forEach(skill => {
        skill.prerequisites.forEach(prereq => {
            const [type, value, target] = prereq.split(':');
            
            if (type === 'skill_level' && target) {
                // Find the prerequisite skill in the same class (across all tabs)
                const prereqSkill = allClassSkills.find(s => s.name === target && s.class === skill.class);
                if (prereqSkill) {
                    createOverlayArrow(contentDiv, prereqSkill, skill, minRow, minCol, skillsInTab);
                }
            }
        });
    });
}

function createOverlayArrow(contentDiv, fromSkill, toSkill, minRow, minCol, skillsInTab) {
    // Calculate positions relative to the grid
    const fromRow = fromSkill.row - minRow + 1;
    const fromCol = fromSkill.col - minCol + 1;
    const toRow = toSkill.row - minRow + 1;
    const toCol = toSkill.col - minCol + 1;

    // Find skill cards by looking for elements with the correct grid position
    const allCards = contentDiv.querySelectorAll('.skill-card, .empty-skill-card');
    let fromCard = null;
    let toCard = null;
    
    allCards.forEach(card => {
        // Check if using grid-area format (e.g., "1 / 2")
        const gridArea = card.style.gridArea;
        let gridRow, gridCol;
        
        if (gridArea && gridArea.includes('/')) {
            const parts = gridArea.split('/');
            gridRow = parseInt(parts[0].trim());
            gridCol = parseInt(parts[1].trim());
        } else {
            // Fallback to grid-row and grid-column
            gridRow = parseInt(card.style.gridRow);
            gridCol = parseInt(card.style.gridColumn);
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
    
    // Get the actual positions of the skill cards
    const fromRect = fromCard.getBoundingClientRect();
    const toRect = toCard.getBoundingClientRect();
    const gridRect = contentDiv.getBoundingClientRect();
    
    // Calculate center positions relative to the grid container
    const fromX = fromRect.left + fromRect.width / 2 - gridRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - gridRect.top;
    const toX = toRect.left + toRect.width / 2 - gridRect.left;
    const toY = toRect.top + toRect.height / 2 - gridRect.top;
    
    // Calculate arrow direction and position
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                
    // Calculate arrow position (midpoint between skills)
    const arrowX = (fromX + toX) / 2;
    const arrowY = (fromY + toY) / 2;
    
    // Calculate rotation angle (point from prerequisite to dependent skill)
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    
    // Create SVG line with arrowhead
    const arrow = document.createElement('div');
    arrow.className = 'overlay-arrow';
    arrow.style.position = 'absolute';
    arrow.style.left = '0';
    arrow.style.top = '0';
    arrow.style.width = '100%';
    arrow.style.height = '100%';
    arrow.style.pointerEvents = 'none';
    arrow.style.zIndex = '10';

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';

    // Calculate intersection points with card edges
    const cardWidth = 210;
    const cardHeight = 105;

    function getIntersectionPoint(centerX, centerY, targetX, targetY, cardWidth, cardHeight) {
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) {
            return { x: centerX, y: centerY };
        }
        
        const unitX = dx / length;
        const unitY = dy / length;

        const halfW = cardWidth / 2;
        const halfH = cardHeight / 2;

        const intersections = [];

        // Top edge (y = centerY - halfH)
        if (unitY !== 0) {
            const t = (-halfH) / unitY;
            if (t > 0) {
                const x = centerX + t * unitX;
                if (x >= centerX - halfW && x <= centerX + halfW) {
                    intersections.push({ x, y: centerY - halfH, t });
                }
            }
        }

        // Bottom edge (y = centerY + halfH)
        if (unitY !== 0) {
            const t = (halfH) / unitY;
            if (t > 0) {
                const x = centerX + t * unitX;
                if (x >= centerX - halfW && x <= centerX + halfW) {
                    intersections.push({ x, y: centerY + halfH, t });
                }
            }
        }

        // Left edge (x = centerX - halfW)
        if (unitX !== 0) {
            const t = (-halfW) / unitX;
            if (t > 0) {
                const y = centerY + t * unitY;
                if (y >= centerY - halfH && y <= centerY + halfH) {
                    intersections.push({ x: centerX - halfW, y, t });
                }
            }
        }

        // Right edge (x = centerX + halfW)
        if (unitX !== 0) {
            const t = (halfW) / unitX;
            if (t > 0) {
                const y = centerY + t * unitY;
                if (y >= centerY - halfH && y <= centerY + halfH) {
                    intersections.push({ x: centerX + halfW, y, t });
                }
            }
        }

        // Return the closest intersection point
        if (intersections.length > 0) {
            const closest = intersections.reduce((min, curr) => curr.t < min.t ? curr : min);
            return { x: closest.x, y: closest.y };
        }

        // Fallback to center if no intersection found
        return { x: centerX, y: centerY };
    }

    const startPoint = getIntersectionPoint(fromX, fromY, toX, toY, cardWidth, cardHeight);
    const endPoint = getIntersectionPoint(toX, toY, fromX, fromY, cardWidth, cardHeight);

    const startX = startPoint.x;
    const startY = startPoint.y;
    const endX = endPoint.x;
    const endY = endPoint.y;

    // Create line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('stroke', '#8a8a8a');
    line.setAttribute('stroke-width', '1.25');
    line.setAttribute('stroke-linecap', 'round');

    // Create arrowhead marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `arrowhead-${Date.now()}-${Math.random()}`);
    marker.setAttribute('markerWidth', '7.5');
    marker.setAttribute('markerHeight', '5.25');
    marker.setAttribute('refX', '6.75');
    marker.setAttribute('refY', '2.625');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 7.5 2.625, 0 5.25');
    polygon.setAttribute('fill', '#8a8a8a');

    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Add arrowhead to line
    line.setAttribute('marker-end', `url(#${marker.getAttribute('id')})`);

    svg.appendChild(line);
    arrow.appendChild(svg);

    contentDiv.appendChild(arrow);
}
