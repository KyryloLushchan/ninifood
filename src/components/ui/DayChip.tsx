interface Props {
  weekday: string;
  date: string;
  selected: boolean;
  /** Недоступный день (воскресенье, сегодня): серая неактивная ячейка с подписью. */
  dayOff?: string;
  onClick: () => void;
}

export function DayChip({ weekday, date, selected, dayOff, onClick }: Props) {
  if (dayOff) {
    return (
      <div aria-disabled="true" className="flex h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-chip border border-line bg-sand/50 text-ink-muted/70">
        <span className="text-[15px] font-extrabold leading-none">{weekday}</span>
        <span className="text-xs leading-none">{date}</span>
        <span className="max-w-full text-[8px] leading-none tracking-tight min-[360px]:text-[9px]">{dayOff}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-chip border ${
        selected ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink [@media(hover:hover)]:hover:bg-sand'
      }`}
    >
      <span className="text-[15px] font-extrabold">{weekday}</span>
      <span className="text-xs">{date}</span>
    </button>
  );
}
