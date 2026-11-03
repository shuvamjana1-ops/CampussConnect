import { useMemo, useState } from 'react';
import { useInstitutionLogo } from './useInstitutionLogo';
import { PRESET_ICONS, DEFAULT_LOGO_VALUE, containsEmoji } from './logoStorage';

interface Props {
  readonly size?: number;
  readonly className?: string;
  readonly alt?: string;
  readonly customSrc?: string;
}

export function BrandLogo({
  size = 32,
  className = '',
  alt = 'JIS University Emblem',
  customSrc,
}: Props) {
  const { logo: contextLogo } = useInstitutionLogo();
  const effectiveLogo = customSrc ?? contextLogo;
  const [imgFailed, setImgFailed] = useState(false);

  // If the string contains an emoji, block it and fall back to default vector
  const isEmojiBlocked = useMemo(() => {
    return containsEmoji(effectiveLogo);
  }, [effectiveLogo]);

  const preset = useMemo(() => {
    if (isEmojiBlocked) return null;
    return PRESET_ICONS.find((p) => p.id === effectiveLogo);
  }, [effectiveLogo, isEmojiBlocked]);

  const isInlineSvg = useMemo(() => {
    if (isEmojiBlocked) return false;
    const trimmed = effectiveLogo.trim();
    return trimmed.startsWith('<svg') && trimmed.endsWith('</svg>');
  }, [effectiveLogo, isEmojiBlocked]);

  if (isEmojiBlocked || imgFailed) {
    // Clean fallback vector crest - never emojis
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label={alt}
      >
        <path d="M32 4L6 16v18c0 16 11 24 26 26 15-2 26-10 26-26V16L32 4z" fill="#1e40af" stroke="#f59e0b" strokeWidth="2.5" />
        <circle cx="32" cy="28" r="8" fill="#f59e0b" />
        <path d="M22 44c3 3 6 4 10 4s7-1 10-4" stroke="#fde047" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (preset) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: preset.svg }}
        aria-label={preset.name}
      />
    );
  }

  if (isInlineSvg) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: effectiveLogo }}
        aria-label={alt}
      />
    );
  }

  // Treat as image/SVG source (e.g. /icon.svg or data:image URL)
  return (
    <img
      src={effectiveLogo || DEFAULT_LOGO_VALUE}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setImgFailed(true)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        display: 'block',
      }}
    />
  );
}

