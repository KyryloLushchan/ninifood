'use client';

import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '@/config/turnstile';
import { useI18n, type Lang } from '@/i18n';
import { useApp } from '@/state/app-context';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WIDGET_LANG: Record<Lang, string> = { ua: 'uk-ua', ru: 'ru-ru', en: 'en', vi: 'vi-vn' };

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile script failed'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile (Managed), без привязки к i18n и состоянию заказа (годится и для админки).
 * onToken(null) — токен пропал (истёк/ошибка). Токен одноразовый: смена resetKey просит новый.
 */
export function TurnstileBox({ language, onToken, resetKey = 0, failedText }: { language: string; onToken: (t: string | null) => void; resetKey?: number; failedText: string }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    cb.current(null);
    loadTurnstile()
      .then((api) => {
        if (dead || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          language,
          callback: (token: string) => {
            setFailed(false);
            cb.current(token);
          },
          'expired-callback': () => cb.current(null),
          'error-callback': () => {
            cb.current(null);
            setFailed(true);
          },
        });
      })
      .catch((e) => {
        console.warn('[turnstile]', e);
        setFailed(true);
      });
    return () => {
      dead = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
      cb.current(null);
    };
  }, [language]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      cb.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div ref={box} />
      {failed && <div className="text-center text-[13px] font-bold text-accent">{failedText}</div>}
    </div>
  );
}

export const turnstileLang = (lang: Lang) => WIDGET_LANG[lang];

/** Turnstile перед отправкой заказа: токен уходит в send-order, сервер проверяет его через siteverify. */
export function TurnstileWidget() {
  const { t, lang } = useI18n();
  const { setCaptcha, submitError } = useApp();
  const [resetKey, setResetKey] = useState(0);

  // Токен одноразовый: после любой ошибки отправки просим новый.
  useEffect(() => {
    if (submitError) setResetKey((k) => k + 1);
  }, [submitError]);

  return <TurnstileBox language={WIDGET_LANG[lang]} onToken={setCaptcha} resetKey={resetKey} failedText={t('error.captcha_failed')} />;
}
