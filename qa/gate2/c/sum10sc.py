import sys
NEWD=sys.argv[1] if len(sys.argv)>1 else "r10"
OLDD=sys.argv[2] if len(sys.argv)>2 else "r10old"
import json,glob,collections,sys,re
def rows(pat):
    d={}
    for f in sorted(glob.glob(pat)):
        for line in open(f):
            if line.startswith('{'):
                r=json.loads(line)
                if 'err' not in r: d[r['id'].split('-',1)[1]]=r
                else: print('ERR',r)
    return d
new=rows(NEWD+'/sc-N*.log'); old=rows(OLDD+'/sc-N*.log')
print('pages',len(new))
tot=collections.Counter(); otot=collections.Counter()
for k,r in sorted(new.items()):
    for key in ('over','split','tail','ell'):
        tot[key]+=len(r[key])
        if k in old: otot[key]+=len(old[k][key])
        for x in r[key]: print(key.upper(),k,r['label'],x)
    tot['docW']+=r['docW']>r['vw']; tot['wraps']+=len(r['wraps']); tot['zh']+=len(r['zh'])
print('new',dict(tot)); print('old(464a280)',dict(otot))
print('--- zh rules')
seen=set()
for k,r in sorted(new.items()):
    for x in r['zh']:
        if x not in seen: seen.add(x); print(k,r['label'],x)
print('--- ax')
ax=collections.Counter(); ch=set(); sp=set()
for k,r in new.items():
    a=r['ax']; ax['buttons']+=a['buttons']; ax['choice']+=a.get('choice',0); ax['chev']+=len(a['chevron']); ax['mismatch']+=len(a['mismatch'])
    for x in a['chevron']: ch.add(x)
    for x in a['space']: sp.add((r['label'],x))
print(dict(ax)); print('chevron samples',list(ch)[:5])
# space: only report names with whitespace INSIDE a Han run that is not between separate elements -> list all for manual
print('space names',len(sp))
for l,x in sorted(sp)[:200]:
    if not re.search(r'^\d+ ',x): print('  ',l,repr(x))
print('--- fl-wrap')
for k,r in sorted(new.items()):
    for w in r['wraps']: print(k,r['label'],'|',w['unit'],'|',' ⏎ '.join(w['lines']))
print('--- ax r8 extra')
c=collections.Counter(); bad=[]
for k,r in new.items():
    a=r['ax']; c['fits']+=a.get('fits',0); c['fitBad']+=len(a.get('fitBad',[])); c['newline']+=a.get('newline',0); c['cand']+=a.get('cand',0); c['mismatch']+=len(a['mismatch'])
    bad+= [(k,x) for x in a.get('fitBad',[])]+[(k,x) for x in a['mismatch']]
print(dict(c))
for x in bad[:30]: print('  ',x)
oz=collections.Counter()
for k,r in old.items():
    for x in r['zh']: oz[x]+=1
nz=collections.Counter()
for k,r in new.items():
    for x in r['zh']: nz[x]+=1
print('zh new-only', [x for x in nz if x not in oz])
