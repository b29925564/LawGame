import { parse } from 'yaml';
import { episodeSchema, type Episode } from '../engine/episode/schema';
import { caseSchema, type CaseData } from '../engine/schema';
import ep1Raw from './ep1.yaml?raw';
import protoRaw from './proto.yaml?raw';

export function loadCase(raw: string): CaseData {
  return caseSchema.parse(parse(raw));
}

export function loadEpisode(raw: string): Episode {
  return episodeSchema.parse(parse(raw));
}

/** 原型（企劃書第 15 節）的單場劇本，垂直切片的庭審完成前保留在標題畫面。 */
export const cases = { proto: loadCase(protoRaw) };

export const episodes = { ep1: loadEpisode(ep1Raw) };
