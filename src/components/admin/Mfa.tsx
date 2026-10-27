'use client';

import { useEffect, useRef, useState } from 'react';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { Btn, Card, Err, inputCls } from './ui';

const codeError = (message: string | undefined) =>
  /invalid|incorrect|expired/i.test(message ?? '') ? 'Неверный код. Проверьте время на телефоне и введите свежий код.' : ruError(message);

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className={`${inputCls} text-center font-mono text-xl tracking-[0.4em]`}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(digits(e.target.value))}
    />
  );
}

/** Подключение TOTP-приложения (Google Authenticator и т.п.): QR → код → фактор подтверждён. Годится и для второго устройства. */
export function MfaEnroll({ onDone, onCancel, intro }: { onDone: () => void; onCancel?: () => void; intro?: string }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode не должен создавать два фактора
    started.current = true;
    (async () => {
      // Остатки прерванных подключений мешают (имя фактора уникально) — убираем.
      const { data: list } = await adminDb.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === 'unverified') await adminDb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await adminDb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Устройство ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` });
      if (error || !data || data.type !== 'totp') setError(ruError(error?.message));
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factor || code.length !== 6) return;
    setBusy(true);
    setError('');
    const { error } = await adminDb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) {
      setError(codeError(error.message));
      setCode('');
    } else onDone();
  };

  return (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <div className="text-sm text-ink-2">{intro ?? 'Откройте Google Authenticator (или другое TOTP-приложение), добавьте аккаунт по QR-коду и введите 6-значный код.'}</div>
      {factor ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={factor.qr} alt="QR-код для приложения-аутентификатора" width={200} height={200} className="mx-auto h-[200px] w-[200px] rounded-md2 bg-white p-2" />
          <div className="text-center text-xs text-ink-muted">
            Не получается сканировать? Введите ключ вручную:
            <div className="mt-1 select-all break-all font-mono text-[13px] text-ink">{factor.secret}</div>
          </div>
          <CodeInput value={code} onChange={setCode} />
        </>
      ) : (
        !error && <div className="py-6 text-center text-sm text-ink-muted">Готовим QR-код…</div>
      )}
      <Err>{error}</Err>
      <div className="flex gap-2">
        {onCancel && <Btn type="button" kind="ghost" onClick={onCancel}>Отмена</Btn>}
        <Btn type="submit" className="flex-1" disabled={busy || !factor || code.length !== 6}>{busy ? 'Проверяем…' : 'Подтвердить'}</Btn>
      </div>
    </form>
  );
}

/** Вход: ввод 6-значного кода из приложения (подтверждает вторую ступень, aal2). */
export function MfaChallenge({ factorIds, onDone, onSignOut }: { factorIds: { id: string; name: string }[]; onDone: () => void; onSignOut: () => void }) {
  const [factorId, setFactorId] = useState(factorIds[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    const { error } = await adminDb.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) {
      setError(codeError(error.message));
      setCode('');
    } else onDone();
  };

  return (
    <form onSubmit={verify} className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-3 px-5">
      <div className="text-center font-serif text-[26px] font-bold text-accent">Код подтверждения</div>
      <div className="text-center text-sm text-ink-2">Введите 6-значный код из приложения-аутентификатора.</div>
      {factorIds.length > 1 && (
        <select className={inputCls} value={factorId} onChange={(e) => setFactorId(e.target.value)}>
          {factorIds.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}
      <CodeInput value={code} onChange={setCode} />
      <Err>{error}</Err>
      <Btn type="submit" disabled={busy || code.length !== 6}>{busy ? 'Проверяем…' : 'Войти'}</Btn>
      <Btn type="button" kind="ghost" onClick={onSignOut}>Выйти</Btn>
    </form>
  );
}

/** Первый вход без MFA: подключение обязательно. */
export function MfaRequired({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-3 px-5 py-8">
      <div className="text-center font-serif text-[26px] font-bold text-accent">Двухфакторная защита</div>
      <Card>
        <MfaEnroll onDone={onDone} />
      </Card>
      <Btn kind="ghost" onClick={onSignOut}>Выйти</Btn>
    </div>
  );
}

interface FactorRow {
  id: string;
  friendly_name?: string;
  created_at: string;
}

/** «Настройки → Безопасность»: список устройств, добавление второго, удаление (последнее удалить нельзя). */
export function SecurityCard() {
  const [factors, setFactors] = useState<FactorRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await adminDb.auth.mfa.listFactors();
    if (error) setError(ruError(error.message));
    else setFactors((data?.totp ?? []) as FactorRow[]);
  };
  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    setError('');
    const { error } = await adminDb.auth.mfa.unenroll({ factorId: id });
    setConfirmId(null);
    if (error) setError(ruError(error.message));
    await load();
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="text-[17px] font-extrabold">Безопасность · устройства 2FA</div>
      {factors === null && <div className="text-sm text-ink-muted">Загрузка…</div>}
      {factors?.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
          <div>
            <div className="font-bold">{f.friendly_name || 'Устройство'}</div>
            <div className="text-xs text-ink-muted">добавлено {new Date(f.created_at).toLocaleDateString('ru-RU')}</div>
          </div>
          {factors.length > 1 &&
            (confirmId === f.id ? (
              <Btn kind="danger" onClick={() => void remove(f.id)}>Точно удалить</Btn>
            ) : (
              <Btn kind="ghost" onClick={() => setConfirmId(f.id)}>Удалить</Btn>
            ))}
        </div>
      ))}
      {factors?.length === 1 && <div className="text-xs text-ink-muted">Последнее устройство удалить нельзя. Добавьте второе на случай потери телефона.</div>}
      <Err>{error}</Err>
      {adding ? (
        <MfaEnroll
          intro="Откройте приложение-аутентификатор на втором устройстве, отсканируйте QR-код и введите код."
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void load();
          }}
        />
      ) : (
        <Btn kind="outline" onClick={() => setAdding(true)}>Добавить второе устройство</Btn>
      )}
    </Card>
  );
}
