import React, { useEffect, useState } from 'react';
import { getCachedCutoutUrl, getCutoutDataUrl } from '../utils/cutout';

interface CutoutImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Renders any product or category image with its studio white background removed.
 * Hides raw un-cut frames during the brief processing tick so no white box ever flashes.
 */
export const CutoutImage: React.FC<CutoutImageProps> = ({
  src,
  alt = '',
  className = '',
  style,
  ...rest
}) => {
  const cached = getCachedCutoutUrl(src);
  const [resolvedSrc, setResolvedSrc] = useState<string>(cached || '');

  useEffect(() => {
    let active = true;
    if (!src) {
      setResolvedSrc('');
      return;
    }
    const syncHit = getCachedCutoutUrl(src);
    if (syncHit) {
      setResolvedSrc(syncHit);
      return;
    }
    setResolvedSrc('');
    getCutoutDataUrl(src).then((out) => {
      if (active) setResolvedSrc(out || src);
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (!src) return null;

  return (
    <img
      {...rest}
      src={resolvedSrc || src}
      alt={alt}
      referrerPolicy="no-referrer"
      style={style}
      className={`${className} transition-opacity duration-200 ${
        resolvedSrc ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
};
