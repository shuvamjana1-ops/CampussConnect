// @campusconnect/server/files: attachment upload URLs, malware-scan consumer and promotion to the clean store.

export { uploadDecision, ALLOWED_TYPES, type ExistingUpload, type UploadCandidate, type UploadDecision, type UploadTarget } from './upload-decision';
export { detectMime, SNIFF_BYTES } from './magic-bytes';
export { FilesService } from './files.service';
export { ScanResultConsumer, FILES_QUEUE, type ScanResult, type ScanStatus } from './scan-result-consumer';
export { filesRoutes, toFilesProblem, type FilesRoute, type FilesRouteRequest, type FilesErrorMapping } from './files.routes';
export * from './files.types';
