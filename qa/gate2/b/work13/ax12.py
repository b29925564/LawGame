import json,collections,re
def load(p):
    st={}
    for l in open('scan13-4189.jsonl' if p=='4189' else '../work12/scan12-4190.jsonl'):
        d=json.loads(l); st[(d['size'],d['lang'],d['scale'],d['i'],d['k'])]=d
    return st
col=lambda s: re.sub(r'\s+',' ',(s or '').replace('\xa0',' ')).strip()
def issues(a):
    n=a['name']; out=[]
    if a.get('menu') or not a.get('vis',True): return out
    if n!=n.strip(): out.append('前後空白')
    if '  ' in n: out.append('連續空白')
    if '\n' in n: out.append('換行')
    if '\xa0' in n: out.append('nbsp')
    if not n.strip(): out.append('沒名字')
    t=col(a.get('text'))
    if a.get('aria') or a.get('labelledby'):
        if t and col(t).lower() not in col(n).lower(): out.append('畫面字不在名稱裡')
    else:
        if col(n)!=t: out.append('名稱≠畫面字')
    return out
R={}
for p in ('4190','4189'):
    st=load(p); agg=collections.OrderedDict(); nb=0
    for key,d in st.items():
        for a in d.get('ax',[]):
            nb+=1
            for iss in issues(a):
                k=(d['sc'],iss,col(a['name'])[:70],col(a.get('text'))[:50])
                e=agg.setdefault(k,{'n':0,'combos':set(),'raw':repr(a['name'])[:120],'shot':d['shot']}); e['n']+=1; e['combos'].add('%s%s%d'%(d['size'][1:],d['lang'],d['scale']*100))
    R[p]=agg; print(p,'buttons seen',nb,'issue kinds',len(agg))
A,B=R['4190'],R['4189']
for k,e in A.items():
    print('SAME' if k in B else 'NEW ', 's%d'%k[0],k[1],'| name:',e['raw'],'| text:',k[3],'|',len(e['combos']),sorted(e['combos'])[:4],e['shot'])
for k,e in B.items():
    if k not in A: print('GONE','s%d'%k[0],k[1],'| name:',e['raw'],'| text:',k[3],'|',sorted(e['combos'])[:4])
# 全部名稱差異（同狀態、同按鈕位置）
print('==== name diffs by state (4190 vs 4189), unique')
n,o=load('4189'),load('4190'); seen=set()
for key in n:
    if key not in o: continue
    an=[col(a['name']) for a in n[key]['ax'] if not a.get('menu')]; ao=[col(a['name']) for a in o[key]['ax'] if not a.get('menu')]
    sn,so=set(an),set(ao)
    for x in sn-so:
        k=('+',n[key]['sc'],x[:80])
        if k not in seen: seen.add(k); print('  +4190 s%d'%n[key]['sc'],key[:3],repr(x[:110]))
    for x in so-sn:
        k=('-',n[key]['sc'],x[:80])
        if k not in seen: seen.add(k); print('  -4189 s%d'%n[key]['sc'],key[:3],repr(x[:110]))
