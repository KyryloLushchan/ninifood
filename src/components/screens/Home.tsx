'use client';

import { useState } from 'react';
import { CONTACTS, DELIVERY_FROM, DELIVERY_TO, TODAY_ORDER_DEADLINE } from '@/config/site';
import { PHOTOS } from '@/config/photos';
import { useI18n } from '@/i18n';
import { ddmm, isSunday, labelFull, weekdayShort } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { useApp } from '@/state/app-context';
import { Button } from '../ui/Button';
import { LangPill } from '../ui/LangPill';
import { Photo } from '../ui/Photo';
import { Logo } from '../ui/ScreenHeader';

const hours = { from: DELIVERY_FROM, to: DELIVERY_TO };

export function Home() {
  const { t, lang } = useI18n();
  const { settings, today, menu, menuLoaded, bookableDays, nearestDay, startOnce, startSub } = useApp();
  const [tab, setTab] = useState<string | null>(null);

  // Сегодня (если есть меню, неактивно) + ближайшие доступные дни.
  const menuDays = today ? [...(!isSunday(today) ? [today] : []), ...bookableDays] : [];
  const active = tab && menuDays.includes(tab) ? tab : nearestDay;
  const dishes = active ? menu[active] ?? [] : [];

  return (
    <>
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <LangPill />
      </header>

      <section className="flex flex-col gap-4 px-5 pb-7">
        <Photo
          src={PHOTOS.hero}
          className="h-[220px] rounded-xl2 p-3.5"
          caption={<span className="rounded-md bg-card px-2 py-1 text-xs">{t('photo.hero')}</span>}
        />
        <h2 className="font-serif text-h1 font-semibold [text-wrap:pretty]">{t('home.heroTitle')}</h2>
        <p className="text-base leading-normal text-ink-2">{t('home.heroText', hours)}</p>
        <Button size="xl" shadow disabled={!nearestDay} onClick={() => nearestDay && startOnce(nearestDay)}>
          {nearestDay ? t('home.heroCta', { day: labelFull(nearestDay, lang) }) : menuLoaded ? t('home.noDays') : '…'}
        </Button>
        <div className="text-center text-sm text-ink-2">
          {t('home.todayQ')}{' '}
          <a href={settings.telegramUrl} target="_blank" rel="noreferrer">
            {t('home.todayLink', { time: TODAY_ORDER_DEADLINE })}
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-4 bg-card py-7">
        <h2 className="px-5 font-serif text-h2 font-semibold">{t('home.menuTitle')}</h2>
        <div className="flex gap-2 overflow-x-auto px-5 pb-1">
          {menuDays.map((d) => {
            const isToday = d === today;
            const on = d === active;
            return (
              <button
                key={d}
                disabled={isToday}
                onClick={() => setTab(d)}
                aria-pressed={on}
                className={`flex h-[60px] w-16 flex-none flex-col items-center justify-center gap-0.5 rounded-md2 border ${
                  on ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink'
                } ${isToday ? 'opacity-40' : ''}`}
              >
                <span className="text-[15px] font-extrabold">{weekdayShort(d, lang)}</span>
                <span className="text-xs">{isToday ? t('home.todayTag') : ddmm(d)}</span>
              </button>
            );
          })}
        </div>
        {menuLoaded && active && dishes.length === 0 && (
          <div className="px-5 py-6 text-center text-[15px] text-ink-muted">{t('home.noDays')}</div>
        )}
        <div className="grid grid-cols-2 gap-3 px-5">
          {dishes.map((dish) => (
            <div key={dish.type} className="flex flex-col gap-2">
              <Photo
                src={dish.photo}
                alt={dish.name[lang]}
                className="h-[120px] w-full rounded-lg2 p-2"
                caption={t('photo.dish')}
                captionClassName="text-[11px]"
              />
              <div className="text-xs font-extrabold uppercase tracking-[.04em] text-accent">{t(`dish.${dish.type}`)}</div>
              <div className="-mt-1 text-[15px] font-bold leading-snug">{dish.name[lang]}</div>
            </div>
          ))}
        </div>
        {active && (
          <div className="px-5 pt-1">
            <Button variant="outline" size="md" onClick={() => startOnce(active)}>
              {t('home.menuCta', { day: labelFull(active, lang), price: fmtMoney(settings.priceSingle) })}
            </Button>
          </div>
        )}
      </section>

      <section className="px-5 py-7">
        <div className="flex flex-col gap-3 rounded-xl2 bg-ink p-6 text-card">
          <div className="text-[13px] font-extrabold uppercase tracking-[.08em] text-accent-onDark">{t('sub.badge')}</div>
          <div className="font-serif text-h2 font-semibold">{t('sub.cardTitle', { price: fmtMoney(settings.priceSub) })}</div>
          <div className="text-[15px] leading-normal text-ink-onDark">
            {t('sub.cardText', { perDay: fmtMoney(settings.perDay), single: fmtMoney(settings.priceSingle) })}
          </div>
          <Button variant="light" size="md" className="mt-1" onClick={startSub}>
            {t('sub.cardCta')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 px-5 pb-7">
        <h2 className="font-serif text-h2 font-semibold">{t('how.title')}</h2>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent">{n}</div>
            <div className="flex flex-col gap-0.5 pt-1.5">
              <div className="text-base font-extrabold">{t(`how.${n}.t` as 'how.1.t')}</div>
              <div className="text-sm leading-snug text-ink-2">{t(`how.${n}.d` as 'how.1.d', hours)}</div>
            </div>
          </div>
        ))}
      </section>

      <footer className="flex flex-1 flex-col gap-2.5 bg-card px-5 pb-8 pt-6">
        <h2 className="mb-1 font-serif text-h2 font-semibold">{t('contacts.title')}</h2>
        <div className="flex justify-between text-[15px]">
          <span className="text-ink-muted">{t('contacts.telegram')}</span>
          <a href={settings.telegramUrl} target="_blank" rel="noreferrer">
            {CONTACTS.telegramHandle}
          </a>
        </div>
        <div className="flex justify-between text-[15px]">
          <span className="text-ink-muted">{t('contacts.phone')}</span>
          <span className="font-bold">{CONTACTS.phone}</span>
        </div>
        <div className="flex justify-between text-[15px]">
          <span className="text-ink-muted">{t('contacts.delivery')}</span>
          <span className="font-bold">{t('contacts.deliveryValue', hours)}</span>
        </div>
        <div className="mt-2 text-[13px] text-ink-muted">{t('contacts.sunday')}</div>
      </footer>
    </>
  );
}
