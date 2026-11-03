import { useState, useId, type ChangeEvent, type FormEvent } from 'react';
import { useInstitutionLogo } from './useInstitutionLogo';
import { PRESET_ICONS, containsEmoji } from './logoStorage';
import { BrandLogo } from './BrandLogo';

export function InstitutionLogoSection() {
  const { logo, updateLogo, resetLogo, isDefault } = useInstitutionLogo();
  const [mode, setMode] = useState<'upload' | 'url' | 'presets'>('upload');
  const [urlInput, setUrlInput] = useState(() => (logo.startsWith('http') || logo.startsWith('/') ? logo : ''));
  const [svgInput, setSvgInput] = useState(() => (logo.startsWith('<svg') ? logo : ''));
  const [selectedPreset, setSelectedPreset] = useState<string>(() => (PRESET_ICONS.some((p) => p.id === logo) ? logo : 'nit-crest'));
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileInputId = useId();
  const urlInputId = useId();
  const svgInputId = useId();

  // Determine current pending preview
  let pendingValue = logo;
  if (mode === 'presets') {
    pendingValue = selectedPreset;
  } else if (mode === 'url') {
    pendingValue = urlInput.trim();
  } else if (mode === 'upload') {
    pendingValue = uploadedDataUrl ?? svgInput.trim() ?? logo;
  }

  const hasEmoji =
    containsEmoji(urlInput) ||
    containsEmoji(svgInput) ||
    (uploadedDataUrl ? containsEmoji(uploadedDataUrl) : false);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (containsEmoji(file.name)) {
      setErrorMessage('The uploaded file name contains emoji characters, which are strictly prohibited.');
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
        setErrorMessage('Emojis detected inside icon data. Emojis are strictly disallowed.');
        return;
      }
      setUploadedDataUrl(result);
      setStatusMessage(`File "${file.name}" loaded successfully.`);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the uploaded icon file.');
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    setStatusMessage(null);
    if (containsEmoji(val)) {
      setErrorMessage('⚠️ Emojis are strictly prohibited as logos. Please provide an icon URL or image.');
    } else {
      setErrorMessage(null);
    }
  };

  const handleSvgChange = (val: string) => {
    setSvgInput(val);
    setStatusMessage(null);
    if (containsEmoji(val)) {
      setErrorMessage('⚠️ Emojis are strictly prohibited in the SVG icon. Please provide pure vector elements.');
    } else {
      setErrorMessage(null);
    }
  };

  const handleApply = (e?: FormEvent) => {
    e?.preventDefault();
    setErrorMessage(null);

    let targetValue = '';
    if (mode === 'presets') {
      targetValue = selectedPreset;
    } else if (mode === 'url') {
      targetValue = urlInput.trim();
      if (!targetValue) {
        setErrorMessage('Please enter an icon image URL or path.');
        return;
      }
    } else if (mode === 'upload') {
      if (uploadedDataUrl) {
        targetValue = uploadedDataUrl;
      } else if (svgInput.trim()) {
        targetValue = svgInput.trim();
      } else {
        setErrorMessage('Please select an icon file to upload or enter vector SVG markup.');
        return;
      }
    }

    if (containsEmoji(targetValue)) {
      setErrorMessage('Emojis are strictly disallowed in the logo section.');
      return;
    }

    const res = updateLogo(targetValue);
    if (!res.ok) {
      setErrorMessage(res.error ?? 'Failed to apply custom logo.');
      return;
    }

    setStatusMessage('Custom institution icon saved and applied across CampusConnect!');
  };

  const handleReset = () => {
    resetLogo();
    setUrlInput('');
    setSvgInput('');
    setUploadedDataUrl(null);
    setErrorMessage(null);
    setStatusMessage('Institution logo reset to default.');
  };

  return (
    <section
      aria-labelledby="logo-section-heading"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '1.5rem',
        marginTop: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 id="logo-section-heading" style={{ margin: '0 0 0.35rem', fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>
          Institution Logo & Identity (Custom Icons)
        </h3>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>
          Configure your campus icon. Strict validation enforced: <strong>No emojis allowed</strong>.
        </p>
      </div>

      {/* Strict Anti-Emoji Notice */}
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
          marginBottom: '1.25rem',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>🚫</span>
        <div>
          <strong>Emoji Restriction:</strong> Emojis cannot be used as official campus logos. Please supply custom icon files (SVG, PNG, WebP) or vector paths.
        </div>
      </div>

      {/* Live Previews */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1.5rem',
          alignItems: 'center',
          background: '#f8fafc',
          padding: '1.25rem',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1e40af 0%, #f59e0b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3px',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
            }}
          >
            <BrandLogo size={32} customSrc={pendingValue} alt="Header logo preview" />
          </div>
          <div>
            <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0f172a' }}>Header Lockup Logo</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Rendered in primary shell navigation</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: 'linear-gradient(145deg, #1e3a8a 0%, #0f766e 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
            }}
          >
            <BrandLogo size={38} customSrc={pendingValue} alt="Portal emblem preview" />
          </div>
          <div>
            <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0f172a' }}>Portal 3D Emblem</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Rendered in student dashboard & sign-in</div>
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => setMode('upload')}
          style={{
            padding: '0.6rem 1rem',
            border: 'none',
            background: 'transparent',
            fontWeight: mode === 'upload' ? 700 : 500,
            color: mode === 'upload' ? '#1e40af' : '#64748b',
            borderBottom: mode === 'upload' ? '2px solid #1e40af' : 'none',
            marginBottom: '-2px',
            cursor: 'pointer',
          }}
        >
          Upload Custom Icon
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          style={{
            padding: '0.6rem 1rem',
            border: 'none',
            background: 'transparent',
            fontWeight: mode === 'url' ? 700 : 500,
            color: mode === 'url' ? '#1e40af' : '#64748b',
            borderBottom: mode === 'url' ? '2px solid #1e40af' : 'none',
            marginBottom: '-2px',
            cursor: 'pointer',
          }}
        >
          Icon Image URL
        </button>
        <button
          type="button"
          onClick={() => setMode('presets')}
          style={{
            padding: '0.6rem 1rem',
            border: 'none',
            background: 'transparent',
            fontWeight: mode === 'presets' ? 700 : 500,
            color: mode === 'presets' ? '#1e40af' : '#64748b',
            borderBottom: mode === 'presets' ? '2px solid #1e40af' : 'none',
            marginBottom: '-2px',
            cursor: 'pointer',
          }}
        >
          Official Presets
        </button>
      </div>

      {/* Mode Controls */}
      {mode === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
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
          </div>

          <div>
            <label
              htmlFor={svgInputId}
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
            >
              Or Paste Vector SVG Markup
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

      {mode === 'url' && (
        <div style={{ marginBottom: '1.25rem' }}>
          <label
            htmlFor={urlInputId}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
          >
            Icon Resource URL
          </label>
          <input
            id={urlInputId}
            type="text"
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="/icon.svg or https://institution.edu/logo.png"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {mode === 'presets' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
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
                  padding: '0.85rem 0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ width: '44px', height: '44px' }} dangerouslySetInnerHTML={{ __html: p.svg }} />
                <span style={{ fontSize: '0.775rem', fontWeight: 600, color: '#0f172a' }}>{p.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Messages */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: '0.85rem',
            border: '1px solid #fecaca',
            fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            background: '#f0fdf4',
            color: '#166534',
            fontSize: '0.85rem',
            border: '1px solid #bbf7d0',
            fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          ✓ {statusMessage}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          type="button"
          onClick={handleReset}
          disabled={isDefault}
          style={{
            padding: '0.55rem 0.95rem',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: isDefault ? '#94a3b8' : '#475569',
            cursor: isDefault ? 'not-allowed' : 'pointer',
          }}
        >
          Reset to Default Icon
        </button>

        <button
          type="button"
          onClick={() => handleApply()}
          disabled={hasEmoji}
          style={{
            padding: '0.55rem 1.35rem',
            border: 'none',
            background: hasEmoji ? '#94a3b8' : '#1e40af',
            color: '#ffffff',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: hasEmoji ? 'not-allowed' : 'pointer',
            boxShadow: hasEmoji ? 'none' : '0 2px 4px rgba(30, 64, 175, 0.3)',
          }}
        >
          Save & Apply Custom Icon
        </button>
      </div>
    </section>
  );
}

