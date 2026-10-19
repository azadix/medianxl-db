"""Client-world tests pinned to mxlplanner VISUALS.md / clientVisuals.js."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'app'))

from engine import client as C
from engine import sim


class ClientSeedTest(unittest.TestCase):
    def test_seed_rand_power_of_two(self):
        s = C.seedOf(1, 666)
        a = C.seedRand(s, 8)
        self.assertTrue(0 <= a < 8)
        # Second call advances
        b = C.seedRand(s, 8)
        self.assertTrue(0 <= b < 8)

    def test_seed_rand_zero(self):
        s = C.seedOf(5, 666)
        self.assertEqual(C.seedRand(s, 0), 0)
        self.assertEqual(C.seedRand(s, -3), 0)


class ClientMathTest(unittest.TestCase):
    def test_direction_vector_axis(self):
        # Pure +X: short=0, long=4096
        dx, dy = C.directionVector(0, 0, C.SUBTILE, 0)
        self.assertEqual(dy, 0)
        self.assertGreater(dx, 0)

    def test_arc_height_lands(self):
        h = C.makeHeight()
        C.arcHeight(h, 10, 100)
        self.assertTrue(h['flags'] & 2)
        self.assertEqual(h['counter'], 10)
        for _ in range(20):
            C.stepHeight(h)
        self.assertTrue(h['flags'] & 1)

    def test_client_calc_ln(self):
        # ln12 = Par1 + (lvl-1)*Par2
        v = C.clientCalc('ln12', level=5, params=[10, 3, 0, 0, 0, 0, 0, 0])
        self.assertEqual(v, 10 + 4 * 3)

    def test_tremor_shake_params(self):
        # Tremor Param1-4 = 4, 5, 25, 15 -> 4 px, 200/1000/600 ms
        world = C.createClientWorld(seed=1)
        # skill do 75 math
        up = int(5 * 1000 / 25)
        hold = int(25 * 1000 / 25)
        down = int(15 * 1000 / 25)
        self.assertEqual((up, hold, down), (200, 1000, 600))
        C.screenShake(world, 4, up, down, hold)
        self.assertIsNotNone(world['shake'])
        self.assertEqual(world['shake']['amplitude'], 4)


class ClientCreatorTest(unittest.TestCase):
    def test_mind_flay_moving_explosion_refused(self):
        # Moving missile aimed at map origin (>99 cells) is refused.
        rows = {
            868: {
                'id': 868, 'vel': 42, 'velLev': 0, 'maxVel': 0, 'accel': 0,
                'range': 20, 'levRange': 0, 'cltDo': 1, 'cltHit': 0,
                'cltParams': [0, 0, 0, 0, 0], 'cHitPar': [0, 0, 0],
                'cltSubMissiles': [-1, -1, -1], 'cltHitSubMissiles': [-1, -1, -1, -1],
                'explosionMissile': -1, 'animLen': 1, 'animSpeed': 16,
                'loopAnim': 0, 'subLoop': 0, 'subStart': 0, 'subStop': 0,
                'initSteps': 0, 'activate': 0, 'collideType': 0, 'collideKill': 1,
                'collideFriend': 0, 'clientCol': 0, 'lastCollide': 0,
                'alwaysExplode': 0, 'size': 1, 'progOverlay': 0,
                'clientSend': False, 'server': False, 'cltCalc': '',
            }
        }
        world = C.createClientWorld(missiles=rows, seed=1)
        owner = {'id': 'p', 'x': C.cellCentre(0), 'y': C.cellCentre(0), 'facing': [1, 1], 'local': True}
        world['player'] = owner
        # flags 0x20 to map origin from (0,0) -> refused (100-cell rule)
        origin = C.mapOriginCell(world)
        m = C.createClientMissile(world, {
            'flags': 0x20, 'owner': owner, 'source': owner, 'id': 868,
            'target': origin, 'level': 1,
        })
        self.assertIsNone(m)
        self.assertTrue(C.rowMoves(868, 1, rows))


class ClientTablesTest(unittest.TestCase):
    def test_tables_loaded(self):
        t = C.CLIENT_TABLES
        self.assertEqual(len(t['direction']), 256)
        self.assertEqual(len(t['circleX']), 64)
        self.assertEqual(t['circleX'][0], 30)
        self.assertEqual(t['circleY'][0], 0)
        self.assertEqual(len(t['ownerStep']['x']), 8)

    def test_spray_tables_for_hit51(self):
        t = C.DEFAULT_TABLES
        offs = C.sprayOffsets(1, t)
        self.assertEqual(offs[0], [14, -14])
        self.assertGreater(len(C.sprayOffsets(6, t)), 1)

    def test_wander_init_sets_waypoints(self):
        world = C.createClientWorld(seed=1)
        m = {
            'x': C.cellCentre(0), 'y': C.cellCentre(0), 'total': 20, 'frames': 20,
            'targetCell': [8, -8], 'waypoints': None, 'velocity': 40 << 8,
        }
        C.wanderInit(world, m, 0)
        self.assertTrue(m.get('waypoints'))
        self.assertGreater(len(m['waypoints']), 2)
        cells = C.wanderStep(m)
        self.assertIsInstance(cells, list)


if __name__ == '__main__':
    unittest.main()
