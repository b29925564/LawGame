import json,collections,sys,re
def load(P):
  st={}
  for l in open(f'scan14-{P}.jsonl'):
    d=json.loads(l)
    if 'fail' in d: st[(d['tag'],'fail')]=d; continue
    st[(d['tag'],d['k'])]=d
  return st
def agg(st):
  a=collections.OrderedDict()
  for key,d in st.items():
    if 'fail' in d: continue
    for k in ['over','menu','cut','btn','overlap']:
      for o in d.get(k,[]):
        if k=='btn' and not o['other'].startswith('text:'): continue
        kk='cutScroll' if (k=='cut' and o.get('scroll')) else k
        desc={x:v for x,v in o.items() if x not in ('lines','px','area','shown','rect','menu')}
        kd=(kk,d['ep'],d['sc'],d.get('seed') if str(d.get('seed','')).startswith('board') else '',json.dumps(desc,ensure_ascii=False))
        e=a.setdefault(kd,{'combos':set(),'shot':d.get('shot')})
        e['combos'].add('%s-%s-k%d'%(d['size'],d['lang'],d['k']))
  return a
A=load('4189'); B=load('4190')
print('states',len(A),len(B),'fails',[k[0] for k in A if k[1]=='fail'],[k[0] for k in B if k[1]=='fail'])
common=set(A)&set(B)
print('common states',len(common),'only new',len(set(A)-set(B)),'only old',len(set(B)-set(A)))
a=agg({k:A[k] for k in common}); b=agg({k:B[k] for k in common})
cnt=collections.Counter()
for k in a: cnt[(k[0],'SAME' if k in b else 'NEW')]+=1
for k in b:
  if k not in a: cnt[(k[0],'GONE')]+=1
print(sorted(cnt.items()))
for k,e in a.items():
  if k not in b: print('NEW',k[0],k[1],k[2],k[3],k[4][:220],'\n     ',len(e['combos']),sorted(e['combos'])[:5],e['shot'])
for k,e in b.items():
  if k not in a: print('GONE',k[0],k[1],k[2],k[3],k[4][:200],'\n     ',len(e['combos']),sorted(e['combos'])[:5])
# 立繪重疊
so=[(k,A[k]['stage']['overlap']) for k in A if A[k].get('stage') and A[k]['stage'].get('overlap')]
print('stage states new',sum(1 for k in A if A[k].get('stage')),'overlap',len(so),so[:3])
so=[(k,B[k]['stage']['overlap']) for k in B if B[k].get('stage') and B[k]['stage'].get('overlap')]
print('stage states old',sum(1 for k in B if B[k].get('stage')),'overlap',len(so),so[:3])
# 主控台
for P,S in (('4189',A),('4190',B)):
  errs=collections.Counter()
  for d in S.values():
    for e in d.get('errors') or []: errs[e[:120]]+=1
  print('errors',P,dict(errs))
# 無障礙名稱：同一狀態按鈕名稱（可見的）比對
def names(d): return sorted(x['name'] for x in (d.get('ax') or []) if x.get('vis',True) is not False)
nb=[0,0]; diffs=[]
for k in sorted(common, key=str):
  if k[1]=='fail': continue
  na=names(A[k]); nb_=names(B[k]); nb[0]+=len(na); nb[1]+=len(nb_)
  if na!=nb_: diffs.append((k,sorted(set(na)-set(nb_))[:4],sorted(set(nb_)-set(na))[:4]))
print('ax buttons',nb,'states with name diffs',len(diffs))
for d in diffs[:15]: print('  ',d)
