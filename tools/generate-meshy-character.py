"""Generate one isolated, reviewed cartoon character study with Meshy.

Reads only the local ignored Meshy credential. Creation reserves a local manifest
before its single POST and refuses a second submission for the same character.
Status and download are separate, read-only operations; no automatic retries or
new paid tasks occur. Review source art before invoking create. Downloaded GLBs
are dense sculpt sources, not game assets. Never print credentials or data URIs.
"""
from pathlib import Path
import base64, datetime, hashlib, json, os, sys, urllib.error, urllib.parse, urllib.request

ROOT = Path(__file__).resolve().parents[1]
DRIVER = sys.argv[2] if len(sys.argv) > 2 else ''
if DRIVER not in {'dario', 'sam', 'elon', 'jensen', 'mira', 'feifei'}:
    raise SystemExit('Usage: generate-meshy-character.py create|status|download|balance DRIVER')
OUT = ROOT / 'art/characters/roster' / DRIVER
STATE = OUT / 'generation.json'
KEY_FILE = ROOT / '.env.meshy.local'
BASE = 'https://api.meshy.ai/openapi/v1'

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def save(data):
    tmp = STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n')
    tmp.replace(STATE)

def request(path, payload=None):
    key = next((line.split('=', 1)[1].strip().strip('\"').strip("'") for line in KEY_FILE.read_text().splitlines() if line.strip().startswith('MESHY_API_KEY=')), '')
    if not key:
        raise RuntimeError('Meshy key is missing')
    headers = {'Authorization': 'Bearer ' + key, 'User-Agent': 'SanTheftAuto-CharacterPilot/1.0'}
    body = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        body = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)

def download(url, path):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'assets.meshy.ai':
        raise RuntimeError('Unexpected asset host; inspect before downloading')
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    if path.suffix == '.glb' and data[:4] != b'glTF':
        raise RuntimeError('Downloaded asset is not a GLB')
    temporary = path.with_suffix(path.suffix + '.part')
    temporary.write_bytes(data)
    temporary.replace(path)
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

mode = sys.argv[1]
try:
    if mode == 'balance':
        print(json.dumps({'credit_balance': request('/balance').get('balance')}))
    elif mode == 'create':
        if STATE.exists():
            raise RuntimeError('Pilot already has a submission record; refusing another charge')
        balance = request('/balance')['balance']
        if balance < 30:
            raise RuntimeError('Fewer than 30 credits are available')
        source = OUT / (DRIVER + '-cartoon-bust-v1.png')
        image = source.read_bytes()
        spec = {'ai_model': 'meshy-7.1', 'model_type': 'standard', 'geometry_resolution': 'standard', 'should_texture': True, 'enable_pbr': True, 'texture_resolution': '4k', 'should_remesh': False, 'image_enhancement': False, 'pose_mode': '', 'target_formats': ['glb'], 'multi_view_thumbnails': True}
        record = {'driver': DRIVER, 'provider': 'Meshy', 'created_at': now(), 'status': 'SUBMITTING', 'expected_credits': 30, 'balance_before': balance, 'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(image).hexdigest(), 'request': spec, 'review_status': 'pending_visual_review'}
        save(record)
        result = request('/image-to-3d', {**spec, 'image_url': 'data:image/png;base64,' + base64.b64encode(image).decode()})
        record.update({'task_id': result['result'], 'status': 'PENDING'})
        save(record)
        print(json.dumps({'driver': DRIVER, 'task_id': record['task_id'], 'status': record['status'], 'expected_credits': 30}))
    elif mode in ('status', 'download'):
        record = json.loads(STATE.read_text())
        task_id = record.get('task_id')
        if not task_id:
            raise RuntimeError('Submission outcome unknown; check provider tasks before retrying')
        result = request('/image-to-3d/' + urllib.parse.quote(task_id, safe=''))
        record.update({k: result[k] for k in ('status', 'progress', 'consumed_credits', 'started_at', 'finished_at', 'expires_at') if k in result})
        record['checked_at'] = now()
        error = (result.get('task_error') or {}).get('message')
        if error:
            record['task_error'] = error[:1000]
        if mode == 'download':
            if result['status'] != 'SUCCEEDED':
                raise RuntimeError('Task has not succeeded; no model to download')
            record['model'] = download(result['model_urls']['glb'], OUT / (DRIVER + '-meshy-v1.glb'))
            record['balance_after'] = request('/balance').get('balance')
        save(record)
        print(json.dumps({k: record[k] for k in ('driver', 'task_id', 'status', 'progress', 'consumed_credits', 'model', 'balance_after', 'task_error') if k in record}))
    else:
        raise RuntimeError('Unknown operation')
except urllib.error.HTTPError as e:
    print(json.dumps({'error': 'Meshy HTTP error', 'http_status': e.code, 'operation': mode}))
    sys.exit(1)
except urllib.error.URLError:
    print(json.dumps({'error': 'Network request failed', 'operation': mode}))
    sys.exit(1)
except Exception as e:
    print(json.dumps({'error': str(e), 'operation': mode}))
    sys.exit(1)
