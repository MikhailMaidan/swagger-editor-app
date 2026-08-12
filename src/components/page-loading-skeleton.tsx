export function PageLoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section
        aria-label="Loading"
        className="mx-auto w-full max-w-[1600px] animate-pulse rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)] motion-reduce:animate-none"
        role="status"
      >
        <div className="h-4 w-28 rounded-full bg-[color:var(--color-brand-soft)]" />
        <div className="mt-4 h-9 w-64 rounded-2xl bg-[color:var(--color-brand-soft)]" />
        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: rows }, (_, index) => (
            <div
              className="h-14 rounded-2xl bg-[color:var(--color-brand-soft)]"
              key={index}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
