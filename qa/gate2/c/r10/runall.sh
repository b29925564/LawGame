#!/bin/bash
# 用法：runall.sh <outdir> <prefix> <base>
cd /tmp/claude-0/ux-1106c
O=$1; P=$2; B=$3
N="env OUTDIR=$O PREFIX=$P BASE=$B NOINTRO=1 CONSOLELOG=$O/console.jsonl"
sc(){ $N timeout 585 node r8-scan.js $1 $2 $3 $4 $5 $6 > $O/sc-$5-$7.log 2>&1; }
tb(){ $N timeout 585 node r8-topbar.js $1 $2 $3 > $O/tb-$1-$3.log 2>&1; }
G1=desk1,desk1b,desk2,desk2b; G2=court,closing,depo,nego; G3=voir,depo2,medi2,voir2
A=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18; Z=19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37
C1=ep1-cold,ep1-2233-insert,ep1-2314-busstop,ep1-cold-to-titlecard,ep1-place-s3,ep1-act2,ep1-act3,ep1-place-depo,ep1-place-theory,ep1-act4,ep1-day2,ep1-day3,ep1-verdict
C2=ep1-end-to-ep2,ep2-cold-to-titlecard,ep2-place-corridor,ep2-act2,ep2-act3,ep2-act4,ep2-act5,ep2-place-depo,ep2-end,ep2-epi-phone-end,ep2-verdict
sc 320 zh 1.25 light N1 $A a & sc 320 zh 1.25 light N1 $Z b & sc 320 zh 1.5 dark N2 $A a & sc 320 zh 1.5 dark N2 $Z b & sc 320 en 1.25 dark N3 $A a & sc 320 en 1.25 dark N3 $Z b & wait
sc 320 en 1.5 light N4 $A a & sc 320 en 1.5 light N4 $Z b & sc 360 zh 1.25 dark N5 $A a & sc 360 zh 1.25 dark N5 $Z b & sc 360 zh 1.5 light N6 $A a & sc 360 zh 1.5 light N6 $Z b & wait
sc 360 en 1.25 light N7 $A a & sc 360 en 1.25 light N7 $Z b & sc 360 en 1.5 dark N8 $A a & sc 360 en 1.5 dark N8 $Z b & $N timeout 585 node r8-tour.js N1,N2 > $O/tour-N1N2.log 2>&1 & $N timeout 585 node r8-tour.js N3,N4 > $O/tour-N3N4.log 2>&1 & wait
$N timeout 585 node r8-tour.js N5,N6 > $O/tour-N5N6.log 2>&1 & $N timeout 585 node r8-tour.js N7,N8 > $O/tour-N7N8.log 2>&1 & $N timeout 585 node r8-tour.js W1,W4 > $O/tour-W1W4.log 2>&1 & $N timeout 585 node r8-tour.js W6,W7 > $O/tour-W6W7.log 2>&1 & $N LANGX=zh timeout 585 node r10-camera.js p7,320,1530 light ep2-epi-card-phone epizh > $O/cam-epi-zh.log 2>&1 & $N LANGX=en timeout 585 node r10-camera.js p7,320,1530 light ep2-epi-card-phone epien > $O/cam-epi-en.log 2>&1 & wait
$N LANGX=zh timeout 585 node r10-camera.js p7 light $C1 c1 > $O/cam-p7-c1.log 2>&1 & $N LANGX=zh timeout 585 node r10-camera.js p7 light $C2 c2 > $O/cam-p7-c2.log 2>&1 & $N LANGX=en timeout 585 node r10-camera.js 1530 light $C1 c1 > $O/cam-1530-c1.log 2>&1 & $N LANGX=en timeout 585 node r10-camera.js 1530 light $C2 c2 > $O/cam-1530-c2.log 2>&1 & $N timeout 585 node r7-iv.js new > $O/iv-new.log 2>&1 & $N timeout 585 node r2-esc.js > $O/esc.log 2>&1 & wait
tb 320 $G1 g1 & tb 320 $G2 g2 & tb 320 $G3 g3 & tb 360 $G1 g1 & tb 360 $G2 g2 & tb 360 $G3 g3 & wait
tb 390 $G1 g1 & tb 390 $G2 g2 & tb 390 $G3 g3 & tb p7 $G1 g1 & tb p7 $G2 g2 & tb p7 $G3 g3 & wait
$N timeout 585 node r3-cine.js 320 zh,en > $O/cine-320.log 2>&1 & $N timeout 585 node r3-cine.js 360 zh,en > $O/cine-360.log 2>&1 & wait
echo ALLDONE $(date)
