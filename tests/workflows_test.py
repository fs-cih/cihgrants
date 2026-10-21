"""Exercise actual workflow shell scripts against a disposable local Git remote."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd, **kwargs):
    return subprocess.run(args, cwd=cwd, text=True, capture_output=True, **kwargs)


class PublicationWorkflows(unittest.TestCase):
    def test_publications(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            remote = base / 'remote.git'
            subprocess.run(['git', 'init', '--bare', str(remote)], check=True, capture_output=True)
            seed = base / 'seed'
            subprocess.run(['git', 'clone', str(remote), str(seed)], check=True, capture_output=True)
            for key, value in [('user.name', 'Test'), ('user.email', 'test@example.com')]:
                self.assertEqual(run('git', 'config', key, value, cwd=seed).returncode, 0)
            (seed / 'data').mkdir()
            for kind in ['grants', 'prospects']:
                (seed / 'data' / f'{kind}.json').write_text(json.dumps([{'id': 'existing', 'title': 'Original'}], indent=2))
            for args in [('add', '.'), ('commit', '-m', 'Seed'), ('branch', '-M', 'main'), ('push', 'origin', 'main')]:
                self.assertEqual(run('git', *args, cwd=seed).returncode, 0)

            def script(kind):
                source = (ROOT / '.github/workflows' / f'add-{kind}.yml').read_text()
                return '\n'.join(line[10:] for line in source.split('        run: |\n', 1)[1].splitlines())

            def env(mode, payload):
                return dict(os.environ, MODE=mode, PAYLOAD=json.dumps(payload), GITHUB_REF_NAME='main')

            # Four independent runners must preserve all writes, including cross-file races.
            processes = []
            for index, kind in enumerate(['grant', 'prospect', 'grant', 'prospect']):
                checkout = base / f'runner{index}'
                subprocess.run(['git', 'clone', '--branch', 'main', str(remote), str(checkout)], check=True, capture_output=True)
                processes.append(subprocess.Popen(['bash', '-c', script(kind)], cwd=checkout,
                    env=env('add', {'id': f'new{index}', 'title': f'Entry {index}'}), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
            for process in processes:
                stdout, stderr = process.communicate(timeout=45)
                self.assertEqual(process.returncode, 0, stdout + stderr)
            self.assertEqual(run('git', 'pull', '--ff-only', 'origin', 'main', cwd=seed).returncode, 0)
            for kind, ids in [('grants', ['new0', 'new2']), ('prospects', ['new1', 'new3'])]:
                data = json.loads((seed / 'data' / f'{kind}.json').read_text())
                self.assertEqual({x['id'] for x in data}, {'existing', *ids})

            for kind in ['grant', 'prospect']:
                data_path = seed / 'data' / f'{kind}s.json'
                original = data_path.read_text()
                # Stale ID must never fall back to the now-unrelated row index.
                result = run('bash', '-c', script(kind), cwd=seed, env=env('delete', {'id': 'missing', 'editIndex': 0}))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(data_path.read_text(), original)
                # Identical saves are successful without an empty commit.
                before = run('git', 'rev-parse', 'HEAD', cwd=seed).stdout
                payload = json.loads(original)[0]
                result = run('bash', '-c', script(kind), cwd=seed, env=env('edit', payload))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(run('git', 'rev-parse', 'HEAD', cwd=seed).stdout, before)
                result = run('bash', '-c', script(kind), cwd=seed, env=env('add', payload))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(data_path.read_text(), original)


if __name__ == '__main__':
    unittest.main()
