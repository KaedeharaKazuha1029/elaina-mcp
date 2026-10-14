import sys,json,termios,urllib.request,urllib.error,base64,concurrent.futures,time
from pathlib import Path
settings=termios.tcgetattr(sys.stdin);settings[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,settings)
print('Ready for private upload credentials on stdin (input hidden).',flush=True)
config=json.loads(sys.stdin.readline());root=Path(config['root']);export=Path(config['export']);manifest=json.loads((export/'manifest.json').read_text());origin=config['origin'];headers={'OAI-Sites-Authorization':'Bearer '+config['site_token'],'X-Corpus-Import-Token':config['import_token']}
def call(body,method='POST',path=''):
 url=origin+'/api/corpus/import'+path
 data=body if isinstance(body,bytes) else json.dumps(body,ensure_ascii=False,separators=(',',':')).encode()
 h={**headers,'Content-Type':'application/octet-stream' if isinstance(body,bytes) else 'application/json'}
 for attempt in range(4):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=h,method=method),timeout=90) as r:
    result=json.loads(r.read());return result
  except urllib.error.HTTPError as e:
   detail=e.read().decode()[:300]
   if e.code not in [429,502,503,504] or attempt==3:raise RuntimeError(f'HTTP {e.code}: {detail}')
  except (TimeoutError,urllib.error.URLError):
   if attempt==3:raise
  time.sleep(1+attempt)
def parallel_batches(jobs,label):
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  futures=[pool.submit(call,j) for j in jobs]
  for i,f in enumerate(concurrent.futures.as_completed(futures),1):f.result();print(f'{label}: {i}/{len(futures)}',flush=True)
parallel_batches([{'action':'documents',**json.loads(f.read_text())} for f in sorted(export.glob('documents-*.json'))],'D1 index batches')
small=[f for f in manifest['files'] if f['byte_size']<=1_000_000];large=[f for f in manifest['files'] if f['byte_size']>1_000_000]
batches=[];batch=[];size=0
for f in small:
 item={'path':f['path'],'base64':base64.b64encode((root/f['path']).read_bytes()).decode()};n=len(item['base64'])+len(item['path'])*3
 if batch and (len(batch)>=20 or size+n>2_400_000):batches.append({'action':'files','files':batch});batch=[];size=0
 batch.append(item);size+=n
if batch:batches.append({'action':'files','files':batch})
parallel_batches(batches,'R2 file batches')
from urllib.parse import quote
for f in large:
 r=call((root/f['path']).read_bytes(),method='PUT',path='?path='+quote(f['path'],safe=''));assert r['sha256']==f['sha256'];print('R2 large source object verified at upload:',f['path'],f['byte_size'],flush=True)
for offset in range(0,len(manifest['files']),20):
 r=call({'action':'verify_files','offset':offset,'limit':20});print(f'Reread verified R2 objects: {min(offset+20,len(manifest["files"]))}/{len(manifest["files"])}',flush=True)
receipt=call({'action':'finalize'});(export/'hosted-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(receipt,ensure_ascii=False),flush=True)
