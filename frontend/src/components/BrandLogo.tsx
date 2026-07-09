import type { CSSProperties } from 'react';

interface BrandLogoProps {
  alt?: string;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  padding?: CSSProperties['padding'];
  borderRadius?: CSSProperties['borderRadius'];
  background?: CSSProperties['background'];
  boxShadow?: CSSProperties['boxShadow'];
  invert?: boolean;
  scale?: number;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
}

export default function BrandLogo({
  alt = 'Nexo Gestão Financeira',
  width = 112,
  height = 36,
  padding = '0',
  borderRadius = 12,
  background = 'transparent',
  boxShadow = 'none',
  invert = false,
  scale = 1,
  style,
  imageStyle,
}: BrandLogoProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height,
        padding,
        background,
        borderRadius,
        boxShadow,
        overflow: 'hidden',
        ...style,
      }}
    >
      <img
        src="/logo-text.png"
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          filter: invert ? 'brightness(0) invert(1)' : 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          ...imageStyle,
        }}
      />
    </span>
  );
}
