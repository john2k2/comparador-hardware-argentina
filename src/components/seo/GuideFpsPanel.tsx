type GuideGameFps = {
  game: string;
  fps: string;
  settings: string;
};

export function GuideFpsPanel({
  canPublish,
  games,
}: {
  canPublish: boolean;
  games: GuideGameFps[];
}) {
  if (!canPublish) {
    return (
      <p className="text-[11px] md:text-[12px] leading-relaxed normal-case text-foreground/85 font-mono">
        No publicamos FPS mientras el procesador o la placa de video no tengan oferta en stock.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {games.map((game) => (
        <div key={game.game} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] font-mono">
          <span className="min-w-0 break-words">{game.game}</span>
          <span className="shrink-0">{game.fps} FPS ({game.settings})</span>
        </div>
      ))}
    </div>
  );
}
