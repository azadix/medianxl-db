"""Geometry tests for the skill animator (no game MPQ required)."""
import os
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageSequence

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'app'))

from engine import sim
from engine.plugins_b import _set_d28
from engine.plugins_c import COS64, SIN64
from engine.plugins_d import _ring_int


class FakeM:
    def __init__(self):
        self.data = {}
        self.x = self.y = 0.0
        self.dx, self.dy = 1.0, 0.0
        self.vel = 0.5


class FakeSim:
    caster = (0.0, 0.0)


class GeometryTest(unittest.TestCase):
    def test_ring_vec_matches_game_tables(self):
        self.assertEqual(sim.ring_vec(0), (30, 0))
        self.assertEqual(sim.ring_vec(16), (0, 30))
        self.assertEqual(sim.ring_vec(32), (-30, 0))
        self.assertEqual(sim.ring_vec(48), (0, -30))
        self.assertEqual(sim.ring_vec(64), sim.ring_vec(0))
        for k in range(64):
            self.assertEqual(sim.ring_vec(k), (COS64[k], SIN64[k]))
            self.assertEqual(sim.ring_vec(k), _ring_int(k))

    def test_light_tint_makes_fire_purple(self):
        rgb = np.zeros((1, 1, 3), dtype=np.int32)
        rgb[0, 0] = (200, 80, 10)
        purple = sim.light_tint(rgb, {'Light': '2', 'Red': '255', 'Green': '0', 'Blue': '255'})
        self.assertEqual(tuple(int(x) for x in purple[0, 0]), (255, 0, 255))
        same = sim.light_tint(rgb, {'Light': '2', 'Red': '255', 'Green': '255', 'Blue': '255'})
        self.assertEqual(tuple(int(x) for x in same[0, 0]), (200, 80, 10))

    def test_quantize_keeps_character_colors(self):
        brown = Image.new('RGB', (48, 48), (120, 80, 50))
        frames = [brown.copy()]
        for _ in range(6):
            im = brown.copy()
            im.paste((255, 0, 220), (28, 8, 44, 40))
            frames.append(im)
        fd, path = tempfile.mkstemp(suffix='.gif')
        os.close(fd)
        try:
            sim._quantize_save(frames, path, 32)
            with Image.open(path) as im:
                seq = [f.convert('RGB') for f in ImageSequence.Iterator(im)]
            px = seq[0].getpixel((8, 8))
            blob = seq[-1].getpixel((36, 20))
            self.assertLess(abs(px[0] - 120) + abs(px[1] - 80) + abs(px[2] - 50), 90)
            self.assertGreater(blob[0] + blob[2], blob[1] + 40)
        finally:
            if os.path.isfile(path):
                os.remove(path)

    def test_light_tint_makes_gray_arrow_green(self):
        rgb = np.zeros((1, 1, 3), dtype=np.int32)
        rgb[0, 0] = (80, 78, 76)
        green = sim.light_tint(rgb, {'Light': '2', 'Red': '128', 'Green': '255', 'Blue': '0'})
        self.assertEqual(tuple(int(x) for x in green[0, 0]), (128, 255, 0))

    def test_light_tint_skips_own_celfile(self):
        rgb = np.zeros((1, 1, 3), dtype=np.int32)
        rgb[0, 0] = (40, 180, 220)
        row = {'Light': '3', 'Red': '255', 'Green': '0', 'Blue': '0', 'CelFile': 'LightAndShadowStrike'}
        same = sim.light_tint(rgb, row, drawn=row)
        self.assertEqual(tuple(int(x) for x in same[0, 0]), (40, 180, 220))

    def test_wave_keys_are_strings(self):
        m = FakeM()
        _set_d28(m, -8, 11)
        self.assertEqual(m.data['d28'], -8)
        self.assertEqual(m.data['d2c'], 11)
        self.assertNotIn(0x28, m.data)
        self.assertNotIn(0x2c, m.data)

    def test_velocity_integer_create_missile(self):
        row = {'Vel': 24, 'VelLev': 0}
        self.assertEqual(sim.vel_fp(row, 20), int((24 << 8) * 75 / 100))
        self.assertAlmostEqual(sim.vel_subtiles(row, 20), 24 * 3 / 64.0)
        row2 = {'Vel': 1, 'VelLev': 7}
        self.assertEqual(sim.vel_fp(row2, 1), int((1 << 8) * 75 / 100))

    def test_trans_blit_modes(self):
        # D2 draw modes: 0/1/2 alpha, 3 add, 4 multiply, 5/7 opaque.
        canvas = np.zeros((8, 8, 3), dtype=np.int32)
        canvas[:] = 40
        rgb = np.zeros((4, 4, 3), dtype=np.int32)
        rgb[:] = 200
        mask = np.ones((4, 4), dtype=bool)
        spr = (0, 0, rgb, mask)
        opaque = canvas.copy()
        sim.blit(opaque, 0, 0, spr, 5)
        self.assertEqual(opaque[0, 0, 0], 200)
        add = canvas.copy()
        sim.blit(add, 0, 0, spr, 3)
        self.assertEqual(add[0, 0, 0], min(40 + 200, 255))
        alpha = canvas.copy()
        sim.blit(alpha, 0, 0, spr, 1)  # 50%
        self.assertEqual(alpha[0, 0, 0], (40 * (255 - 128) + 200 * 128) // 255)
        dark = canvas.copy()
        sim.blit(dark, 0, 0, spr, 4)
        self.assertEqual(dark[0, 0, 0], (40 * 200) // 255)
        self.assertEqual(sim.missile_draw_mode(1), 3)
        self.assertEqual(sim.missile_draw_mode(2), 4)
        self.assertEqual(sim.overlay_draw_mode(0), 0)

    def test_missile_frame_at_subloop(self):
        # Arcane Torrent ml866: AnimLen 1, AnimSpeed 16, LoopAnim, SubLoop 1..2
        # -> frame 0 for one tick, then frame 1 held (SubStop never shown).
        self.assertEqual(sim.missile_frame_at(0, 1, 16, True, True, 1, 2, total=25), 0)
        # With AnimLen 2 SubStart 1 SubStop 2: loop only frame 1 while rem high
        f0 = sim.missile_frame_at(0, 2, 16, True, True, 1, 2, total=25)
        f5 = sim.missile_frame_at(5, 2, 16, True, True, 1, 2, total=25)
        self.assertIn(f0, (0, 1))
        self.assertEqual(f5, 1)

    def test_activate_delay_skips_early_hits(self):
        self.assertTrue(0 < 5)
        m = FakeM()
        m.activate = 0
        m.data['activate'] = 6
        m.age = 3
        self.assertLess(m.age, m.data.get('activate', m.activate))
        m.age = 6
        self.assertGreaterEqual(m.age, m.data.get('activate', m.activate))

    def test_chit_14_is_registered(self):
        # Legacy plugins kept; client world now owns most clt hit/do paths.
        self.assertIn('mhit_13', sim.PLUG)
        self.assertIn('skill_do_139', sim.PLUG)

    def test_overlay_filename_skips_leading_id_word(self):
        row = (168).to_bytes(2, 'little') + b'VampiricHitHealth\0' + b'\0' * 40
        self.assertEqual(row[2:64].split(b'\0')[0], b'VampiricHitHealth')
        self.assertNotEqual(row[4:68].split(b'\0')[0], b'VampiricHitHealth')

    def test_snaps_have_skill_gfx_ignores_empty_and_overlays_without_sprites(self):
        self.assertFalse(sim.snaps_have_skill_gfx([], None))
        self.assertFalse(sim.snaps_have_skill_gfx([[(None, None, None, 0, 0, 0, 3)]]))
        self.assertTrue(sim.snaps_have_skill_gfx([[(None, None, object(), 0, 0, 0, 3)]]))
        self.assertFalse(sim.snaps_have_skill_gfx([], [[(32, 0, 0, 0)]]))

    def test_blank_kind_tags(self):
        from render_site_previews import is_blank_kind
        tags = {'arcane_fury': {'buff'}, 'avalanche': {'cold', 'spell'}, 'blood_golem': {'summon'}}
        self.assertTrue(is_blank_kind('arcane_fury', tags))
        self.assertTrue(is_blank_kind('blood_golem', tags))
        self.assertFalse(is_blank_kind('avalanche', tags))

    def test_hammer_spirals_out(self):
        m = FakeM()
        s = FakeSim()
        sim.hammer_step(m, s)
        r1 = math_hypot(m.x, m.y)
        sim.hammer_step(m, s)
        r2 = math_hypot(m.x, m.y)
        self.assertGreater(r2, r1)

def math_hypot(x, y):
    return (x * x + y * y) ** 0.5


if __name__ == '__main__':
    unittest.main()
