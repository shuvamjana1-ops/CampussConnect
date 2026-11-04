import { X, ExternalLink, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { type ComplaintAttachment } from '../services/complaintStore';

export interface EvidenceLightboxModalProps {
  readonly attachment: ComplaintAttachment | null;
  readonly onClose: () => void;
}

export function EvidenceLightboxModal({ attachment, onClose }: EvidenceLightboxModalProps) {
  if (!attachment) return null;

  const isImage = attachment.type === 'image';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 16, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        material="glass-strong"
        style={{
          maxWidth: '840px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '24px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7)',
          padding: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(20, 20, 32, 0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'rgba(37, 99, 235, 0.18)',
                color: '#60a5fa',
              }}
            >
              {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
            </span>
            <div>
              <h3
                id="lightbox-title"
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: '#f8fafc',
                }}
              >
                {attachment.name}
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {attachment.type.toUpperCase()} Evidence Proof
                {attachment.sizeBytes
                  ? ` · ${(attachment.sizeBytes / 1024).toFixed(1)} KB (Compressed)`
                  : ''}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.785rem',
                fontWeight: 600,
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <ExternalLink size={14} />
              <span>Open Raw</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Preview"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media Preview Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'rgba(10, 14, 24, 0.9)',
            minHeight: '320px',
          }}
        >
          {isImage ? (
            <img
              src={attachment.url}
              alt={attachment.name}
              style={{
                maxWidth: '100%',
                maxHeight: '65vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '40px',
                color: '#cbd5e1',
              }}
            >
              <FileText size={64} style={{ color: '#60a5fa', marginBottom: '16px' }} />
              <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem' }}>
                PDF Document: <strong>{attachment.name}</strong>
              </p>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                <Download size={16} />
                Download / View PDF File
              </a>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
