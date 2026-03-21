export default function ProductLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="mb-6">
        <div className="h-4 w-48 bg-muted animate-pulse" />
      </nav>

      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        <div className="flex flex-col gap-6">
          <div className="aspect-square bg-muted border-4 border-border animate-pulse" />

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <div className="h-3 w-32 bg-muted animate-pulse mb-2" />
            <div className="h-6 w-3/4 bg-muted animate-pulse mb-2" />
            <div className="h-3 w-1/2 bg-muted animate-pulse mb-4" />
            <div className="h-4 w-full bg-muted animate-pulse mb-2" />
            <div className="h-4 w-5/6 bg-muted animate-pulse" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <div className="h-3 w-40 bg-muted animate-pulse mb-4" />
            <div className="h-8 w-1/3 bg-primary/20 animate-pulse mb-4" />
            <div className="space-y-2">
              <div className="h-6 bg-muted animate-pulse" />
              <div className="h-6 bg-muted animate-pulse" />
              <div className="h-6 bg-muted animate-pulse" />
            </div>
          </div>

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <div className="h-3 w-24 bg-muted animate-pulse mb-4 border-b-4 border-primary pb-2" />
            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-muted animate-pulse" />
                <div className="h-3 w-16 bg-muted animate-pulse" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-muted animate-pulse" />
                <div className="h-3 w-12 bg-muted animate-pulse" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-28 bg-muted animate-pulse" />
                <div className="h-3 w-20 bg-muted animate-pulse" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-16 bg-muted animate-pulse" />
                <div className="h-3 w-24 bg-muted animate-pulse" />
              </div>
            </div>
          </div>

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <div className="h-3 w-32 bg-muted animate-pulse mb-4 border-b-4 border-muted pb-2" />
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-muted animate-pulse border-2 border-border" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-3/4 bg-muted animate-pulse" />
                  <div className="h-2 w-1/2 bg-muted animate-pulse" />
                </div>
                <div className="h-5 w-20 bg-primary/20 animate-pulse" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-muted animate-pulse border-2 border-border" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-2/3 bg-muted animate-pulse" />
                  <div className="h-2 w-1/3 bg-muted animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-primary/20 animate-pulse" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-muted animate-pulse border-2 border-border" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-4/5 bg-muted animate-pulse" />
                  <div className="h-2 w-2/5 bg-muted animate-pulse" />
                </div>
                <div className="h-5 w-24 bg-primary/20 animate-pulse" />
              </div>
            </div>
          </div>

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <div className="h-4 w-32 bg-muted animate-pulse mb-4" />
            <div className="h-10 bg-muted animate-pulse border-2 border-border" />
          </div>
        </div>
      </div>
    </div>
  );
}
