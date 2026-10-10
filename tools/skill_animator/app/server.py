"""MXL Skill Animator - local GUI server.

Runs a small web server on 127.0.0.1 (your PC only) and opens the interface in your browser.
"""
import os, sys, json, threading, queue, time, traceback, webbrowser, re, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

APP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP)
from engine.gamedata import GameData
from engine import sim
from engine.gfx import safe

CONFIG_PATH = os.path.join(APP, 'config.json')
TOOLS_LOCAL = os.path.join(os.path.dirname(os.path.dirname(APP)), 'tools.local.json')
DEFAULTS = {
    'game_dir': r'C:\Games\median-xl',
    'out_dir': os.path.join(os.path.dirname(APP), 'output'),
    'file_pattern': 'Oskill {name}.gif',
    'port': 8765,
}
OSKILLS = json.load(open(os.path.join(APP, 'engine', 'oskills.json')))


def load_config():
    c = dict(DEFAULTS)
    try:
        local = json.load(open(TOOLS_LOCAL, encoding='utf-8'))
        if isinstance(local, dict) and local.get('d2_game_dir'):
            c['game_dir'] = local['d2_game_dir']
    except Exception:
        pass
    try:
        c.update(json.load(open(CONFIG_PATH)))
    except Exception:
        pass
    return c


def save_config(c):
    json.dump(c, open(CONFIG_PATH, 'w'), indent=1)


class State:
    def __init__(self):
        self.cfg = load_config()
        self.gd = None
        self.loading = False
        self.error = None
        self.log = []
        self.lock = threading.Lock()          # the engine is single-threaded
        self.job = None
        self.skill_cache = None

    def say(self, msg):
        self.log.append(time.strftime('%H:%M:%S ') + msg)
        self.log = self.log[-200:]
        print(msg, flush=True)

    def load(self):
        self.loading, self.error, self.gd, self.skill_cache = True, None, None, None
        try:
            d = self.cfg['game_dir']
            self.say('Loading game data from %s ...' % d)
            gd = GameData(d, log=self.say)
            with self.lock:
                sim.init(gd)
            self.gd = gd
            self.say('Ready: %d skills, %d missiles.' % (len(gd.SK), len(gd.MIS)))
        except Exception as e:
            self.error = str(e)
            self.say('Could not load game data: %s' % e)
        finally:
            self.loading = False


S = State()


def skill_list():
    if S.skill_cache is not None:
        return S.skill_cache
    gd = S.gd
    osk = {o['sid'] for o in OSKILLS}
    out = []
    for sid, r in enumerate(gd.SK):
        has = any(r.get(c) for c in ('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec'))
        if sid in osk or has:
            out.append({'sid': sid, 'name': r.get('skill') or 'sk%d' % sid, 'oskill': sid in osk,
                        'missiles': has, 'srvdo': r.get('srvdofunc', '0')})
    # oskill names from the wiki list win (they are unique)
    names = {o['sid']: o['name'] for o in OSKILLS}
    for s in out:
        if s['sid'] in names:
            s['name'] = names[s['sid']]
    out.sort(key=lambda s: s['name'].lower())
    S.skill_cache = out
    return out


def out_name(sid, name):
    pat = S.cfg.get('file_pattern') or DEFAULTS['file_pattern']
    return pat.replace('{name}', safe(name)).replace('{sid}', str(sid))


def do_render(sid, opt):
    gd = S.gd
    name = next((s['name'] for s in skill_list() if s['sid'] == sid), gd.SK[sid].get('skill', 'sk%d' % sid))
    t = time.time()
    with S.lock:
        fr, sc, info = sim.render_skill(
            sid, lvl=int(opt.get('lvl', 20)), distance=float(opt.get('distance', 11)),
            enemies=opt.get('enemies', 'auto'), zoom=opt.get('zoom', 'auto'),
            max_w=int(opt.get('max_w', sim.GIF_W)), max_h=int(opt.get('max_h', sim.GIF_H)),
            max_frames=int(opt.get('max_frames', 200)), seed=int(opt.get('seed', 7)))
        if fr is None:
            return {'ok': False, 'sid': sid, 'name': name, 'info': info}
        os.makedirs(S.cfg['out_dir'], exist_ok=True)
        fn = out_name(sid, name)
        path = os.path.join(S.cfg['out_dir'], fn)
        size = sim.save_gif(fr, path, sc)
    info.update(kb=size // 1024, seconds=round(time.time() - t, 1))
    return {'ok': True, 'sid': sid, 'name': name, 'file': fn, 'url': '/out/' + urllib.parse.quote(fn) + '?t=%d' % time.time(),
            'info': info}


def batch(sids, opt):
    job = S.job = {'total': len(sids), 'done': 0, 'ok': 0, 'skipped': 0, 'results': [], 'cancel': False, 'running': True}
    for sid in sids:
        if job['cancel']:
            break
        try:
            r = do_render(sid, opt)
        except Exception as e:
            r = {'ok': False, 'sid': sid, 'name': str(sid), 'info': {'why': repr(e)}}
        job['results'].append({k: r.get(k) for k in ('ok', 'sid', 'name', 'file', 'url')} | {'why': r['info'].get('why')})
        job['done'] += 1
        job['ok' if r['ok'] else 'skipped'] += 1
    job['running'] = False
    S.say('Batch finished: %d rendered, %d skipped.' % (job['ok'], job['skipped']))


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype='application/json'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path
        if p in ('/', '/index.html'):
            return self.send(200, open(os.path.join(APP, 'ui', 'index.html'), 'rb').read(), 'text/html; charset=utf-8')
        if p == '/api/status':
            return self.send(200, {'loaded': S.gd is not None, 'loading': S.loading, 'error': S.error,
                                   'cfg': S.cfg, 'log': S.log[-30:]})
        if p == '/api/skills':
            if not S.gd:
                return self.send(503, {'error': 'game data not loaded'})
            return self.send(200, skill_list())
        if p == '/api/job':
            return self.send(200, S.job or {})
        if p.startswith('/out/'):
            fn = urllib.parse.unquote(p[5:])
            path = os.path.join(S.cfg['out_dir'], os.path.basename(fn))
            if os.path.exists(path):
                return self.send(200, open(path, 'rb').read(), 'image/gif')
            return self.send(404, {'error': 'no such file'})
        self.send(404, {'error': 'not found'})

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        try:
            b = self.body()
        except Exception:
            b = {}
        if p == '/api/config':
            for k in ('game_dir', 'out_dir', 'file_pattern'):
                if b.get(k):
                    S.cfg[k] = b[k]
            save_config(S.cfg)
            if b.get('reload'):
                threading.Thread(target=S.load, daemon=True).start()
            return self.send(200, {'ok': True, 'cfg': S.cfg})
        if not S.gd:
            return self.send(503, {'error': 'game data not loaded'})
        if p == '/api/render':
            try:
                return self.send(200, do_render(int(b['sid']), b.get('options', {})))
            except Exception as e:
                traceback.print_exc()
                return self.send(500, {'ok': False, 'info': {'why': repr(e)}})
        if p == '/api/batch':
            if S.job and S.job.get('running'):
                return self.send(409, {'error': 'a batch is already running'})
            sids = [int(x) for x in b.get('sids', [])]
            threading.Thread(target=batch, args=(sids, b.get('options', {})), daemon=True).start()
            return self.send(200, {'ok': True, 'total': len(sids)})
        if p == '/api/cancel':
            if S.job:
                S.job['cancel'] = True
            return self.send(200, {'ok': True})
        if p == '/api/open_folder':
            d = S.cfg['out_dir']
            os.makedirs(d, exist_ok=True)
            try:
                if os.name == 'nt':
                    os.startfile(d)
                else:
                    import subprocess
                    subprocess.Popen(['xdg-open', d])
            except Exception as e:
                return self.send(200, {'ok': False, 'error': str(e)})
            return self.send(200, {'ok': True})
        self.send(404, {'error': 'not found'})


def main():
    port = int(S.cfg.get('port') or 8765)
    srv = None
    for p in range(port, port + 20):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', p), H)
            port = p
            break
        except OSError:
            continue
    threading.Thread(target=S.load, daemon=True).start()
    url = 'http://127.0.0.1:%d/' % port
    print('MXL Skill Animator is running at %s  (close this window to quit)' % url, flush=True)
    if '--no-browser' not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
