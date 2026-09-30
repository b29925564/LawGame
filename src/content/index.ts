import { parse } from 'yaml';
import { caseSchema, type CaseData } from '../engine/schema';
import protoRaw from './proto.yaml?raw';

export function loadCase(raw: string): CaseData {
  return caseSchema.parse(parse(raw));
}

export const cases = { proto: loadCase(protoRaw) };
