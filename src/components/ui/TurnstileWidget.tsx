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

/** Cloudflare Turnstile (Managed) перед отправкой заказа: токен уходит в send-order, сервер проверяет его через siteverify. */
export function TurnstileWidget() {
  const { t, lang } = useI18n();
  const { setCaptcha, submitError } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    setCaptcha(null);
    loadTurnstile()
      .then((api) => {
        if (dead || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          language: WIDGET_LANG[lang],
          callback: (token: string) => {
            setFailed(false);
            setCaptcha(token);
          },
          'expired-callback': () => setCaptcha(null),
          'error-callback': () => {
            setCaptcha(null);
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
      setCaptcha(null);
    };
  }, [lang, setCaptcha]);

  // Токен одноразовый: после любой ошибки отправки просим новый.
  useEffect(() => {
    if (submitError && widget.current) {
      setCaptcha(null);
      window.turnstile?.reset(widget.current);
    }
  }, [submitError, setCaptcha]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div ref={box} />
      {failed && <div className="text-center text-[13px] font-bold text-accent">{t('error.captcha_failed')}</div>}
    </div>
  );
}
