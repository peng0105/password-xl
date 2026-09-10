"""Jenkins dispatches one explicit worker request and consumes its exact artifacts."""
import json
import time
import uuid
from pathlib import Path

from api import Api
from model import OUT, check_identity, env, extract_zip, read_json, require, sha256, write_json


def github():
    return Api('https://api.github.com', env('GH_TOKEN'), True)


def find_run(api, record):
    path = f'/repos/{record["repo"]}/actions/workflows/{record["workflow"]}/runs?event=workflow_dispatch&per_page=100'
    candidates = api.request('GET', path)['workflow_runs']
    matches = [r for r in candidates if r.get('display_title') == 'Jenkins ' + record['request_id']]
    require(len(matches) <= 1, 'Ambiguous GitHub worker run')
    return matches[0]['id'] if matches else None


def recover_file(records, file, destination):
    """Recover original bytes after a release upload failure, using only the recorded run."""
    from model import checked_relative
    for record in records:
        api = github()
        path = f'/repos/{record["repo"]}/actions/runs/{record["run_id"]}/artifacts'
        artifacts = api.pages(path, 'artifacts')
        matches = [a for a in artifacts if a['name'] == 'worker-' + record['request_id'] and not a['expired']]
        if not matches:
            continue
        require(len(matches) == 1, 'Ambiguous recovery artifact')
        directory = OUT / 'recovery' / str(record['run_id'])
        archive = directory.with_suffix('.zip')
        api.download(matches[0]['archive_download_url'], archive)
        extract_zip(archive, directory)
        result = read_json(directory / 'result.json')
        require(result['request_id'] == record['request_id'] and result['status'] == 'success', 'Recovery receipt mismatch')
        for candidate in result.get('files', []):
            if candidate['name'] == file['name']:
                import shutil
                path = directory / checked_relative(candidate['path'])
                require(sha256(path) == file['sha256'], 'Recovery checksum mismatch')
                shutil.copyfile(path, destination)
                return
    raise ValueError('Original worker artifact expired or missing; restore the archived Jenkins artifact')


def dispatch(context, task, targets, **extra):
    api = github()
    repo = '/repos/' + env('GITHUB_REPO')
    request_id = uuid.uuid4().hex
    payload = {**context, 'task': task, 'targets': targets, 'request_id': request_id, **extra}
    workflow = env('GITHUB_WORKFLOW', 'build-workers.yml')
    api.request('GET', repo + '/actions/workflows/' + workflow)
    record = {'request_id': request_id, 'task': task, 'repo': env('GITHUB_REPO'), 'workflow': workflow}
    path = OUT / 'workers' / f'{request_id}.json'
    write_json(path, record)
    try:
        response = api.request('POST', repo + '/actions/workflows/' + workflow + '/dispatches', {
            'ref': context['version'], 'inputs': {'request_id': request_id, 'task': task, 'payload': json.dumps(payload)},
        })
        run_id = response.get('workflow_run_id') if response else None
        deadline = time.monotonic() + 180
        while not run_id and time.monotonic() < deadline:
            run_id = find_run(api, record)
            if not run_id:
                time.sleep(5)
        require(run_id, 'GitHub did not return or expose the dispatched run')
        record['run_id'] = run_id
        write_json(path, record)
        deadline = time.monotonic() + int(env('WORKER_TIMEOUT_SECONDS', '7200'))
        while time.monotonic() < deadline:
            status = api.request('GET', f'{repo}/actions/runs/{run_id}')
            require(status['head_sha'] == context['source_sha'], 'Worker workflow ran from a different commit')
            if status['status'] == 'completed':
                require(status['conclusion'] == 'success', f'GitHub worker {run_id} failed: {status["conclusion"]}')
                break
            time.sleep(15)
        else:
            raise TimeoutError(f'GitHub worker {run_id} timed out')
        artifacts = api.pages(f'{repo}/actions/runs/{run_id}/artifacts', 'artifacts')
        matches = [a for a in artifacts if a['name'] == 'worker-' + request_id and not a['expired']]
        require(len(matches) == 1, 'Worker artifact missing or ambiguous')
        destination = OUT / 'workers' / str(run_id)
        archive = destination.with_suffix('.zip')
        api.download(matches[0]['archive_download_url'], archive)
        extract_zip(archive, destination)
        result = read_json(destination / 'result.json')
        check_identity(context, result)
        require(result['request_id'] == request_id and result['status'] == 'success', 'Worker receipt mismatch')
        require(set(result['targets']) == set(targets), 'Worker returned the wrong targets')
        for file in result.get('files', []) + result.get('archives', []):
            from model import checked_relative
            relative = checked_relative(file['path'])
            require(sha256(destination / relative) == file['sha256'], 'Worker artifact checksum mismatch')
        record['status'] = 'success'
        write_json(path, record)
        return result, destination, record
    except BaseException:
        cancel(record)
        raise


def cancel(record):
    api = github()
    if not record.get('run_id'):
        deadline = time.monotonic() + 60
        while not record.get('run_id') and time.monotonic() < deadline:
            record['run_id'] = find_run(api, record)
            if not record['run_id']:
                time.sleep(5)
        require(record.get('run_id'), 'Dispatch outcome is uncertain; inspect GitHub using the archived request ID')
    path = f'/repos/{record["repo"]}/actions/runs/{record["run_id"]}'
    status = api.request('GET', path)
    if status['status'] != 'completed':
        api.request('POST', path + '/cancel')


def cancel_all():
    errors = []
    for path in (OUT / 'workers').glob('*.json'):
        record = read_json(path)
        if record.get('status') != 'success':
            try:
                cancel(record)
            except Exception as error:
                errors.append(str(error))
    require(not errors, 'Some workers could not be cancelled: ' + '; '.join(errors))
