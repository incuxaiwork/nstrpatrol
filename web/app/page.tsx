export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">NSTR Patrol</h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Offline-first GIS tracking and forest patrol management. Admin console
          coming soon.
        </p>
      </div>
    </main>
  );
}
