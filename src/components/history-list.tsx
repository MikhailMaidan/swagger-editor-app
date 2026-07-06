"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readRequestHistory,
  RequestHistoryRecord,
} from "@/lib/request-history";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function readSortedRequestHistory() {
  return readRequestHistory().sort(
    (firstRecord, secondRecord) =>
      new Date(secondRecord.createdAt).getTime() -
      new Date(firstRecord.createdAt).getTime(),
  );
}

function HistoryLinks() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-5 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)]"
        href="/"
      >
        Open Editor
      </Link>
      <Link
        className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-[color:var(--color-brand-purple)] px-5 text-base font-extrabold text-[color:var(--color-brand-purple)]"
        href="/api-reference"
      >
        API Reference
      </Link>
    </div>
  );
}

export function HistoryList() {
  const [records, setRecords] = useState<RequestHistoryRecord[]>([]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setRecords(readSortedRequestHistory());
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  if (records.length === 0) {
    return (
      <>
        <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
          You have not executed any requests yet. Start from the editor or open
          the API reference to explore the current schema.
        </p>
        <HistoryLinks />
      </>
    );
  }

  return (
    <>
      <p className="mt-5 max-w-4xl text-base font-medium leading-8 text-[color:var(--color-brand-muted)]">
        Recent executed requests are shown newest first.
      </p>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-[color:var(--color-brand-border)]">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-[#fbfaff] text-[color:var(--color-brand-navy)]">
            <tr>
              <th className="px-4 py-3 font-extrabold">Method</th>
              <th className="px-4 py-3 font-extrabold">Endpoint</th>
              <th className="px-4 py-3 font-extrabold">Summary</th>
              <th className="px-4 py-3 font-extrabold">Status</th>
              <th className="px-4 py-3 font-extrabold">Duration</th>
              <th className="px-4 py-3 font-extrabold">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                className="border-t border-[color:var(--color-brand-border)] text-[color:var(--color-brand-muted)]"
                key={record.id}
              >
                <td className="px-4 py-4 font-extrabold text-[color:var(--color-brand-purple)]">
                  {record.method}
                </td>
                <td className="px-4 py-4 font-mono font-bold text-[color:var(--color-brand-navy)]">
                  {record.path}
                </td>
                <td className="px-4 py-4 font-medium">{record.summary}</td>
                <td className="px-4 py-4 font-bold">{record.status}</td>
                <td className="px-4 py-4 font-medium">
                  {record.durationMs} ms
                </td>
                <td className="px-4 py-4 font-medium">
                  {formatDate(record.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HistoryLinks />
    </>
  );
}
