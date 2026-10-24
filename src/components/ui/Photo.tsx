import type { ReactNode } from 'react';
import { withBasePath } from '@/lib/base-path';

interface Props {
  src: string | null;
  alt?: string;
  className?: string;
  /** Подпись на заглушке (когда фото ещё нет). */
  caption?: ReactNode;
  captionClassName?: string;
}

export function Photo({ src, alt = '', className = '', caption, captionClassName = '' }: Props) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={withBasePath(src)} alt={alt} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-end bg-stripes ${className}`} role="img" aria-label={alt}>
      {caption && <span className={`font-mono text-ink-muted ${captionClassName}`}>{caption}</span>}
    </div>
  );
}
