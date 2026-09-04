import { describe, expect, it } from 'vitest';
import {
  matchRelicWikiCells,
  parseRelicWikiCells,
} from '../../tools/generate-relics-from-wiki.mjs';

const HTML = `
  <table>
    <tr>
      <td>
        <img src="https://docs.median-xl.com/images/baseitems/relic04.jpg"><br>
        <span class="item-unique">Relic<br></span>
        <span class="item-basic">Required Level: 75<br></span>
        <span class="item-magic">
          +(6 to 12)% Bonus Damage to Mark of the Wild<br>
          +(8 to 17) to Feral Strike<br>
        </span>
      </td>
      <td>
        <img src="https://docs.median-xl.com/images/baseitems/relic06.jpg"><br>
        <span class="item-unique">Relic<br></span>
        <span class="item-basic">(Druid Only)<br>Required Level: 90<br></span>
        <span class="item-magic">
          +(4 to 8) to Mark of the Wild<br>
          (1 to 2)% Deadly Strike<br>
        </span>
      </td>
    </tr>
  </table>
`;

describe('relic wiki parser', () => {
  it('parses raw HTML cells without markdown conversion', () => {
    const cells = parseRelicWikiCells(HTML);

    expect(cells).toEqual([
      {
        icon: 'relic04',
        reqLevel: 75,
        modifiers: [
          '+(6 to 12)% Bonus Damage to Mark of the Wild',
          '+(8 to 17) to Feral Strike',
        ],
      },
      {
        icon: 'relic06',
        reqLevel: 90,
        classRestriction: 'Druid Only',
        modifiers: ['+(4 to 8) to Mark of the Wild', '(1 to 2)% Deadly Strike'],
      },
    ]);
  });

  it('prefers the direct skill grant over incidental skill mentions', () => {
    const cells = parseRelicWikiCells(HTML);
    const existing = [
      { id: 'relic:feral-strike', name: 'Relic (Feral Strike)' },
      { id: 'relic:mark-of-the-wild', name: 'Relic (Mark of the Wild)' },
    ];

    const matches = matchRelicWikiCells(cells, existing);

    expect(matches.map((match) => match.previous.name)).toEqual([
      'Relic (Feral Strike)',
      'Relic (Mark of the Wild)',
    ]);
  });
});
