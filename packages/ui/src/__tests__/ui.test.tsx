import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import {
  Button,
  Badge,
  StatusLabel,
  AiSuggestedBadge,
  TextField,
  contrastRatio,
  MIN_TEXT_CONTRAST,
  textPairs,
  colors,
  statusStyles,
  type TicketStatus,
} from '../index';

describe('@campusconnect/ui components', () => {
  describe('Button', () => {
    it('renders primary variant by default', () => {
      const html = renderToString(React.createElement(Button, { children: 'Click Me' }));
      expect(html).toContain('cc-button');
      expect(html).toContain('data-variant="primary"');
      expect(html).toContain('Click Me');
    });

    it('renders secondary and danger variants', () => {
      const sec = renderToString(React.createElement(Button, { variant: 'secondary', children: 'Secondary' }));
      expect(sec).toContain('data-variant="secondary"');

      const dng = renderToString(React.createElement(Button, { variant: 'danger', children: 'Danger' }));
      expect(dng).toContain('data-variant="danger"');
    });
  });

  describe('Badge', () => {
    it('renders badge tone and text', () => {
      const html = renderToString(React.createElement(Badge, { tone: 'info', children: 'Informational' }));
      expect(html).toContain('cc-badge');
      expect(html).toContain('data-tone="info"');
      expect(html).toContain('Informational');
    });

    it('renders decorative icon with aria-hidden', () => {
      const html = renderToString(React.createElement(Badge, { tone: 'success', icon: '✓', children: 'Verified' }));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('✓');
      expect(html).toContain('Verified');
    });
  });

  describe('StatusLabel', () => {
    it('renders all ticket status kinds with expected labels and icons', () => {
      const statuses: TicketStatus[] = [
        'new',
        'assigned',
        'inProgress',
        'awaitingStudent',
        'resolvedPending',
        'closed',
        'reopened',
      ];

      for (const st of statuses) {
        const html = renderToString(React.createElement(StatusLabel, { status: st }));
        const style = statusStyles[st];
        expect(html).toContain(`data-tone="${style.tone}"`);
        expect(html).toContain(style.defaultLabel);
      }
    });

    it('accepts localized label override', () => {
      const html = renderToString(
        React.createElement(StatusLabel, { status: 'inProgress', label: 'प्रगति में' })
      );
      expect(html).toContain('प्रगति में');
    });
  });

  describe('AiSuggestedBadge', () => {
    it('renders with ai tone and sparkles icon', () => {
      const html = renderToString(React.createElement(AiSuggestedBadge, null));
      expect(html).toContain('data-tone="ai"');
      expect(html).toContain('AI-suggested');
      expect(html).toContain('✨');
    });

    it('accepts localized label', () => {
      const html = renderToString(React.createElement(AiSuggestedBadge, { label: 'AI द्वारा सुझाया गया' }));
      expect(html).toContain('AI द्वारा सुझाया गया');
    });
  });

  describe('TextField', () => {
    it('renders label and input with cc-input class', () => {
      const html = renderToString(
        React.createElement(TextField, { label: 'Subject', name: 'subject' })
      );
      expect(html).toContain('Subject');
      expect(html).toContain('cc-input');
    });

    it('renders description and error message when provided', () => {
      const html = renderToString(
        React.createElement(TextField, {
          label: 'Email',
          description: 'University email address',
          errorMessage: 'Invalid email address',
        })
      );
      expect(html).toContain('University email address');
      expect(html).toContain('Invalid email address');
      expect(html).toContain('cc-field-error');
    });
  });

  describe('WCAG AA Contrast & Tokens', () => {
    it('verifies all textPairs meet WCAG AA contrast threshold', () => {
      for (const [fg, bg] of textPairs) {
        const ratio = contrastRatio(fg, bg);
        expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    });

    it('verifies contrastRatio calculates correctly', () => {
      expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1.0, 2);
      expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(15);
    });
  });
});
