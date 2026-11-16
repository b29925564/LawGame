import sys
NEWD=sys.argv[1] if len(sys.argv)>1 else "r10"
OLDD=sys.argv[2] if len(sys.argv)>2 else "r10old"
import json,glob,sys
def load(p):
    d={}
    for f in glob.glob(p):
        for R in json.load(open(f)):
            k=R['tag'].split('-')[1]
            d[k]=R
    return d
a=load(OLDD+'/r8-tour-*.json'); b=load(NEWD+'/r8-tour-*.json')
def m(v):
    if not isinstance(v,dict): return None
    t=v.get('text') if isinstance(v.get('text'),dict) else {}
    clip=[c for c in v.get('clip',[]) if not c.startswith('span.ck') and 'cork-' not in c]
    return dict(doc=(v.get('docW') or 0)>(v.get('vw') or 9e9), ell=len(v.get('ell',[]) or []), hs=len(v.get('hs',[]) or []), off=len(v.get('off',[]) or []), clip=len(clip),
                orph=len(t.get('orphans',[])), mid=t.get('midWordCount',0), kw=len(t.get('kwSplit',[])), _o=t.get('orphans',[]), _m=t.get('midWord',[]))
tot={'a':{},'b':{}}
for k in sorted(b):
    if k not in a: continue
    for step,v in b[k]['steps'].items():
        mb=m(v); ma=m(a[k]['steps'].get(step))
        if not mb: 
            if isinstance(v,str) and not v.startswith('tab not'): print(k,step,'B:',v[:120])
            continue
        for kk in ('doc','ell','hs','off','clip','orph','mid','kw'):
            tot['b'][kk]=tot['b'].get(kk,0)+mb[kk]; tot['a'][kk]=tot['a'].get(kk,0)+(ma[kk] if ma else 0)
        diff={kk:(ma[kk] if ma else None,mb[kk]) for kk in ('doc','ell','hs','off','clip','orph','mid','kw') if not ma or ma[kk]!=mb[kk]}
        if diff:
            newo=[x for x in mb['_o'] if not ma or x not in ma['_o']]; newm=[x for x in mb['_m'] if not ma or x not in ma['_m']]
            print(k,b[k]['tag'],step,diff,'NEWorph',newo[:4],'NEWmid',newm[:4])
print('TOTAL r6',tot['a']); print('TOTAL r7',tot['b'])
kw=[]
for k in sorted(b):
    for step,v in b[k]['steps'].items():
        if isinstance(v,dict) and v.get('kwOver'): kw.append((b[k]['tag'],step,v['kwOver'][:4]))
print('kwOver',len(kw))
for x in kw: print('  ',x)
