interface Props {
  weekday: string;
  date: string;
  selected: boolean;
  /** Меню на этот день ещё не опубликовано. */
  noMenu?: boolean;
  onClick: () => void;
}

export function DayChip({ weekday, date, selected, noMenu, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-chip border ${
        selected ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink hover:bg-sand'
      } ${noMenu ? 'border-dashed' : ''}`}
    >
      <span className="text-[15px] font-extrabold">{weekday}</span>
      <span className="text-xs">{date}</span>
    </button>
  );
}
