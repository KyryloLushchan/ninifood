import type { ReactNode } from 'react';
import { withBasePath } from '@/lib/base-path';

interface Props {
  src: string | null;
  alt?: string;
  className?: string;
  /** Подпись на заглушке (когда фото ещё нет). */
  caption?: ReactNode;
  captionClassName?: string;
  /** Не ленивая загрузка (фото на первом экране). */
  eager?: boolean;
  sizes?: string;
}

/** `/photos/x-800.webp` → srcset с `/photos/x-400.webp`; прочие пути — как есть. */
function srcSet(src: string): string | undefined {
  if (!/-800\.webp$/.test(src)) return undefined;
  return `${withBasePath(src.replace(/-800\.webp$/, '-400.webp'))} 400w, ${withBasePath(src)} 800w`;
}

export function Photo({ src, alt = '', className = '', caption, captionClassName = '', eager, sizes = '(min-width: 480px) 240px, 50vw' }: Props) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={withBasePath(src)}
        srcSet={srcSet(src)}
        sizes={sizes}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`flex items-end bg-stripes ${className}`} role="img" aria-label={alt}>
      {caption && <span className={`font-mono text-ink-muted ${captionClassName}`}>{caption}</span>}
    </div>
  );
}
