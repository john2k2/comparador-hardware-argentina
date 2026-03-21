export default function SearchLoading() {
  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8 py-6">
      <div className="mb-8 bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
        <div className="h-3 w-32 bg-muted animate-pulse mb-3" />
        <div className="h-5 w-3/4 bg-muted animate-pulse" />
      </div>

      <div className="flex flex-col md:flex-row gap-6 mb-8 items-center">
        <div className="w-full">
          <div className="h-12 bg-muted border-4 border-border animate-pulse" />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-72 flex-shrink-0 lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin pr-2 pb-4 flex flex-col gap-8">
          <div className="bg-card border-4 border-border p-4 flex-shrink-0">
            <div className="h-3 w-16 bg-muted animate-pulse mb-6 border-b-4 border-primary pb-2" />
            <div className="space-y-3">
              <div className="h-8 bg-muted animate-pulse" />
              <div className="h-8 bg-muted animate-pulse" />
              <div className="h-8 bg-muted animate-pulse" />
              <div className="h-8 bg-muted animate-pulse" />
            </div>
          </div>

          <div className="bg-card border-4 border-border p-4 flex-shrink-0">
            <div className="h-2 w-20 bg-muted animate-pulse mb-3 border-b-2 border-muted pb-2" />
            <div className="space-y-1">
              <div className="h-6 bg-muted animate-pulse" />
              <div className="h-6 bg-muted animate-pulse" />
              <div className="h-6 bg-muted animate-pulse" />
              <div className="h-6 bg-muted animate-pulse" />
              <div className="h-6 bg-muted animate-pulse" />
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="bg-primary text-primary-foreground p-2 inline-block border-2 border-border">
              <div className="h-3 w-40 bg-primary-foreground/30 animate-pulse" />
            </div>
          </div>

          <div className="border-2 border-secondary bg-card px-4 py-3 pixel-shadow animate-pulse mb-4">
            <div className="h-3 w-64 bg-secondary/30 animate-pulse" />
            <div className="h-2 w-96 bg-muted/50 animate-pulse mt-2" />
          </div>

          <div className="bg-muted p-4 border-4 border-border relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-card border-4 border-border p-3 pixel-shadow">
                  <div className="aspect-square bg-muted animate-pulse mb-3 border-2 border-border" />
                  <div className="h-3 bg-muted animate-pulse mb-2" />
                  <div className="h-2 bg-muted animate-pulse w-3/4 mb-2" />
                  <div className="h-4 bg-primary/20 animate-pulse w-1/2 mt-4" />
                  <div className="h-2 bg-muted animate-pulse w-1/3 mt-2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
