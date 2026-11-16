#!/bin/bash
# 第 12 輪片頭預載：一條 lane 依序跑 job。用法：r12p-run.sh <lane名> <base> <prefix> <tagx> job...
cd /tmp/claude-0/ux-1106c
LANE=$1; B=$2; P=$3; X=$4; shift 4
for j in "$@"; do
  BASE=$B PREFIX=$P TAGX=$X timeout 560 node r13-pre.js "$j" >> r13p/lane-$LANE.log 2>&1
done
echo LANEDONE >> r13p/lane-$LANE.log
