import { Button } from '@campusconnect/ui';
import { ACTION_LABELS, DEFAULT_SHORTCUTS, type ShortcutAction, type ShortcutConfig } from './shortcuts';

interface Props {
  readonly config: ShortcutConfig;
  readonly onChange: (next: ShortcutConfig) => void;
  readonly onClose: () => void;
}

/** Lists shortcuts (`?`) and lets the user turn them off or remap them. */
export function ShortcutHelp({ config, onChange, onClose }: Props) {
  const actions = Object.keys(ACTION_LABELS) as ShortcutAction[];
  return (
    <section role="dialog" aria-modal="false" aria-labelledby="shortcut-title" className="cc-panel">
      <h2 id="shortcut-title">Keyboard shortcuts</h2>
      <label>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
        />{' '}
        Enable single-key shortcuts
      </label>
      <table>
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Key</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action}>
              <th scope="row">
                <label htmlFor={`sc-${action}`}>{ACTION_LABELS[action]}</label>
              </th>
              <td>
                <input
                  id={`sc-${action}`}
                  className="cc-input"
                  value={config.keys[action]}
                  readOnly
                  onKeyDown={(e) => {
                    if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(e.key)) return;
                    e.preventDefault();
                    onChange({ ...config, keys: { ...config.keys, [action]: e.key } });
                  }}
                  aria-describedby="sc-hint"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p id="sc-hint">Focus a key field and press the new key. Shortcuts are ignored while typing in a text field.</p>
      <Button variant="secondary" onPress={() => onChange(DEFAULT_SHORTCUTS)}>
        Reset to defaults
      </Button>{' '}
      <Button onPress={onClose}>Close</Button>
    </section>
  );
}
