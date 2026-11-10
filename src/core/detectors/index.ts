import { geneDate } from './geneDate';
import { geneNumber } from './geneNumber';
import { leadingZeros } from './leadingZeros';
import { longId } from './longId';
import { mixedDates } from './mixedDates';
import { mojibake } from './mojibake';
import { numberText } from './numberText';
import type { Detector } from './common';

export const DETECTORS: Detector[] = [geneDate, geneNumber, longId, leadingZeros, mixedDates, mojibake, numberText];
export { fixMojibake } from './mojibake';
