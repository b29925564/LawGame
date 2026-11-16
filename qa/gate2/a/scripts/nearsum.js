const fs=require('fs');const D='/tmp/claude-0/ux-1106a/';
const pf=process.argv[2];
const files=fs.readdirSync(D).filter(f=>f.startsWith(`data-${pf}near-`));
const rows=files.flatMap(f=>JSON.parse(fs.readFileSync(D+f)));
let bad=0;
for(const r of rows){ if(!r.near.length) continue; const s=[...r.near].sort((a,b)=>a.d-b.d); const m=s[0];
  const sc=r.tag.replace(/^lb-/,''); if(m.d<8) bad++;
  if(m.d<10 || /借據|IOU|place-tbd|TBD|待放|li/.test(m.what)) console.log((m.d<8?'BAD ':'    ')+sc.padEnd(26), r.phase.padEnd(11), s.slice(0,2).map(x=>`${x.what} ${x.d}(dx${x.dx},dy${x.dy})${x.ov?'OV':''}`).join(' | '));
}
console.log('rows',rows.length,'bad',bad);
// place-tbd beat rows: report nearest any
for(const r of rows.filter(r=>r.phase==='beat')){ const s=[...r.near].sort((a,b)=>a.d-b.d); }
