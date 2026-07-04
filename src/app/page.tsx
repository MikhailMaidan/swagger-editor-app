export default function Home() {
  return (
    <div className="flex w-full flex-1 px-4 py-8 md:px-8 lg:px-10">
      <section className="mx-auto grid w-full max-w-[1600px] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="min-h-[520px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
          <div className="flex items-center justify-between border-b border-[color:var(--color-brand-border)] px-5 py-4">
            <div>
              <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
                Editor
              </p>
              <h1 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                OpenAPI schema
              </h1>
            </div>
            <span className="rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-2 text-sm font-bold text-[color:var(--color-brand-purple)]">
              YAML
            </span>
          </div>
          <textarea
            className="h-[420px] w-full resize-none rounded-b-[28px] bg-[#fbfaff] p-5 font-mono text-sm leading-7 text-[color:var(--color-brand-navy)] outline-none"
            defaultValue={`openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
paths:
  /users:
    get:
      summary: Get users
      responses:
        '200':
          description: Successful response`}
            aria-label="OpenAPI schema editor"
          />
        </div>

        <div className="min-h-[520px] rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-5 shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
          <div>
            <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
              Viewer
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
              API Reference
            </h2>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-700">
                  GET
                </span>
                <span className="font-mono text-base font-bold text-[color:var(--color-brand-navy)]">
                  /users
                </span>
              </div>
              <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
                Successful response with a list of users.
              </p>
            </article>

            <article className="rounded-2xl border border-[color:var(--color-brand-border)] p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-sky-100 px-3 py-1 text-sm font-extrabold text-sky-700">
                  POST
                </span>
                <span className="font-mono text-base font-bold text-[color:var(--color-brand-navy)]">
                  /users
                </span>
              </div>
              <p className="mt-3 text-sm font-medium leading-6 text-[color:var(--color-brand-muted)]">
                Request body and response preview will appear here.
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
