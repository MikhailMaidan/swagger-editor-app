import {
  MAX_TRACE_BYTES,
  TraceError,
  traceJson,
  traceObject,
  readTraceData,
  traceHex,
  traceMs,
} from "./trace-data";
import type { TraceAnalysis } from "./trace-analysis";
import { getByteSize } from "./text-encoding";

export function sliceTraceSource(source: string, traceId: string): string {
  const id = traceHex(traceId, 32);
  readTraceData(source);
  const root = traceJson(source) as Record<string, unknown>;
  const resourceSpans = (root.resourceSpans as Record<string, unknown>[])
    .map((group) => ({
      ...group,
      scopeSpans: ((group.scopeSpans as Record<string, unknown>[]) ?? [])
        .map((scope) => ({
          ...scope,
          spans: ((scope.spans as unknown[]) ?? []).filter(
            (s) =>
              traceObject(s) &&
              typeof s.traceId === "string" &&
              s.traceId.toLowerCase() === id,
          ),
        }))
        .filter((scope) => scope.spans.length),
    }))
    .filter((group) => group.scopeSpans.length);
  const result = { ...root, resourceSpans },
    pretty = JSON.stringify(result, null, 2),
    out =
      getByteSize(pretty) <= MAX_TRACE_BYTES ? pretty : JSON.stringify(result);
  readTraceData(out);
  return out;
}
export function traceViewerHtml(
  analysis: TraceAnalysis,
  traceId: string,
): string {
  const trace = analysis.traces.find((t) => t.traceId === traceId);
  if (!trace) throw new TraceError("project");
  const entries = analysis.timings
    .filter((t) => t.span.traceId === traceId)
    .sort((a, b) =>
      BigInt(a.span.startNs) < BigInt(b.span.startNs)
        ? -1
        : BigInt(a.span.startNs) > BigInt(b.span.startNs)
          ? 1
          : a.span.index - b.span.index,
    );
  const rows = entries.map((t) => ({
    index: t.span.index,
    parentIndex:
      analysis.data.spans.find((p) => p.key === t.parent)?.index ?? null,
    name: t.span.name,
    service: [t.span.namespace, t.span.service].filter(Boolean).join(" / "),
    depth: t.depth,
    offsetNs: (BigInt(t.span.startNs) - BigInt(trace.startNs)).toString(),
    durationNs: t.durationNs,
    offsetMs: traceMs(BigInt(t.span.startNs) - BigInt(trace.startNs)),
    durationMs: traceMs(t.durationNs),
    selfMs: t.selfNs === null ? null : traceMs(t.selfNs),
    error: t.span.status === 2,
    findings: analysis.diagnostics
      .filter((d) => d.key === t.span.key)
      .map((d) => d.code),
  }));
  const payload = JSON.stringify({
    elapsedNs: trace.elapsedNs,
    elapsedMs: traceMs(trace.elapsedNs),
    rows,
  })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RSSwag trace waterfall</title>
<style>body{font:15px system-ui,sans-serif;color:#182235;background:#f5f7fc;margin:0}main{max-width:1200px;margin:auto;padding:24px}h1{font-size:26px}input,select{padding:10px;border:1px solid #bbc6df;border-radius:6px;margin:0 8px 12px 0;max-width:100%}table{width:100%;border-collapse:collapse;background:white}td,th{text-align:left;padding:10px;border-bottom:1px solid #e2e6ef}button{background:none;border:0;text-align:left;cursor:pointer;color:#3a39a4;font:inherit}td:nth-child(2){min-width:240px}.track{position:relative;height:20px;background:#edf0fa;border-radius:3px}.bar{position:absolute;top:0;height:20px;background:#6d5cdb;min-width:2px;border-radius:3px}.error{background:#c44353}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid #d5daea;padding:16px}small{color:#556078}@media print{input,select{display:none}main{padding:0}.bar{print-color-adjust:exact}}</style></head>
<body><main><h1>Distributed trace waterfall</h1><p id="summary"></p><p><small>Observed timings; exclusive time subtracts the union of clipped direct-child intervals. Filtered rows retain their original timeline positions. This export contains operation/service names, relative timings and diagnostics; no raw IDs, timestamps or attributes.</small></p>
<label>Search operations/services <input id="search" type="search"></label><label>Service <select id="service"><option value="">All services</option></select></label><label><input type="checkbox" id="errors"> Errors only</label><p id="count" role="status"></p>
<div style="overflow:auto"><table><thead><tr><th>Operation / service</th><th>Observed timeline</th><th>Duration (ms)</th><th>Exclusive (ms)</th></tr></thead><tbody id="rows"></tbody></table></div><h2>Selected span</h2><pre id="details">Select an operation.</pre>
<script type="application/json" id="trace-data">${payload}</script>
<script>(()=>{const data=JSON.parse(document.getElementById("trace-data").textContent),body=document.getElementById("rows"),search=document.getElementById("search"),service=document.getElementById("service"),errors=document.getElementById("errors");document.getElementById("summary").textContent=data.rows.length+" spans; observed elapsed "+data.elapsedMs+" ms.";
for(const name of [...new Set(data.rows.map(r=>r.service))].sort()){const o=document.createElement("option");o.value=name;o.textContent=name;service.append(o)}
function draw(){body.replaceChildren();const terms=search.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);let count=0;for(const r of data.rows){if(service.value&&r.service!==service.value||errors.checked&&!r.error||!terms.every(t=>(r.name+" "+r.service).toLowerCase().includes(t)))continue;count++;const tr=document.createElement("tr"),label=document.createElement("td"),button=document.createElement("button"),small=document.createElement("small"),timeline=document.createElement("td"),track=document.createElement("div"),bar=document.createElement("div");button.textContent=r.name;button.style.paddingLeft=Math.min(r.depth,20)*12+"px";button.onclick=()=>{document.getElementById("details").textContent=JSON.stringify(r,null,2)};small.textContent=r.service;label.append(button,document.createElement("br"),small);track.className="track";bar.className="bar"+(r.error?" error":"");const range=BigInt(data.elapsedNs)||BigInt(1);bar.style.left=Number(BigInt(r.offsetNs)*BigInt(10000)/range)/100+"%";bar.style.width=Number(BigInt(r.durationNs)*BigInt(10000)/range)/100+"%";bar.title=r.offsetMs+" ms offset; "+r.durationMs+" ms duration";track.append(bar);timeline.append(track);tr.append(label,timeline);for(const v of [r.durationMs,r.selfMs??"unavailable"]){const td=document.createElement("td");td.textContent=v;tr.append(td)}body.append(tr)}document.getElementById("count").textContent=count+" / "+data.rows.length+" spans shown."}search.oninput=draw;service.onchange=draw;errors.onchange=draw;draw()})();</script>
</main></body></html>`;
}
