// Allowed: a pure npm package and a file inside the same domain module.
import { DateTime } from 'luxon';
import { windows } from './windows';

export const workingTime = { DateTime, windows };
