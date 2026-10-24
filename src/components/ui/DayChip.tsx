interface Props {
  weekday: string;
  date: string;
  selected: boolean;
  onClick: () => void;
}

export function DayChip({ weekday, date, selected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-chip border ${
        selected ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink hover:bg-sand'
      }`}
    >
      <span className="text-[15px] font-extrabold">{weekday}</span>
      <span className="text-xs">{date}</span>
    </button>
  );
}
