import json,collections,sys
def load(p):
    st={}
    for l in open('scan13-4189.jsonl' if p=='4189' else '../work12/scan12-4190.jsonl'):
        d=json.loads(l); st[(d['size'],d['lang'],d['scale'],d['i'],d['k'])]=d
    return st
KINDS=sys.argv[1].split(',') if len(sys.argv)>1 else ['over','menu','cut','btn','overlap']
def agg(st):
    a=collections.OrderedDict()
    for key,d in st.items():
        for k in KINDS:
            for o in d.get(k,[]):
                if k=='btn' and not o['other'].startswith('text:'): continue
                if k=='overlap' and ('phone-status' in o['asel'] or 'act-kick' in o['asel'] or ('patience' in o['asel'] and 'strong' in o['csel'])): continue
                if k=='cut' and o.get('scroll'): kk='cutScroll'
                else: kk=k
                desc={x:v for x,v in o.items() if x not in ('lines','px','area','shown','rect','menu')}
                kd=(kk,d['sc'],json.dumps(desc,ensure_ascii=False))
                e=a.setdefault(kd,{'combos':set(),'px':[],'shot':d['shot']})
                e['combos'].add('%s%s%dk%d'%(d['size'][1:],d['lang'],d['scale']*100,d['k']))
                for x in ('px','area','shown'):
                    if x in o: e['px'].append(o[x])
    return a
n=load('4189'); o=load('4190')
print('states',len(n),len(o))
A=agg(n); B=agg(o)
for k,e in A.items():
    tag='SAME' if k in B else 'NEW'
    print(tag,k[0],'s%d'%k[1],k[2][:230])
    print('      ',sorted(set(e['px']))[:5],len(e['combos']),','.join(sorted(e['combos'])[:6]),e['shot'])
gone=[k for k in B if k not in A]
print('GONE (4189 only):',len(gone))
for k in gone: print('  GONE',k[0],'s%d'%k[1],k[2][:200], sorted(B[k]['combos'])[:3])
