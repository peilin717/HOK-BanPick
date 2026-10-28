#!/usr/bin/env python3
"""Refresh mainland roster and official default-skin media; no third-party packages.

Run: python3 scripts/sync-assets.py [--workers 8] [--refresh-media]
Missing voice/image data is reported, never substituted with another hero.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'vite-project/public'
DATA = PUBLIC / 'data'
MEDIA = PUBLIC / 'media/heroes'
ROSTER = 'https://pvp.qq.com/web201605/js/herolist.json'
VOICE = 'https://pvp.qq.com/zlkdatasys/yuzhouzhan/herovoice/{}.json'
ROLE_NAMES = {'1': '对抗路', '2': '打野', '3': '中路', '4': '发育路', '5': '游走'}
# Official IP heroList represents every Yuanliu class as one character (581).
# See https://pvp.qq.com/zlkdatasys/yuzhouzhan/list/heroList.json.
SHARED_VOICE_IDS = {582: 581, 583: 581, 584: 581, 585: 581}
CACHED_SOURCES = {}
if (DATA / 'heroes.json').exists():
    try:
        for cached in json.loads((DATA / 'heroes.json').read_text(encoding='utf-8'))['heroes']:
            records = list(cached.get('voiceOptions', [])) + [cached.get('sources', {}).get(k) for k in ('portrait', 'splash')]
            for record in records:
                if record:
                    CACHED_SOURCES[record['url']] = record['sourceUrl']
    except (ValueError, KeyError):
        pass


def url(value):
    if not value:
        return ''
    return 'https:' + value if value.startswith('//') else value.replace('http:', 'https:', 1)


def fetch(address, attempts=3):
    request = urllib.request.Request(address, headers={'User-Agent': 'HOK-BP-Class-Tournament/1.0', 'Referer': 'https://pvp.qq.com/ip/voice.html'})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read(), dict(response.headers)
        except urllib.error.HTTPError as error:
            if error.code == 404 or attempt == attempts - 1:
                raise
        except Exception:
            if attempt == attempts - 1:
                raise
        time.sleep(0.6 * (attempt + 1))


def as_list(value):
    return value if isinstance(value, list) else [value] if isinstance(value, dict) else []


def save_media(address, stem, refresh):
    address = url(address)
    if not address:
        return None
    extension = Path(urllib.parse.urlparse(address).path).suffix.lower() or '.jpg'
    if extension not in {'.jpg', '.jpeg', '.png', '.webp', '.mp3', '.wav', '.ogg'}:
        raise ValueError('Unexpected media extension: ' + extension)
    target = MEDIA / (stem + extension)
    local_url = '/media/heroes/' + target.name
    if refresh or not target.exists() or target.stat().st_size < 100 or CACHED_SOURCES.get(local_url, address) != address:
        blob, headers = fetch(address)
        if len(blob) < 100 or blob[:100].lstrip().startswith((b'<html', b'<!DOCTYPE')):
            raise ValueError('Invalid media response')
        tmp = target.with_suffix(extension + '.tmp')
        tmp.write_bytes(blob)
        tmp.replace(target)
    blob = target.read_bytes()
    return {'url': '/media/heroes/' + target.name, 'sourceUrl': address,
            'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}


def process(hero, refresh):
    hero_id = hero['ename']
    errors = []
    voice_hero_id = SHARED_VOICE_IDS.get(hero_id, hero_id)
    metadata_url = VOICE.format(voice_hero_id)
    voice_data = {}
    try:
        blob, headers = fetch(metadata_url)
        voice_data = json.loads(blob.decode('utf-8-sig'))
        (DATA / 'voice-source' / f'{hero_id}.json').write_bytes(blob)
    except Exception as error:
        errors.append({'kind': 'voice-metadata', 'source': metadata_url, 'error': str(error)})
    groups = as_list(voice_data.get('dqpfyy_5403'))
    default_skin = hero.get('skin_name', '').split('|')[0]
    group = next((g for g in groups if g.get('pfmczt_7754') in {default_skin, '经典', '经典皮肤', '原皮'}), groups[0] if groups else {})
    records = as_list(group.get('yylbzt_9132'))
    lobby = [r for r in records if any(label in r.get('yygn_8632', '') for label in ('大厅', '选取', '登场')) and r.get('yywjzt_5304')]
    selected_voices = []
    for index, record in enumerate(lobby[:3]):
        source = url(record['yywjzt_5304'])
        try:
            media = save_media(source, f'{hero_id}-voice-{index + 1}', refresh)
            selected_voices.append({**media, 'text': record.get('yywbzt_1517', ''), 'label': record.get('yygn_8632', ''), 'skin': group.get('pfmczt_7754', default_skin)})
        except Exception as error:
            errors.append({'kind': 'voice', 'source': source, 'error': str(error)})
    portrait_source = f'https://game.gtimg.cn/images/yxzj/img201606/heroimg/{hero_id}/{hero_id}.jpg'
    splash_source = (url(group.get('pffmtm_8153')) if voice_hero_id == hero_id else '') or f'https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{hero_id}/{hero_id}-bigskin-1.jpg'
    images = {}
    for kind, source in [('portrait', portrait_source), ('splash', splash_source)]:
        try:
            images[kind] = save_media(source, f'{hero_id}-{kind}', refresh)
        except Exception as error:
            errors.append({'kind': kind, 'source': source, 'error': str(error)})
            images[kind] = None
    role_ids = [r for r in str(hero.get('roles', '')).split('|') if r]
    first_voice = selected_voices[0] if selected_voices else None
    return {'id': hero_id, 'name': hero['cname'], 'pinyin': hero.get('id_name', ''),
            'title': hero.get('title', ''), 'releaseDate': hero.get('time', ''),
            'roles': [ROLE_NAMES.get(r, r) for r in role_ids], 'roleIds': role_ids,
            'heroTypes': [hero.get(k) for k in ('hero_type', 'hero_type2') if hero.get(k)],
            'portrait': images['portrait']['url'] if images['portrait'] else '',
            'splash': images['splash']['url'] if images['splash'] else '',
            'voice': first_voice['url'] if first_voice else None,
            'voiceText': first_voice['text'] if first_voice else '',
            'voiceOptions': selected_voices, 'voiceAvailable': bool(selected_voices),
            'voiceHeroId': voice_hero_id,
            'voiceSharedReason': '官方世界观站将元流之子各职业归为角色581，共用大厅语音' if voice_hero_id != hero_id else '',
            'voiceRecordCount': len(records), 'voiceLobbyCount': len(lobby),
            'sources': {'roster': ROSTER, 'voiceMetadata': metadata_url,
                        'portrait': images['portrait'], 'splash': images['splash']}, 'errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=8)
    parser.add_argument('--refresh-media', action='store_true')
    parser.add_argument('--verify', action='store_true', help='Verify local hashes and ffprobe decodability; no network')
    args = parser.parse_args()
    if args.verify:
        manifest = json.loads((DATA / 'heroes.json').read_text(encoding='utf-8'))
        records = []
        for hero in manifest['heroes']:
            records.extend(hero['voiceOptions'])
            records.extend(hero['sources'][key] for key in ('portrait', 'splash') if hero['sources'].get(key))
        errors = []
        ffprobe = shutil.which('ffprobe')
        if not ffprobe:
            raise SystemExit('ffprobe required for media verification')
        def verify(record):
            path = PUBLIC / record['url'].lstrip('/')
            try:
                content = path.read_bytes()
                if hashlib.sha256(content).hexdigest() != record['sha256']:
                    raise ValueError('SHA256 mismatch')
                result = subprocess.run([ffprobe, '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', str(path)], capture_output=True, text=True, timeout=15)
                if result.returncode or not json.loads(result.stdout).get('streams'):
                    raise ValueError('ffprobe cannot read stream: ' + result.stderr[:100])
            except Exception as error:
                return {'path': str(path), 'error': str(error)}
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            errors = [error for error in pool.map(verify, records) if error]
        report = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'filesChecked': len(records), 'errors': errors}
        (DATA / 'media-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(1 if errors else 0)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'voice-source').mkdir(exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)
    raw, headers = fetch(ROSTER)
    roster = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(roster, list) or len(roster) < 100 or len({h['ename'] for h in roster}) != len(roster):
        raise ValueError('Roster invalid; keeping existing manifest')
    (DATA / 'official-herolist.json').write_bytes(raw)
    print(f'Official mainland roster: {len(roster)} entries', flush=True)
    heroes = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as pool:
        futures = {pool.submit(process, h, args.refresh_media): h for h in roster}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            heroes.append(result)
            print(f"[{len(heroes)}/{len(roster)}] {result['id']} {result['name']} voice={len(result['voiceOptions'])} errors={len(result['errors'])}", flush=True)
    order = {h['ename']: i for i, h in enumerate(roster)}
    heroes.sort(key=lambda h: order[h['id']])
    coverage = {'total': len(heroes), 'portraits': sum(bool(h['portrait']) for h in heroes),
                'splashes': sum(bool(h['splash']) for h in heroes),
                'heroesWithVoices': sum(h['voiceAvailable'] for h in heroes),
                'voiceFiles': sum(len(h['voiceOptions']) for h in heroes),
                'missingVoices': [{'id': h['id'], 'name': h['name']} for h in heroes if not h['voiceAvailable']],
                'errors': [{'id': h['id'], 'name': h['name'], **e} for h in heroes for e in h['errors']]}
    output = {'schemaVersion': 1, 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'sources': {'roster': ROSTER, 'voicePage': 'https://pvp.qq.com/ip/voice.html',
                          'voiceEndpoint': VOICE, 'rosterLastModified': headers.get('Last-Modified', '')},
              'coverage': coverage, 'heroes': heroes}
    temporary = DATA / 'heroes.json.tmp'
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DATA / 'heroes.json')
    (DATA / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(coverage, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
