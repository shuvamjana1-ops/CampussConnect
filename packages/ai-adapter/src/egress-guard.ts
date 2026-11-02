import { isRedactedText } from '@campusconnect/pii-redactor';
import { UnverifiedTextError } from './errors';

/**
 * Egress guard: verifies that text sent to AI providers is RedactedText produced by this process.
 *
 * This is a runtime safety check that runs before every API call to ensure no unredacted PII
 * escapes the system, even if a calling module accidentally passes unredacted text.
 *
 * The check uses isRedactedText(), which validates that the text was produced by the redactor's mint function.
 */
export class EgressGuard {
  /**
   * Verify that a string is RedactedText before sending it to an AI provider.
   * @throws UnverifiedTextError if the text is not verified RedactedText
   */
  static verifyRedactedText(text: string, context: string): void {
    if (!isRedactedText(text)) {
      throw new UnverifiedTextError(`Unverified text in ${context}; text must be RedactedText from the PII_Redactor`);
    }
  }

  /**
   * Verify all strings in a request are RedactedText.
   */
  static verifyRequest(texts: ReadonlyArray<string>, context: string): void {
    for (let i = 0; i < texts.length; i += 1) {
      if (!isRedactedText(texts[i])) {
        throw new UnverifiedTextError(
          `Unverified text at index ${i} in ${context}; all text must be RedactedText from the PII_Redactor`,
        );
      }
    }
  }
}
