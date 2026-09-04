export default function RootLoading() {
  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8 py-10">
      <div className="bg-card border-4 border-border p-6 pixel-shadow mb-8">
        <div className="h-4 w-40 bg-muted animate-pulse mb-4" />
        <div className="h-8 w-3/4 bg-muted animate-pulse mb-3" />
        <div className="h-3 w-full max-w-4xl bg-muted animate-pulse" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        <div className="space-y-6">
          <div className="bg-card border-4 border-border p-4 pixel-shadow">
            <div className="h-3 w-24 bg-muted animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-8 bg-muted animate-pulse" />
              <div className="h-8 bg-muted animate-pulse" />
              <div className="h-8 bg-muted animate-pulse" />
            </div>
          </div>
          <div className="bg-card border-4 border-border p-4 pixel-shadow">
            <div className="h-3 w-20 bg-muted animate-pulse mb-4" />
            <div className="space-y-2">
              <div className="h-5 bg-muted animate-pulse" />
              <div className="h-5 bg-muted animate-pulse" />
              <div className="h-5 bg-muted animate-pulse" />
              <div className="h-5 bg-muted animate-pulse" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-card border-4 border-border p-4 pixel-shadow">
              <div className="aspect-square bg-muted animate-pulse mb-4 border-2 border-border" />
              <div className="h-3 bg-muted animate-pulse mb-2" />
              <div className="h-3 w-2/3 bg-muted animate-pulse mb-4" />
              <div className="h-5 w-1/2 bg-primary/20 animate-pulse mb-2" />
              <div className="h-2 w-1/3 bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
