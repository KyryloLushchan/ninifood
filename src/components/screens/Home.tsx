'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DELIVERY_FROM, DELIVERY_TO, TODAY_ORDER_DEADLINE } from '@/config/site';
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

function NutritionLine({ n, className, split }: { n: { kcal: number; protein: number; fat: number; carbs: number }; className: string; split?: boolean }) {
  const { t } = useI18n();
  // split: ккал отдельной строкой, Б/Ж/У — второй (в узкой карточке). Внутри строки переносов нет.
  const kcal = <span className="whitespace-nowrap">{t('dish.kcal', { n: n.kcal })}</span>;
  const macros = (
    <span className="whitespace-nowrap">
      {t('dish.p', { n: n.protein })}
      <span className="mx-1.5">{t('dish.f', { n: n.fat })}</span>
      {t('dish.c', { n: n.carbs })}
    </span>
  );
  return split ? (
    <div className={`flex flex-col text-ink ${className}`}>{kcal}{macros}</div>
  ) : (
    <div className={`flex flex-wrap gap-x-3 text-ink ${className}`}>{kcal}{macros}</div>
  );
}

export function Home() {
  const { t, lang } = useI18n();
  const { settings, today, menu, menuLoaded, bookableDays, nearestDay, startOnce, startSub } = useApp();
  const [tab, setTab] = useState<string | null>(null);

  // Сегодня (если есть меню, неактивно) + ближайшие доступные дни.
  const menuDays = today ? [...(!isSunday(today) ? [today] : []), ...bookableDays] : [];
  const active = tab && menuDays.includes(tab) ? tab : nearestDay;
  // Кнопка в hero следует за выбранной вкладкой дня; по умолчанию — ближайший доступный.
  const heroDay = active;
  // Карусель: по слайду на каждый день, кроме сегодняшнего (он есть только во вкладках, неактивный).
  const slides = menuDays.filter((d) => d !== today);
  const activeIdx = active ? slides.indexOf(active) : -1;
  const carouselRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  const raf = useRef(0);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const goTo = useCallback((i: number, smooth = true) => {
    const el = carouselRef.current;
    if (!el) return;
    lockUntil.current = smooth ? Date.now() + 700 : 0;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = carouselRef.current;
      if (!el || Date.now() < lockUntil.current || drag.current?.moved) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (slides[i] && slides[i] !== active) setTab(slides[i]);
    });
  };

  // Активная вкладка прокручивается в видимую зону (только по горизонтали, страница не двигается).
  useEffect(() => {
    const box = tabsRef.current;
    const btn = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!box || !btn) return;
    box.scrollTo({ left: btn.offsetLeft - (box.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  // Стартовая позиция, когда активный день не первый слайд.
  const slidesKey = slides.join();
  useEffect(() => {
    if (activeIdx > 0) goTo(activeIdx, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slidesKey]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = carouselRef.current!;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = carouselRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 5) return;
    if (!d.moved) {
      d.moved = true;
      el.style.scrollSnapType = 'none';
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const d = drag.current;
    const el = carouselRef.current;
    drag.current = null;
    if (!d?.moved || !el) return;
    const i = Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    el.style.scrollSnapType = '';
    if (slides[i]) setTab(slides[i]);
    goTo(i);
  };
  return (
    <>
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <LangPill />
      </header>

      <section className="flex flex-col gap-4 px-5 pb-7">
        <Photo
          src={PHOTOS.hero}
          eager
          sizes="(min-width: 480px) 480px, 100vw"
          className="h-[220px] w-full rounded-xl2 p-3.5 [&:is(img)]:p-0"
          caption={<span className="rounded-md bg-card px-2 py-1 text-xs">{t('photo.hero')}</span>}
        />
        <h2 className="font-serif text-[length:clamp(1.5rem,8.5334vw,2rem)] font-semibold leading-[1.15] [text-wrap:balance]">{t('home.heroTitle')}</h2>
        <p className="text-base leading-normal text-ink-2">{t('home.heroText')}</p>
        <div className="flex flex-col items-center gap-2 min-[420px]:flex-row min-[420px]:gap-3">
          <Button size="xl" shadow className="min-[420px]:flex-1" disabled={!heroDay} onClick={() => heroDay && startOnce(heroDay)}>
            {heroDay ? t('home.heroCta', { day: labelFull(heroDay, lang) }) : menuLoaded ? t('home.noDays') : '…'}
          </Button>
          <div className="text-sm text-ink-2 min-[420px]:flex-none">{t('home.heroDeliveryNote', hours)}</div>
        </div>
        <div className="text-center text-sm text-ink-2">
          {t('home.todayQ')}{' '}
          <a href={settings.telegramUrl} target="_blank" rel="noreferrer">
            {t('home.todayLink', { time: TODAY_ORDER_DEADLINE })}
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-4 bg-card py-7">
        <h2 className="px-5 font-serif text-h2 font-semibold">{t('home.menuTitle')}</h2>
        <div ref={tabsRef} className="flex gap-2 overflow-x-auto px-5 pb-1">
          {menuDays.map((d) => {
            const isToday = d === today;
            const on = d === active;
            return (
              <button
                key={d}
                disabled={isToday}
                onClick={() => { setTab(d); goTo(slides.indexOf(d)); }}
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
        <div
          ref={carouselRef}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((d) => {
            const list = menu[d] ?? [];
            const nut = list.filter((x) => x.nutrition);
            const sum = nut.reduce(
              (a, x) => ({
                kcal: a.kcal + x.nutrition!.kcal,
                protein: a.protein + x.nutrition!.protein,
                fat: a.fat + x.nutrition!.fat,
                carbs: a.carbs + x.nutrition!.carbs,
              }),
              { kcal: 0, protein: 0, fat: 0, carbs: 0 },
            );
            return (
              <div key={d} className="flex w-full flex-none snap-center snap-always flex-col gap-4 select-none">
                {menuLoaded && list.length === 0 && (
                  <div className="px-5 py-6 text-center text-[15px] text-ink-muted">{t('home.noDays')}</div>
                )}
                <div className="grid grid-cols-2 gap-3 px-5">
                  {list.map((dish) => (
                    <div key={dish.type} className="flex flex-col gap-2">
                      <Photo
                        src={dish.photo}
                        alt={dish.name[lang]}
                        className="h-[120px] w-full rounded-lg2 p-2 [-webkit-user-drag:none]"
                        caption={t('photo.dish')}
                        captionClassName="text-[11px]"
                      />
                      <div className="text-xs font-extrabold uppercase tracking-[.04em] text-accent">{t(`dish.${dish.type}`)}</div>
                      <div className="-mt-1 text-[15px] font-bold leading-snug">{dish.name[lang]}</div>
                      {dish.nutrition && <NutritionLine split n={dish.nutrition} className="-mt-1 text-[13px] font-semibold leading-snug" />}
                    </div>
                  ))}
                </div>
                {nut.length > 0 && (
                  <div className="mx-5 rounded-md2 bg-bg px-4 py-3 text-[13px] leading-snug">
                    <div className="font-extrabold">{t('dish.total')}</div>
                    <NutritionLine n={sum} className="mt-0.5 text-[15px] font-bold" />
                    <div className="mt-0.5 text-[11px] text-ink-muted">{t('dish.approx')}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {slides.length > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              aria-label={t('home.prevDay')}
              disabled={activeIdx <= 0}
              onClick={() => { setTab(slides[activeIdx - 1]); goTo(activeIdx - 1); }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-lg leading-none text-ink disabled:opacity-30"
            >
              ‹
            </button>
            <div className="flex gap-1.5">
              {slides.map((d, i) => (
                <button
                  key={d}
                  aria-label={labelFull(d, lang)}
                  onClick={() => { setTab(d); goTo(i); }}
                  className={`h-2 rounded-full transition-all ${i === activeIdx ? 'w-5 bg-accent' : 'w-2 bg-line'}`}
                />
              ))}
            </div>
            <button
              aria-label={t('home.nextDay')}
              disabled={activeIdx < 0 || activeIdx >= slides.length - 1}
              onClick={() => { setTab(slides[activeIdx + 1]); goTo(activeIdx + 1); }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-lg leading-none text-ink disabled:opacity-30"
            >
              ›
            </button>
          </div>
        )}
        {active && (
          <div className="px-5 pt-1">
            <Button size="xl" shadow onClick={() => startOnce(active)}>
              {t('home.menuCta', { day: labelFull(active, lang), price: fmtMoney(settings.priceSingle) })}
            </Button>
          </div>
        )}
      </section>

      <section className="px-5 py-7">
        <div className="flex flex-col gap-3 rounded-xl2 bg-ink p-6 text-card">
          <div className="text-[13px] font-extrabold uppercase tracking-[.08em] text-accent-onDark">{t('sub.badge')}</div>
          <div className="font-serif text-h2 font-semibold">{t('sub.cardTitle')}</div>
          <div className="text-[15px] leading-normal text-ink-onDark">
            {t('sub.cardText')}
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
            {settings.telegramHandle}
          </a>
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
