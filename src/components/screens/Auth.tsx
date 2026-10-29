'use client';

import { useState } from 'react';
import { useI18n, type TKey } from '@/i18n';
import { callGate } from '@/lib/auth-gate';
import { useApp } from '@/state/app-context';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TurnstileBox, turnstileLang } from '../ui/TurnstileWidget';
import { Narrow } from '../ui/Layout';

type Mode = 'login' | 'register' | 'forgot';
const PASSWORD_MIN = 8;
const KNOWN = ['invalid_credentials', 'email_invalid', 'email_exists', 'weak_password', 'locked', 'captcha_failed', 'rate_limited', 'reset_rate_limited', 'reset_unavailable', 'mail_failed', 'code_invalid', 'network'];

/** Вход / регистрация / восстановление пароля (email + пароль; код сброса приходит на почту). Вход необязателен. */
export function Auth() {
  const { t, lang } = useI18n();
  const { closeAuth, acceptSession } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword('');
    setPassword2('');
    setCode('');
    setCodeSent(false);
  };

  const fail = (c: string) => setError(`auth.err.${KNOWN.includes(c) ? c : 'generic'}`);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const mail = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return fail('email_invalid');
    if (!captcha) return fail('captcha_failed');
    const needsNew = mode === 'register' || (mode === 'forgot' && codeSent);
    if (needsNew && password.length < PASSWORD_MIN) return fail('weak_password');
    if (mode === 'register' && password !== password2) return setError('auth.err.password_mismatch');

    setBusy(true);
    const r =
      mode === 'login'
        ? await callGate({ action: 'signin', email: mail, password, captcha })
        : mode === 'register'
          ? await callGate({ action: 'signup', email: mail, password, captcha })
          : codeSent
            ? await callGate({ action: 'reset_confirm', email: mail, token: code.replace(/\D/g, ''), password, captcha })
            : await callGate({ action: 'reset_request', email: mail, captcha });
    setResetKey((k) => k + 1); // токен Turnstile одноразовый
    if (!r.ok) {
      setBusy(false);
      return fail(r.code);
    }
    if (mode === 'forgot' && !codeSent) {
      setBusy(false);
      return setCodeSent(true);
    }
    try {
      if (!r.session) throw new Error('no session');
      await acceptSession(r.session);
    } catch {
      setError('auth.err.generic');
      setBusy(false);
    }
  };

  const title = mode === 'login' ? t('auth.login') : mode === 'register' ? t('auth.register') : t('auth.forgotTitle');
  const submitLabel = busy
    ? t('auth.wait')
    : mode === 'login'
      ? t('auth.login')
      : mode === 'register'
        ? t('auth.submitRegister')
        : codeSent
          ? t('auth.savePassword')
          : t('auth.sendCode');

  return (
    <Narrow max={440}>
      <ScreenHeader title={title} onBack={closeAuth} />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-5 pb-8" noValidate>
        {mode === 'forgot' && <p className="text-sm leading-snug text-ink-2">{codeSent ? t('auth.codeSent', { email: email.trim() }) : t('auth.forgotHint')}</p>}
        <Field
          name="email"
          label={t('auth.email')}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={codeSent}
        />
        {mode === 'forgot' && codeSent && (
          <Field
            name="code"
            label={t('auth.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        )}
        {(mode !== 'forgot' || codeSent) && (
          <Field
            name="password"
            label={mode === 'forgot' ? t('auth.newPassword') : t('auth.password')}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode !== 'login' ? t('auth.passwordHint', { n: PASSWORD_MIN }) : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {mode === 'register' && (
          <Field name="password2" label={t('auth.password2')} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        )}

        <TurnstileBox language={turnstileLang(lang)} onToken={setCaptcha} resetKey={resetKey} failedText={t('error.captcha_failed')} />
        {error && <div className="text-center text-[13px] font-bold text-accent">{t(error as TKey)}</div>}

        <Button type="submit" disabled={busy || !captcha}>
          {submitLabel}
        </Button>

        <div className="flex flex-col items-center gap-2 text-sm">
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => switchMode('forgot')} className="font-bold text-accent hover:underline">
                {t('auth.forgot')}
              </button>
              <button type="button" onClick={() => switchMode('register')} className="font-bold text-accent hover:underline">
                {t('auth.noAccount')}
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button type="button" onClick={() => switchMode('login')} className="font-bold text-accent hover:underline">
              {mode === 'register' ? t('auth.haveAccount') : t('auth.backToLogin')}
            </button>
          )}
        </div>
      </form>
    </Narrow>
  );
}
