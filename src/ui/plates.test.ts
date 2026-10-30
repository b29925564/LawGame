import { existsSync, readFileSync, statSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { RIGS } from './rigs';

/**
 * 背景底圖進 repo 要帶算圖的 manifest（燈組審查 v1：「哪一張背景圖進 repo，就把它的 manifest 一起帶進來，同一張 PR 把這條檢查打開」）。
 * 這裡擋三件事：
 * 1. 底圖算圖用的色溫（card_kelvin）和時刻，跟它那場戲的燈組（rigs.yaml）一樣。
 * 2. 那場戲在劇本裡確實指到同一組燈。
 * 3. 檔案都在，而且出貨的驗收（零黃、黑位落在 --bg）在 manifest 裡記成通過。
 */
type Plate = {
  id: string;
  scene: string;
  rig: string;
  card_kelvin: number;
  date: string;
  files: Record<string, { file: string; bytes: number }>;
  floor_L: Record<string, number>;
  yellow_final_violations: Record<string, number>;
};
type Node = Record<string, unknown>;

const dir = new URL('./plates/', import.meta.url);
const { plates } = JSON.parse(readFileSync(new URL('plates.json', dir), 'utf8')) as {
  plates: Plate[];
};
const episodes: Record<string, Node[]> = Object.fromEntries(
  ['ep1', 'ep2'].map((ep) => [
    ep,
    (
      parse(readFileSync(new URL(`../content/${ep}.yaml`, import.meta.url), 'utf8')) as {
        scenes: Node[];
      }
    ).scenes,
  ]),
);

describe('背景底圖', () => {
  it('至少有一張，id 不重複', () => {
    expect(plates.length).toBeGreaterThan(0);
    expect(new Set(plates.map((p) => p.id)).size).toBe(plates.length);
  });

  for (const p of plates) {
    describe(p.id, () => {
      it('燈組存在，色溫和時刻跟燈組一樣', () => {
        const rig = RIGS[p.rig];
        expect(rig, `rigs.yaml 沒有 ${p.rig}`).toBeTruthy();
        expect(p.card_kelvin).toBe(rig.kelvin);
        expect(p.date.slice(-5)).toBe(rig.time);
      });

      it('那場戲指到同一組燈', () => {
        const [ep, id] = p.scene.split(':');
        const scene = (episodes[ep] ?? []).find((s) => s.id === id);
        expect(scene, `${p.scene} 不在劇本裡`).toBeTruthy();
        // 手機戲（冷開場）的底圖屬於其中一格：那一格的 rig 要一樣。
        const steps = (scene?.steps ?? []) as Node[];
        const rigs = [scene?.rig, ...steps.map((s) => s.rig)];
        expect(rigs).toContain(p.rig);
      });

      it('檔案都在，大小和 manifest 一樣', () => {
        for (const { file, bytes } of Object.values(p.files)) {
          const url = new URL(file, dir);
          expect(existsSync(url), file).toBe(true);
          expect(statSync(url).size).toBe(bytes);
        }
      });

      it('出貨驗收：零黃，最暗 0.5% 落在 --bg（L* 3.9 ± 0.5）', () => {
        for (const v of Object.values(p.yellow_final_violations)) expect(v).toBe(0);
        for (const L of Object.values(p.floor_L))
          expect(Math.abs(L - 3.9)).toBeLessThanOrEqual(0.5);
      });
    });
  }
});
