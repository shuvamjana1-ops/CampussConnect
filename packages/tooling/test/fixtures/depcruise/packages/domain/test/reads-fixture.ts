// Allowed: rule 5 covers packages/domain/src. Test code may read files.
import { readFileSync } from 'node:fs';

export const read = readFileSync;
