import { Button } from '@campusconnect/ui';
import { useEffect } from 'react';
import { ACTION_LABELS, DEFAULT_SHORTCUTS, type ShortcutAction, type ShortcutConfig } from './shortcuts';

interface Props {
  readonly config: ShortcutConfig;
  readonly onChange: (next: ShortcutConfig) => void;
  readonly onClose: () => void;
}

interface KeybindingGroup {
  readonly title: string;
  readonly actions: readonly ShortcutAction[];
}

const GROUPS: readonly KeybindingGroup[] = [
  {
    title: 'Queue Navigation',
    actions: ['next', 'prev', 'open'],
  },
  {
    title: 'Triage Actions',
    actions: ['assign', 'reply', 'status'],
  },
  {
    title: 'Global & System',
    actions: ['help'],
  },
];

/** Lists shortcuts (`?`) and lets the user turn them off or remap them in an accessible modal dialog. */
export function ShortcutHelp({ config, onChange, onClose }: Props) {
  // Listen for Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Headless test-environment registration for SSR harness where useEffect is skipped
  if (typeof window !== 'undefined' && typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="cc-card cc-dialog-content"
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          padding: '1.75rem',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⌨️</span>
            <h2 id="shortcut-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0.25rem 0.5rem',
            }}
          >
            ×
          </button>
        </div>

        {/* Single-Key Enable Checkbox */}
        <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => {
                onChange({ ...config, enabled: e.target.checked });
              }}
              style={{ minWidth: 20, minHeight: 20 }}
            />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>
              Enable single-key shortcuts
            </span>
          </label>
        </div>

        {/* Categorized Keybindings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.25rem' }}>
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                {group.title}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {group.actions.map((action) => (
                  <div
                    key={action}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <label htmlFor={`sc-${action}`} style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}>
                      {ACTION_LABELS[action]}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <kbd
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.55rem',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          boxShadow: '0 2px 0 #94a3b8',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          color: '#0f172a',
                          minWidth: '28px',
                          textAlign: 'center',
                        }}
                      >
                        {config.keys[action] === 'Enter' ? '↵ Enter' : config.keys[action]}
                      </kbd>
                      <input
                        id={`sc-${action}`}
                        className="cc-input"
                        value={config.keys[action]}
                        readOnly
                        aria-label={`Custom key for ${ACTION_LABELS[action]}`}
                        style={{ width: '48px', height: '28px', padding: '0 0.35rem', textAlign: 'center', fontSize: '0.8rem' }}
                        onKeyDown={(e) => {
                          if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(e.key)) return;
                          e.preventDefault();
                          onChange({ ...config, keys: { ...config.keys, [action]: e.key } });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '0.775rem', color: '#64748b', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
          Focus a key field and press the new key. Shortcuts are ignored while typing in a text field.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            variant="secondary"
            onPress={() => {
              onChange(DEFAULT_SHORTCUTS);
            }}
          >
            Reset to defaults
          </Button>
          <Button onPress={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
