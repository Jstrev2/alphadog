export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
        Coming soon
      </p>
      <h1 className="mt-3 text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        AlphaDog
      </h1>
      <p className="mt-6 max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        A live map of where dogs go. Head for the hot spots when your dog needs
        a quick stop, or steer around them when you want a quiet walk.
      </p>
    </main>
  );
}
