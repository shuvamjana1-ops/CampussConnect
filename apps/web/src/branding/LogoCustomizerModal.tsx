import { useState, useId, type ChangeEvent, type FormEvent } from 'react';
import { useInstitutionLogo } from './useInstitutionLogo';
import { PRESET_ICONS, containsEmoji } from './logoStorage';
import { BrandLogo } from './BrandLogo';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function LogoCustomizerModal({ isOpen, onClose }: Props) {
  const { logo, updateLogo, resetLogo, isDefault } = useInstitutionLogo();
  const [tab, setTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [urlInput, setUrlInput] = useState(() => (logo.startsWith('http') || logo.startsWith('/') ? logo : ''));
  const [svgInput, setSvgInput] = useState(() => (logo.startsWith('<svg') ? logo : ''));
  const [selectedPreset, setSelectedPreset] = useState<string>(() => (PRESET_ICONS.some((p) => p.id === logo) ? logo : 'nit-crest'));
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputId = useId();
  const urlInputId = useId();
  const svgInputId = useId();

  if (!isOpen) return null;

  // Compute what would be previewed right now
  let pendingValue = logo;
  if (tab === 'presets') {
    pendingValue = selectedPreset;
  } else if (tab === 'url') {
    pendingValue = urlInput.trim();
  } else if (tab === 'upload') {
    pendingValue = uploadedDataUrl ?? svgInput.trim() ?? logo;
  }

  const hasEmoji = containsEmoji(urlInput) || containsEmoji(svgInput) || (uploadedDataUrl ? containsEmoji(uploadedDataUrl) : false);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file name for emoji
    if (containsEmoji(file.name)) {
      setErrorMessage('The uploaded file name contains emoji characters, which are strictly disallowed.');
      return;
    }

    if (!file.type.startsWith('image/') && !file.name.endsWith('.svg')) {
      setErrorMessage('Invalid file type. Please upload an SVG, PNG, WebP, or JPG icon image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (containsEmoji(result)) {
        setErrorMessage('Emojis detected inside icon data. Emojis are strictly prohibited.');
        return;
      }
      setUploadedDataUrl(result);
      setSuccessMessage(`File "${file.name}" loaded successfully.`);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected file.');
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    setSuccessMessage(null);
    if (containsEmoji(val)) {
      setErrorMessage('⚠️ Emojis are strictly prohibited as logos. Please provide a valid icon image URL.');
    } else {
      setErrorMessage(null);
    }
  };

  const handleSvgChange = (val: string) => {
    setSvgInput(val);
    setSuccessMessage(null);
    if (containsEmoji(val)) {
      setErrorMessage('⚠️ Emojis are strictly prohibited in the SVG icon. Please provide pure vector elements.');
    } else {
      setErrorMessage(null);
    }
  };

  const handleSave = (e?: FormEvent) => {
    e?.preventDefault();
    setErrorMessage(null);

    let valueToSave = '';
    if (tab === 'presets') {
      valueToSave = selectedPreset;
    } else if (tab === 'url') {
      valueToSave = urlInput.trim();
      if (!valueToSave) {
        setErrorMessage('Please enter a valid icon image URL.');
        return;
      }
    } else if (tab === 'upload') {
      if (uploadedDataUrl) {
        valueToSave = uploadedDataUrl;
      } else if (svgInput.trim()) {
        valueToSave = svgInput.trim();
      } else {
        setErrorMessage('Please select an icon file to upload or enter SVG vector markup.');
        return;
      }
    }

    if (containsEmoji(valueToSave)) {
      setErrorMessage('Emojis are strictly disallowed in the logo section.');
      return;
    }

    const res = updateLogo(valueToSave);
    if (!res.ok) {
      setErrorMessage(res.error ?? 'Failed to apply logo.');
      return;
    }

    setSuccessMessage('Custom icon applied successfully!');
    setTimeout(() => {
      onClose();
    }, 450);
  };

  const handleReset = () => {
    resetLogo();
    setUrlInput('');
    setSvgInput('');
    setUploadedDataUrl(null);
    setErrorMessage(null);
    setSuccessMessage('Institution logo reset to default.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logo-customizer-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, #1e40af 0%, #0f172a 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 id="logo-customizer-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
              Institution Logo & Icon Section
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: '#93c5fd' }}>
              Upload or configure your official campus icon. Emojis are strictly disallowed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Strict Emoji Policy Warning */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>🚫</span>
            <div>
              <strong>Strict Logo Policy:</strong> No emojis allowed. Only authentic vector graphics (SVG), high-resolution image files (PNG/WebP), or valid icon resources are accepted.
            </div>
          </div>

          {/* Live Preview Box */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              gap: '1rem',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
                HEADER LOGO PREVIEW
              </div>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #1e40af 0%, #f59e0b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                  margin: '0 auto',
                  overflow: 'hidden',
                  padding: '4px',
                }}
              >
                <BrandLogo size={34} customSrc={pendingValue} alt="Preview logo" />
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>
                PORTAL EMBLEM PREVIEW
              </div>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: 'linear-gradient(145deg, #1e3a8a 0%, #0f766e 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
                  margin: '0 auto',
                  overflow: 'hidden',
                  padding: '6px',
                }}
              >
                <BrandLogo size={42} customSrc={pendingValue} alt="Preview emblem" />
              </div>
            </div>
          </div>

          {/* Tab Selection */}
          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setTab('upload')}
              style={{
                padding: '0.6rem 1rem',
                border: 'none',
                background: 'transparent',
                fontWeight: tab === 'upload' ? 700 : 500,
                color: tab === 'upload' ? '#1e40af' : '#64748b',
                borderBottom: tab === 'upload' ? '2px solid #1e40af' : 'none',
                marginBottom: '-2px',
                cursor: 'pointer',
              }}
            >
              Upload Custom Icon
            </button>
            <button
              type="button"
              onClick={() => setTab('url')}
              style={{
                padding: '0.6rem 1rem',
                border: 'none',
                background: 'transparent',
                fontWeight: tab === 'url' ? 700 : 500,
                color: tab === 'url' ? '#1e40af' : '#64748b',
                borderBottom: tab === 'url' ? '2px solid #1e40af' : 'none',
                marginBottom: '-2px',
                cursor: 'pointer',
              }}
            >
              Icon Image URL
            </button>
            <button
              type="button"
              onClick={() => setTab('presets')}
              style={{
                padding: '0.6rem 1rem',
                border: 'none',
                background: 'transparent',
                fontWeight: tab === 'presets' ? 700 : 500,
                color: tab === 'presets' ? '#1e40af' : '#64748b',
                borderBottom: tab === 'presets' ? '2px solid #1e40af' : 'none',
                marginBottom: '-2px',
                cursor: 'pointer',
              }}
            >
              Institutional Presets
            </button>
          </div>

          {/* Tab 1: Upload */}
          {tab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  htmlFor={fileInputId}
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
                >
                  Upload Institution Icon File (SVG, PNG, WebP)
                </label>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".svg,image/svg+xml,image/png,image/webp,image/jpeg"
                  onChange={handleFileUpload}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                  Recommended: Clean SVG or transparent PNG with a square aspect ratio.
                </span>
              </div>

              <div>
                <label
                  htmlFor={svgInputId}
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
                >
                  Or Paste Raw Vector SVG Code
                </label>
                <textarea
                  id={svgInputId}
                  rows={3}
                  value={svgInput}
                  onChange={(e) => handleSvgChange(e.target.value)}
                  placeholder="<svg viewBox='0 0 64 64'>...</svg>"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          {/* Tab 2: URL */}
          {tab === 'url' && (
            <div>
              <label
                htmlFor={urlInputId}
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
              >
                Custom Icon / Image URL
              </label>
              <input
                id={urlInputId}
                type="text"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="/icon.svg or https://example.edu/logo.svg"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                Default app vector asset: <code>/icon.svg</code>
              </span>
            </div>
          )}

          {/* Tab 3: Presets */}
          {tab === 'presets' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {PRESET_ICONS.map((p) => {
                const isSel = selectedPreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(p.id);
                      setErrorMessage(null);
                    }}
                    style={{
                      border: isSel ? '2px solid #1e40af' : '1px solid #e2e8f0',
                      background: isSel ? '#eff6ff' : '#ffffff',
                      borderRadius: '10px',
                      padding: '0.75rem 0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{ width: '40px', height: '40px' }}
                      dangerouslySetInnerHTML={{ __html: p.svg }}
                    />
                    <span style={{ fontSize: '0.775rem', fontWeight: 600, color: '#0f172a' }}>
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Error / Success Feedback */}
          {errorMessage && (
            <div
              role="alert"
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: '0.85rem',
                border: '1px solid #fecaca',
                fontWeight: 600,
              }}
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                background: '#f0fdf4',
                color: '#166534',
                fontSize: '0.85rem',
                border: '1px solid #bbf7d0',
                fontWeight: 600,
              }}
            >
              ✓ {successMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            disabled={isDefault}
            style={{
              padding: '0.55rem 0.9rem',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: isDefault ? '#94a3b8' : '#475569',
              cursor: isDefault ? 'not-allowed' : 'pointer',
            }}
          >
            Reset to Default
          </button>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 0.9rem',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={hasEmoji}
              style={{
                padding: '0.55rem 1.25rem',
                border: 'none',
                background: hasEmoji ? '#94a3b8' : '#1e40af',
                color: '#ffffff',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: hasEmoji ? 'not-allowed' : 'pointer',
                boxShadow: hasEmoji ? 'none' : '0 2px 4px rgba(30, 64, 175, 0.3)',
              }}
            >
              Apply Icon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
