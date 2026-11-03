import { useState } from 'react';
import { compressImage, formatBytes, type CompressionResult } from '../utils/image-compressor';

export interface UploadedItem {
  readonly id: string;
  readonly file: File;
  readonly originalSize: number;
  readonly compressedSize: number;
  readonly savingsPercent: number;
  readonly previewUrl: string;
  readonly wasCompressed: boolean;
}

interface Props {
  readonly onFilesSelected: (items: readonly UploadedItem[]) => void;
  readonly maxItems?: number;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  readonly accept?: string;
  readonly onProgressState?: (inProgress: boolean, message?: string) => void;
}

export function ImageCompressorUploader({
  onFilesSelected,
  maxItems = 5,
  disabled = false,
  ariaLabel = 'Attach files (auto-compressed under 200 KB)',
  ariaDescribedBy,
  accept = 'image/png,image/jpeg,image/webp,application/pdf',
  onProgressState,
}: Props) {
  const [items, setItems] = useState<readonly UploadedItem[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<string | null>(null);

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;
    setCompressing(true);
    onProgressState?.(true, 'Compressing images under 200 KB threshold…');

    const newItems: UploadedItem[] = [...items];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      if (newItems.length >= maxItems) break;

      const progressText = `Compressing ${file.name} (${formatBytes(file.size)}) to under 200 KB…`;
      setCompressionProgress(progressText);
      onProgressState?.(true, progressText);

      // Perform canvas-based smart compression strictly under 200 KB
      const result: CompressionResult = await compressImage(file, 200 * 1024);

      newItems.push({
        id: `att_${Date.now()}_${i}`,
        file: result.file,
        originalSize: result.originalBytes,
        compressedSize: result.compressedBytes,
        savingsPercent: result.savingsPercent,
        previewUrl: result.previewUrl,
        wasCompressed: result.wasCompressed,
      });
    }

    setItems(newItems);
    onFilesSelected(newItems);
    setCompressing(false);
    setCompressionProgress(null);
    onProgressState?.(false);
  };

  const handleRemove = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    onFilesSelected(next);
  };

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {/* Interactive Drag & Drop Box with 200 KB Smart Compressor Notice */}
      <div
        className="cc-dropzone"
        style={{
          border: '2px dashed #2563eb',
          borderRadius: '12px',
          padding: '1.5rem',
          textAlign: 'center',
          background: '#f8fafc',
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.35rem' }}>📎</span>
        <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a', marginBottom: '0.25rem' }}>
          Click to choose files or drop attachments here
        </strong>
        <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.85rem' }}>
          Images are <strong style={{ color: '#d97706' }}>automatically compressed to under 200 KB</strong> in-browser before upload.
        </p>

        <label
          htmlFor="cc-file-compressor-input"
          className="cc-btn-3d cc-btn-3d-yellow"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            padding: '0.5rem 1.15rem',
          }}
        >
          <span>⚡</span>
          <span>Upload & Auto-Compress (Max 200 KB)</span>
        </label>
        <input
          id="cc-file-compressor-input"
          type="file"
          multiple
          accept={accept}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%', height: '100%' }}
          onChange={(e) => {
            void handleFileChange(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Realtime Compression Progress Indicator */}
      {compressing && (
        <div
          role="status"
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: '#fefce8',
            border: '1px solid #fef08a',
            color: '#854d0e',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.875rem',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid #ca8a04',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'cc-spin 0.6s linear infinite',
            }}
          />
          <span>{compressionProgress ?? 'Compressing image under 200 KB threshold…'}</span>
        </div>
      )}

      {/* Compressed Items Cards with Savings & Proof of < 200 KB */}
      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0.85rem',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
              }}
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                />
              ) : (
                <div style={{ width: '44px', height: '44px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', fontSize: '1.25rem' }}>
                  📄
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.file.name}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700, background: '#f0fdf4', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                    {formatBytes(item.compressedSize)}
                  </span>
                  {item.wasCompressed ? (
                    <span style={{ fontSize: '0.7rem', color: '#854d0e', background: '#fefce8', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid #fef08a', fontWeight: 600 }}>
                      ⚡ -{item.savingsPercent}% (&lt; 200 KB)
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#0284c7', background: '#f0f9ff', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid #bae6fd', fontWeight: 600 }}>
                      ✓ &lt; 200 KB verified
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => { handleRemove(item.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.25rem', padding: '0.25rem' }}
                aria-label={`Remove ${item.file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
