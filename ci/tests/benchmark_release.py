"""Read-only comparison against an existing release, run inside the CI tools Pod.

Requires a local .release/benchmark-context.json exported from an accepted build.
No new Release, tag, worker, registry copy, OSS upload or rebuild is permitted.
"""
import json
import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'release'))
import cache
import model
import publish
import registry
import release
import workers
import builds
from api import Api

context = model.read_json(model.OUT / 'benchmark-context.json')
context['deploy_oss'] = False
release.auth()
original = Api.request
metrics = {}

def read_only(api, method, path, *args, **kwargs):
    assert method == 'GET', 'Benchmark attempted to change a remote release'
    metrics['api_gets'] += 1
    value = original(api, method, path, *args, **kwargs)
    if isinstance(value, bytes):
        metrics['downloaded_bytes'] += len(value)
    return value

def forbidden(*args, **kwargs):
    raise AssertionError('Read-only benchmark attempted a build, copy or dispatch')

reports = []
with patch.object(Api, 'request', read_only), patch.object(registry, 'copy', forbidden), \
        patch.object(workers, 'dispatch', forbidden), patch.object(builds, 'build_local', forbidden):
    for iteration in range(2):
        metrics = {'iteration':iteration+1,'api_gets':0,'downloaded_bytes':0,'domains':{}}
        start = time.monotonic()
        for domain in model.DOMAINS:
            before = time.monotonic()
            result = release.domain(context, domain)
            assert result['status'] == 'success'
            metrics['domains'][domain] = round(time.monotonic()-before,3)
        merged = model.merge_results(context, [model.read_json(model.OUT / ('result-'+name+'.json')) for name in model.DOMAINS])
        assert len(merged['targets']) == 16 and len(merged['files']) == 10 and len(merged['images']) == 6
        metrics['seconds'] = round(time.monotonic()-start,3)
        reports.append(dict(metrics))
        print(json.dumps(metrics), flush=True)
        # Simulate a fresh workspace: the second pass must restore from the persistent cache.
        for item in (model.OUT / 'files').iterdir():
            if item.is_file() and any(item.name == f['name'] for f in merged['files']):
                item.unlink()
model.write_json(model.OUT / 'performance/readonly-benchmark.json', reports)
