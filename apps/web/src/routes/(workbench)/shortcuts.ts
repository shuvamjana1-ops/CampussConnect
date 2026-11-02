import { useCallback, useEffect, useRef, useState } from 'react';

export type ShortcutAction = 'next' | 'prev' | 'open' | 'assign' | 'reply' | 'status' | 'help';

export interface ShortcutConfig {
  readonly enabled: boolean;
  readonly keys: Readonly<Record<ShortcutAction, string>>;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  enabled: true,
  keys: { next: 'j', prev: 'k', open: 'Enter', assign: 'a', reply: 'r', status: 's', help: '?' },
};

export const ACTION_LABELS: Readonly<Record<ShortcutAction, string>> = {
  next: 'Next Ticket',
  prev: 'Previous Ticket',
  open: 'Open Ticket',
  assign: 'Assign',
  reply: 'Reply',
  status: 'Change status',
  help: 'Show shortcuts',
};

const STORAGE_KEY = 'cc.workbench.shortcuts';

function load(): ShortcutConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SHORTCUTS;
    const parsed = JSON.parse(raw) as Partial<ShortcutConfig>;
    return {
      enabled: parsed.enabled !== false,
      keys: { ...DEFAULT_SHORTCUTS.keys, ...(parsed.keys ?? {}) },
    };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

/** Persisted shortcut settings: can be turned off or remapped (WCAG 2.1.4). */
export function useShortcutConfig() {
  const [config, setConfigState] = useState<ShortcutConfig>(load);
  const setConfig = useCallback((next: ShortcutConfig) => {
    setConfigState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the setting applies for this session only.
    }
  }, []);
  return [config, setConfig] as const;
}

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.getAttribute('role') === 'textbox';
}

/** Binds single-key shortcuts. They never fire inside text fields or with modifier keys. */
export function useShortcuts(
  config: ShortcutConfig,
  handlers: Partial<Record<ShortcutAction, () => void>>,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(() => {
    if (!config.enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || inTextField(event.target)) return;
      const action = (Object.keys(config.keys) as ShortcutAction[]).find(
        (a) => config.keys[a] === event.key,
      );
      const handler = action === undefined ? undefined : handlersRef.current[action];
      if (handler === undefined) return;
      // Enter on a focused button keeps its native behaviour.
      if (action === 'open' && event.target instanceof HTMLElement && event.target.closest('button,a')) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config]);
}
