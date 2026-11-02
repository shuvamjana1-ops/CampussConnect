// Types for the Document_Locker module (12.2, 12.3, 12.4, 12.8 to 12.10).

export interface DocumentsActor {
  readonly tenantId: string;
  readonly userId: string;
}

export interface LockerDocumentView {
  readonly id: string;
  readonly docType: string;
  readonly name: string;
  readonly scanStatus: 'pending' | 'clean';
  readonly createdAt: string;
}

export interface LinkedDocument extends LockerDocumentView {
  readonly linkedAt: string;
}

/** The document is missing, deleted, or belongs to someone else. */
export class DocumentNotFoundError extends Error {
  constructor() {
    super('Document not found.');
    this.name = 'DocumentNotFoundError';
  }
}

/** Maps to 409 DOCUMENT_LINK_LIMIT (12.3). */
export class DocumentLinkLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Document is already linked to ${limit} applications.`);
    this.name = 'DocumentLinkLimitError';
  }
}

/** Only clean documents can be linked; a pending or rejected one cannot. */
export class DocumentNotCleanError extends Error {
  constructor() {
    super('Document has not passed the malware scan.');
    this.name = 'DocumentNotCleanError';
  }
}

/** The application does not belong to the Student, or does not exist. */
export class ApplicationNotFoundError extends Error {
  constructor() {
    super('Application not found.');
    this.name = 'ApplicationNotFoundError';
  }
}
