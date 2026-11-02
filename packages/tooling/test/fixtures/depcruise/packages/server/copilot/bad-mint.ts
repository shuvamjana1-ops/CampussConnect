import { mintRedactedText } from '../../pii-redactor/src/internal/mint';

export const forged = mintRedactedText('not redacted');
