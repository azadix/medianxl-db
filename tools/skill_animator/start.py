"""MXL Skill Animator launcher.

Uses the private python\\ copy next to this file. First run installs numpy and Pillow
into that folder (needs internet, once), then starts the local web UI.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BUNDLED = os.path.join(ROOT, 'python', 'python.exe')
GET_PIP = os.path.join(ROOT, 'python', 'get-pip.py')
SERVER = os.path.join(ROOT, 'app', 'server.py')
SITE = os.path.join(ROOT, 'python', 'Lib', 'site-packages')


def _is_bundled():
    return os.path.normcase(os.path.abspath(sys.executable)) == os.path.normcase(os.path.abspath(BUNDLED))


def _reexec_bundled():
    if os.name == 'nt' and os.path.isfile(BUNDLED) and not _is_bundled():
        os.execv(BUNDLED, [BUNDLED, os.path.abspath(__file__), *sys.argv[1:]])


def _ok():
    try:
        import numpy  # noqa: F401
        import PIL  # noqa: F401
        return True
    except ImportError:
        return False


def _run(args):
    return subprocess.call(args)


def ensure_deps():
    if _ok():
        return True
    print()
    print(' First run: installing numpy and Pillow into this folder (needs internet, about 40 MB).')
    print(' This only happens once.')
    print()
    py = sys.executable
    if _run([py, GET_PIP, '--no-warn-script-location', '--disable-pip-version-check']) != 0:
        return False
    if _run([py, '-m', 'pip', 'install', '--no-warn-script-location', '--disable-pip-version-check', 'numpy', 'pillow']) != 0:
        return False
    if SITE not in sys.path:
        sys.path.insert(0, SITE)
    return _ok()


def main():
    os.chdir(ROOT)
    _reexec_bundled()
    if not os.path.isfile(BUNDLED):
        print('Missing bundled Python: %s' % BUNDLED)
        return 1
    if not ensure_deps():
        print()
        print(' Could not install numpy/Pillow. Check your internet connection and run start.py again.')
        input('Press Enter to close.')
        return 1
    print()
    print(' MXL Skill Animator is starting. Your browser will open it.')
    print(' Keep this window open while you use it; close it to quit.')
    print()
    sys.argv = [SERVER, *sys.argv[1:]]
    sys.path.insert(0, os.path.join(ROOT, 'app'))
    import runpy
    runpy.run_path(SERVER, run_name='__main__')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
