# 第十四輪大立繪檢查（#346）：看得到的範圍＝img ∩ 框（overflow:hidden 時）∩ 視窗。
#  人物（α>40）外框 → 左緣離 main/.lines 右緣、右緣離畫面邊、頭頂離選單鈕、人高/畫面高；
#  框左緣離 main 右緣（框有沒有伸進台詞欄）；框裁切的兩條直線上（左右各一欄）有沒有不透明像素（直線切到頭髮/肩膀）；
#  顯示寬×DPR 對來源檔、對原圖 1256；底列人寬；和畫面其他東西疊到不透明像素；和框本身相交的東西。
import json, sys, os, urllib.request, glob
from PIL import Image
import numpy as np
C='/tmp/claude-0/-home-user/e45f1458-63ca-52ce-bc1f-2fc0e0bea06d/scratchpad/pimg13'; os.makedirs(C,exist_ok=True)
cache={}
def alpha(src):
    if src not in cache:
        p=f"{C}/{src.split('//')[1].split('/')[0].split(':')[-1]}-{src.split('/')[-1]}"
        if not os.path.exists(p): urllib.request.urlretrieve(src,p)
        cache[src]=np.asarray(Image.open(p).convert('RGBA'))[...,3]
    return cache[src]
TH=40
out=sys.argv[1]; files=sys.argv[2:]
rows=[]
for f in files:
    for run in json.load(open(f)):
        for m in run['steps']:
            s=m.get('stage')
            if not s: continue
            A=alpha(s['src']); H,W=A.shape
            i=s['img']; fg=s['fig']; sc=(i[2]-i[0])/W
            vh,vw=m['vh'],m['vw']
            hid = s.get('ov')=='hidden'
            X0=max(i[0],fg[0] if hid else i[0],0); X1=min(i[2],fg[2] if hid else i[2],vw)
            Y0=max(i[1],fg[1] if hid else i[1],0); Y1=min(i[3],fg[3] if hid else i[3],vh)
            c0=int(round((X0-i[0])/sc)); c1=int(round((X1-i[0])/sc)); r0=int(round((Y0-i[1])/sc)); r1=int(round((Y1-i[1])/sc))
            c0=max(0,c0); c1=min(W,c1); r0=max(0,r0); r1=min(H,r1)
            vis=A[r0:r1,c0:c1]; op=vis>TH
            ys,xs=np.where(op); xs=xs+c0; ys=ys+r0
            fx0=float(i[0]+xs.min()*sc); fx1=float(i[0]+(xs.max()+1)*sc); fy0=float(i[1]+ys.min()*sc)
            mainR=m['main'][2] if m['main'] else None; linesR=m['lines'][2] if m['lines'] else None
            clipL=int(A[r0:r1,c0].max()); clipR=int(A[r0:r1,c1-1].max())
            # 裁切線往內 3 欄內最大 α（看是不是只差一點就切到）
            clipL3=int(A[r0:r1,c0:c0+3].max()); clipR3=int(A[r0:r1,c1-3:c1].max())
            brow=r1-1; botw=float((A[brow,c0:c1]>128).mean()); br=np.where(A[brow,c0:c1]>TH)[0]+c0
            mn=m['menu']; mdist=None
            if mn:
                Xc=i[0]+(xs+0.5)*sc; Yc=i[1]+(ys+0.5)*sc
                dx=np.maximum(0,np.maximum(mn[0]-Xc,Xc-mn[2])); dy=np.maximum(0,np.maximum(mn[1]-Yc,Yc-mn[3]))
                mdist=float(np.sqrt(dx*dx+dy*dy).min())-sc/2
            hits=[]; boxhits=[]
            for it in m['items']:
                if 'vo-hit' in it['el']: continue
                r=it['r']
                bx0=max(r[0],X0); bx1=min(r[2],X1); by0=max(r[1],Y0); by1=min(r[3],Y1)
                if bx1<=bx0 or by1<=by0: continue
                boxhits.append(f"{it['k']}「{it['t']}」{it['el']}")
                a0=int((bx0-i[0])/sc); a1=int(np.ceil((bx1-i[0])/sc)); b0=int((by0-i[1])/sc); b1=int(np.ceil((by1-i[1])/sc))
                sub=A[max(0,b0):min(H,b1),max(0,a0):min(W,a1)]
                if sub.size and sub.max()>TH: hits.append(f"{it['k']}「{it['t']}」{it['el']} α{int(sub.max())}")
            row=dict(base=run.get('base'),ep=run.get('ep','ep1'),size=run['size'],lang=run['lang'],sc=run['sc'],step=m['step'],mood=s['src'].split('__')[2],nw=s['nw'],dpr=m['dpr'],
                     k=s.get('k'),ov=s.get('ov'),ratio_src=round(sc*m['dpr'],3),ratio_orig=round(sc*W*m['dpr']/1256,3),vw=vw,vh=vh,
                     fig=[round(v,2) for v in fg],img=[round(v,2) for v in i],
                     box_main=round(fg[0]-mainR,2) if mainR else None, box_lines=round(fg[0]-linesR,2) if linesR else None,
                     left_main=round(fx0-mainR,2) if mainR else None,left_lines=round(fx0-linesR,2) if linesR else None,
                     right_gap=round(vw-fx1,1),fig_right_gap=round(vw-fg[2],1),top=round(fy0,1),hpx=round(Y1-fy0,1),hfrac=round((Y1-fy0)/vh,4),menu_d=round(mdist,1) if mdist is not None else None,
                     clipcols=(c0,c1-1),clipA=(clipL,clipR),clipA3=(clipL3,clipR3),botw=round(botw,2),bot_ends=(round(i[0]+br.min()*sc,1),round(i[0]+(br.max()+1)*sc,1)) if br.size else None,
                     fig_bottom_gap=round(vh-fg[3],2),hits=hits,boxhits=boxhits,pe=s['peF'],tf=s['tf'],rot=s['rot'],shot=m.get('shot'),zoom=m.get('zoom'),heading=m['heading'],sw=m['sw'])
            rows.append(row)
json.dump(rows,open(out,'w'),ensure_ascii=False,indent=0)
grp={}
for r in rows: grp.setdefault((r['base'][-4:],r['ep'],r['size'],r['lang']),[]).append(r)
def agg(v,key):
    xs=[x[key] for x in v if x[key] is not None]
    return (min(xs),max(xs)) if xs else None
for k,v in sorted(grp.items()):
    r=v[0]
    print(f"{k[0]} {k[1]} {k[2]:7s} {k[3]} n{len(v)} 場{sorted(set(x['sc'] for x in v),key=int)} 表情{sorted(set(x['mood'] for x in v))} nw{sorted(set(x['nw'] for x in v))} k{sorted(set(x['k'] for x in v))} ov{set(x['ov'] for x in v)} 顯示/來源{sorted(set(x['ratio_src'] for x in v))} 顯示/原圖{sorted(set(x['ratio_orig'] for x in v))}")
    print(f"     框{r['fig']} 框−main {agg(v,'box_main')} 框−lines {agg(v,'box_lines')} | 人左−main {agg(v,'left_main')} −lines {agg(v,'left_lines')} | 人右離邊 {agg(v,'right_gap')} 框右離邊 {agg(v,'fig_right_gap')} | 頭頂y {agg(v,'top')} 人高 {agg(v,'hpx')} 佔 {agg(v,'hfrac')} 離選單 {agg(v,'menu_d')}")
    print(f"     裁切欄{sorted(set(x['clipcols'] for x in v))} 裁切線α{sorted(set(x['clipA'] for x in v))} 往內3欄α{sorted(set(x['clipA3'] for x in v))} 底列人寬{agg(v,'botw')} 框底離畫面底{agg(v,'fig_bottom_gap')} sw{agg(v,'sw')} pe{set(x['pe'] for x in v)} tf{set(x['tf'] for x in v)} rot{set(x['rot'] for x in v)} | 疊不透明 {sum(1 for x in v if x['hits'])} 步 框內有東西 {sum(1 for x in v if x['boxhits'])} 步")
for r in rows:
    if r['hits'] or r['boxhits']: print('  疊',r['base'][-4:],r['ep'],r['size'],r['lang'],'sc',r['sc'],'step',r['step'],'不透明',r['hits'][:3],'框',r['boxhits'][:3])
