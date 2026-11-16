#!/bin/bash
cd /tmp/claude-0/ux-1106c
A=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18; Z=19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37
run(){ O=$1; P=$2; B=$3; N="env OUTDIR=$O PREFIX=$P BASE=$B NOINTRO=1 CONSOLELOG=$O/console.jsonl"
 $N timeout 585 node r8-scan.js 412 zh 1.25 light Q1 $A > $O/sc-Q1-a.log 2>&1 &
 $N timeout 585 node r8-scan.js 412 zh 1.25 light Q1 $Z > $O/sc-Q1-b.log 2>&1 &
 $N timeout 585 node r8-scan.js 412 en 1.5 dark Q2 $A > $O/sc-Q2-a.log 2>&1 &
 $N timeout 585 node r8-scan.js 412 en 1.5 dark Q2 $Z > $O/sc-Q2-b.log 2>&1 &
}
run r13s3 c13- http://localhost:4189; run r13s3old c13old- http://localhost:4190; wait; echo ALLDONE $(date) > r13s3/ALLDONE
