export default function AboutPage() {
  return (
    <div className="w-full px-4 py-10 md:px-8 lg:px-10">
      <section className="mx-auto w-full max-w-[1600px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          About
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          RSSwag OpenAPI UI
        </h1>
        <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          RSSwag is a team project for the RS School React course. The app is
          being built as an OpenAPI editor, viewer, REST client, and request
          history workspace.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-5">
            <h2 className="text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              Course
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              RS School React module final task. Learn more at{" "}
              <a
                className="font-extrabold text-[color:var(--color-brand-purple)]"
                href="https://rs.school/"
                rel="noreferrer"
                target="_blank"
              >
                RS School
              </a>
              .
            </p>
          </article>

          <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-5">
            <h2 className="text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              Team
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              <span className="block font-extrabold text-[color:var(--color-brand-navy)]">
                Mikhail Maidan
              </span>
              Role: responsible for everything.
              <br />
              GitHub:{" "}
              <a
                className="font-extrabold text-[color:var(--color-brand-purple)]"
                href="https://github.com/MikhailMaidan"
                rel="noreferrer"
                target="_blank"
              >
                MikhailMaidan
              </a>
            </p>
          </article>

          <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-5">
            <h2 className="text-lg font-extrabold text-[color:var(--color-brand-navy)]">
              Stack
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
              Next.js, React, TypeScript, and Tailwind CSS.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
