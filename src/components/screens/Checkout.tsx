'use client';

import { useState } from 'react';
import { DELIVERY_FROM, DELIVERY_TO } from '@/config/site';
import { useI18n, type TKey } from '@/i18n';
import { labelShort } from '@/lib/dates';
import { isValidPhone, PHONE_PREFIX, formatDigits, parsePhoneInput, phoneDigits } from '@/lib/phone';
import { useApp, type Contact, type Payment } from '@/state/app-context';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { AddressField } from '../ui/AddressField';
import { AuthControl } from '../ui/AuthControl';
import { DiscountBadge } from '../ui/DiscountBadge';
import { Field } from '../ui/Field';
import { OrderSummary } from '../ui/OrderSummary';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TurnstileWidget } from '../ui/TurnstileWidget';

const REQUIRED: (keyof Contact)[] = ['telegram', 'phone', 'address'];

export function Checkout() {
  const { t, lang, pl } = useI18n();
  const { customer, go, orderType, days, portions, sum, contact, setContactField, place, selectPlace, captcha, payment, setPayment, placeOrder, sending, submitError } = useApp();
  const [phoneForeign, setPhoneForeign] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Contact, boolean>>>({});

  const text = `${days.length} ${pl('unit.day', days.length)} × ${portions} ${pl('unit.portion', portions)}`;
  const err = (k: keyof Contact) => (errors[k] ? t(k === 'phone' ? 'error.phone_invalid' : 'checkout.required') : undefined);
  const bind = (k: keyof Contact) => ({
    value: contact[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setContactField(k, e.target.value);
      if (errors[k]) setErrors((x) => ({ ...x, [k]: false }));
    },
  });

  // Телефон: ручной ввод — как раньше; автозаполнение/вставка (не «набранный» символ) — через разбор формата, чужой номер не подставляем.
  const onPhone = (el: HTMLInputElement, typing: boolean) => {
    const { digits, foreign } = typing ? { digits: phoneDigits(el.value), foreign: false } : parsePhoneInput(el.value);
    setPhoneForeign(foreign);
    setContactField('phone', digits);
    if (errors.phone) setErrors((x) => ({ ...x, phone: false }));
  };
  const isTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const it = (e.nativeEvent as InputEvent).inputType;
    return typeof it === 'string' && it !== 'insertReplacementText' && it !== 'insertFromPaste' && it !== 'insertFromDrop';
  };

  const submit = () => {
    const bad = REQUIRED.filter((k) => (k === 'phone' ? !isValidPhone(contact.phone) : !contact[k].trim()));
    setErrors(Object.fromEntries(bad.map((k) => [k, true])));
    if (bad.length) {
      document.querySelector<HTMLInputElement>(`input[name="${bad[0]}"]`)?.focus();
      return;
    }
    if (payment !== 'cash') {
      go('payment');
    } else {
      void placeOrder();
    }
  };

  const payOpts: [Payment, TKey, TKey][] = [
    ['qr', 'checkout.payQr', 'checkout.payQrDesc'],
    ['cash', 'checkout.payCash', 'checkout.payCashDesc'],
    ['other', 'checkout.payOther', 'checkout.payOtherDesc'],
  ];

  return (
    <>
      <ScreenHeader title={t('checkout.title')} onBack={() => go('order')} />
      <form autoComplete="on" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-[18px] px-5 pb-6">
        <div className="flex items-center justify-between gap-3 rounded-md2 bg-card px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-extrabold">
              {orderType === 'once' ? t('checkout.summaryOnce', { text }) : t('checkout.summarySub', { text })}
            </div>
            <div className="text-[13px] text-ink-muted">
              {days.map((d) => labelShort(d, lang)).join(', ')} · {DELIVERY_FROM}–{DELIVERY_TO}
            </div>
          </div>
          <button type="button" onClick={() => go('order')} className="text-sm font-bold text-accent hover:underline">
            {t('checkout.edit')}
          </button>
        </div>

        <DiscountBadge />
        {customer ? null : (
          <div className="flex flex-col gap-2.5 rounded-md2 bg-card px-4 py-3.5">
            <div className="text-[13px] leading-snug text-ink-2">{t('auth.checkoutHint')}</div>
            <AuthControl variant="full" />
          </div>
        )}
        <Field
          name="telegram"
          label={t('checkout.telegram')}
          placeholder={t('checkout.telegramPh')}
          autoCapitalize="none"
          autoComplete="nickname"
          error={err('telegram')}
          {...bind('telegram')}
        />
        <Field
          name="phone"
          label={t('checkout.phone')}
          placeholder={t('checkout.phonePh')}
          prefix={PHONE_PREFIX}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          error={err('phone')}
          hint={phoneForeign ? t('checkout.phoneForeign') : undefined}
          value={formatDigits(contact.phone)}
          onChange={(e) => onPhone(e.target, isTyping(e))}
          onBlur={(e) => e.target.value !== formatDigits(contact.phone) && onPhone(e.target, false)}
          onAnimationStart={(e) => onPhone(e.currentTarget, false)}
        />
        <AddressField
          label={t('checkout.address')}
          placeholder={t('checkout.addressPh')}
          error={err('address')}
          value={contact.address}
          place={place}
          onText={(v) => {
            setContactField('address', v);
            if (errors.address) setErrors((x) => ({ ...x, address: false }));
          }}
          onPlace={(p) => {
            selectPlace(p);
            setErrors((x) => ({ ...x, address: false }));
          }}
        />
        <Field name="hotel" label={t('checkout.hotel')} {...bind('hotel')} />
        <Field name="comment" label={t('checkout.comment')} {...bind('comment')} />

        <div className="flex flex-col gap-2.5">
          <div className="text-[17px] font-extrabold">{t('checkout.payTitle')}</div>
          {payOpts.map(([id, title, desc]) => {
            const on = payment === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPayment(id)}
                className={`flex items-center gap-3 rounded-md2 border-2 bg-card px-4 py-3.5 text-left ${on ? 'border-accent' : 'border-line'}`}
              >
                <div className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-line'}`}>
                  <div className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-accent' : 'bg-transparent'}`} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold">{t(title)}</span>
                  <span className="text-[13px] text-ink-muted">{t(desc)}</span>
                </div>
              </button>
            );
          })}
        </div>
        {payment === 'cash' && <TurnstileWidget />}
      </form>
      <div className="flex-1" />
      <BottomBar>
        <OrderSummary sum={sum} />
        {submitError && <div className="text-center text-[13px] font-bold text-accent">{t(submitError as TKey)}</div>}
        <Button disabled={sending || (payment === 'cash' && !captcha)} onClick={submit}>
          {sending ? t('checkout.sending') : payment !== 'cash' ? t('checkout.toPayment') : t('checkout.send')}
        </Button>
      </BottomBar>
    </>
  );
}
