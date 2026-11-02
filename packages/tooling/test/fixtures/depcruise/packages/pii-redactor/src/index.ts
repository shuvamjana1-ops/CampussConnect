// Allowed: packages/pii-redactor uses its own mint function.
import { mintRedactedText } from './internal/mint';

export const redact = mintRedactedText;
