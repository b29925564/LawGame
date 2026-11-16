import sys
NEWD=sys.argv[1] if len(sys.argv)>1 else "r10"
OLDD=sys.argv[2] if len(sys.argv)>2 else "r10old"
import json,glob,collections
def logs(p):
    d={}
    for f in glob.glob(p):
        for l in open(f):
            if l.startswith('{'):
                r=json.loads(l); d[r['tag']]=r
    return d
new=logs(NEWD+'/tb-*.log'); old=logs(OLDD+'/tb-*.log')
for f in []:
    for r in json.load(open(f)): old[r['tag']]=r
print('n',len(new),'err',[t for t,r in new.items() if r.get('err')],'noHead',[t for t,r in new.items() if not r.get('head') and not r.get('err')])
ok={t:r for t,r in new.items() if r.get('head')}
print('ell',[t for t,r in ok.items() if r['ell']]); print('clip',[(t,r['clip']) for t,r in ok.items() if r['clip']]); print('docW',[t for t,r in ok.items() if r['docW']>r['vw']])
print('outs',[(t,r['v6']['outs']) for t,r in ok.items() if r['v6']['nOut']])
print('flWrap',sorted(set((t.split('-')[1],tuple(r['v6']['flWrap'])) for t,r in ok.items() if r['v6']['flWrap'])))
ns=collections.Counter()
for t,r in sorted(ok.items()):
    for x in r['v6']['nameSplit']:
        k=x.split(' (')[0]; ns[k]+=1
for k,c in ns.items(): print('nameSplit',c,k)
bad8=sorted([(min(x for x in (r['v6']['near'],r['v6']['nearBox']) if x is not None),t,r['v6']['nearT'],r['v6']['nearBoxT']) for t,r in ok.items() if min(x for x in (r['v6']['near'],r['v6']['nearBox']) if x is not None)<8])
print('within8',len(bad8))
for x in bad8: print('  ',x)
o8=sorted([(r['v6']['near'],t) for t,r in old.items() if r.get('v6') and r['v6']['near']<8])
print('old within8 text-only',len(o8))
print('dueRow',[(t,r['v6']['dueNear']) for t,r in ok.items() if r['v6']['dueRow']])
nb=0
for t,r in sorted(ok.items()):
    if t not in old: continue
    a=set(old[t].get('bad',[])); b=set(r.get('bad',[]))
    if a!=b: nb+=1; print('BADDIFF',t,'new',b-a,'gone',a-b)
print('baddiff',nb)
for t,r in sorted(ok.items()):
    if r.get('due') and '-en-' in t:
        L=[x.replace('\xa0',' ') for x in r['due']['lines']]
        if len(L)>=3 or (len(L)>1 and len(L[-1].split())==1) or any(('Discovery' in x)!=('deadline' in x) for x in L): print('DUE',t,L)
