'use client';

import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useI18n, type TKey } from '@/i18n';
import { createDraft, draftLink } from '@/lib/order-draft';
import { useApp } from '@/state/app-context';
import { TurnstileBox, turnstileLang } from './TurnstileWidget';

/** Только настоящий десктоп: мышь и широкое окно. На телефоне и планшете кнопки нет. */
function useDesktop() {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine) and (min-width: 769px)');
    const on = () => setYes(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return yes;
}

/** QR как inline-SVG: генерируется на клиенте, без сетевых запросов. */
function qrSvg(text: string) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 1, margin: 2, scalable: true });
}

type Status = 'idle' | 'creating' | 'done' | 'error';

function PhoneModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const { orderType, days, portions, payment, contact, place } = useApp();
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [errKey, setErrKey] = useState<TKey>('error.generic');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token || status !== 'idle') return;
    setStatus('creating');
    void createDraft(
      {
        type: orderType,
        days,
        portions,
        payment,
        lang,
        telegram: contact.telegram,
        phone: `+84${contact.phone}`,
        address: contact.address,
        hotel: contact.hotel,
        comment: contact.comment,
        place_id: place?.placeId ?? null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
      },
      token,
    ).then((r) => {
      if ('id' in r) {
        setLink(draftLink(r.id));
        setStatus('done');
      } else {
        const k = `error.${r.code}` as TKey;
        setErrKey(['error.network', 'error.captcha_failed', 'error.rate_limited'].includes(k) ? k : 'error.generic');
        setStatus('error');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-xl2 bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-[17px] font-extrabold">{t('phone.title')}</div>
        {status === 'done' ? (
          <>
            <div aria-hidden className="text-2xl leading-none">📷</div>
            {/* eslint-disable-next-line react/no-danger */}
            <div className="w-full max-w-[240px]" dangerouslySetInnerHTML={{ __html: qrSvg(link) }} />
            <div className="text-center text-[15px] font-extrabold leading-snug text-ink">{t('phone.scan')}</div>
            <button type="button" onClick={() => void copy()} className="text-sm font-bold text-accent hover:underline">
              {copied ? t('phone.copied') : t('phone.copy')}
            </button>
          </>
        ) : (
          <>
            {status !== 'error' && <div className="text-sm text-ink-muted">{t('phone.preparing')}</div>}
            {status === 'error' && (
              <>
                <div className="text-center text-[13px] font-bold text-accent">{t(errKey)}</div>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('idle');
                    setToken(null);
                    setResetKey((k) => k + 1);
                  }}
                  className="text-sm font-bold text-accent hover:underline"
                >
                  {t('phone.retry')}
                </button>
              </>
            )}
            <TurnstileBox language={turnstileLang(lang)} onToken={setToken} resetKey={resetKey} failedText={t('error.captcha_failed')} />
          </>
        )}
        <button type="button" onClick={onClose} className="text-sm text-ink-muted hover:underline">
          {t('phone.close')}
        </button>
      </div>
    </div>
  );
}

/** «Продолжить на телефоне»: черновик заказа на сервере → QR со ссылкой. Только на десктопе. */
export function ContinueOnPhone() {
  const { t } = useI18n();
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  if (!desktop) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-[48px] w-full items-center justify-center rounded-md2 border-2 border-line text-[15px] font-extrabold text-ink-2 hover:bg-sand/60">
        📱 {t('phone.continue')}
      </button>
      {open && <PhoneModal onClose={() => setOpen(false)} />}
    </>
  );
}
