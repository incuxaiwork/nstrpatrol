/**
 * Route-level loading shell — paints instantly during client navigations
 * while the page's data loads, instead of a blank document.
 */

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-card border border-line bg-white" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-96 animate-pulse rounded-card border border-line bg-white xl:col-span-2" />
        <div className="h-96 animate-pulse rounded-card border border-line bg-white" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-card border border-line bg-white" />
        <div className="h-64 animate-pulse rounded-card border border-line bg-white" />
      </div>
    </div>
  );
}