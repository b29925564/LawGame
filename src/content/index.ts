import { parse } from 'yaml';
import { caseSchema, type CaseData } from '../engine/schema';
import ep1Raw from './ep1.yaml?raw';

export function loadCase(raw: string): CaseData {
  return caseSchema.parse(parse(raw));
}

export const cases = { ep1: loadCase(ep1Raw) };
