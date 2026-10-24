export function Logo({ size = 22 }: { size?: 22 | 26 }) {
  return <div className={`font-serif font-bold text-accent ${size === 26 ? 'text-[26px]' : 'text-screen'}`}>NiniFood</div>;
}

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <button
        onClick={onBack}
        aria-label="←"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-[20px] hover:bg-sand"
      >
        ←
      </button>
      <h1 className="font-serif text-screen font-semibold">{title}</h1>
    </div>
  );
}

