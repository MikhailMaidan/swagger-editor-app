import YAML from "yaml";
import { normalizeSloObjective, type SloObjective } from "./slo-project";
export function generateSloPrometheus(value: SloObjective): string {
  const p = normalizeSloObjective(value),
    selector = `slo_id=${JSON.stringify(p.id)}`,
    total = (ms: number) =>
      `sum(increase(rsswag_slo_events_total{${selector},result=~"good|bad"}[${ms}ms]))`,
    bad = (ms: number) =>
      `(sum(increase(rsswag_slo_events_total{${selector},result="bad"}[${ms}ms])) or vector(0))`;
  const rules = p.rules.map((r, i) => {
    const test = (ms: number) =>
      p.targetPpm === 1000000
        ? `(${bad(ms)} > 0)`
        : `((${bad(ms)} / ${total(ms)}) >= ${(r.burnMilli / 1000) * ((1000000 - p.targetPpm) / 1000000)})`;
    const terms = [
      test(r.longMs),
      test(r.shortMs),
      `(${total(r.longMs)} >= ${r.minLongUnits})`,
      `(${total(r.shortMs)} >= ${r.minShortUnits})`,
    ];
    if (p.requireCoverage)
      terms.push(
        `((time() - max(rsswag_slo_coverage_start_seconds{${selector}})) >= ${r.longMs / 1000})`,
      );
    return {
      alert: `RSSwagSLO_${i + 1}_${r.id.replace(/[^A-Za-z0-9_]/g, "_")}`,
      expr: terms.join(" and "),
      for: r.forMs ? `${r.forMs}ms` : "0s",
      labels: { severity: "warning", slo_id: p.id },
      annotations: {
        summary: `${p.name}: ${r.name}`,
        description:
          "Both short and long request-error burn windows exceeded the configured threshold and minimum volume.",
      },
    };
  });
  return (
    "# RSSwag request-based SLO rules; no deployment is performed.\n# Instrument rsswag_slo_events_total{slo_id,result=good|bad} after the exported classifier.\n# Add event.weight, not one, when using weighted observations. Do not count excluded/scope events.\n# If coverage is required, publish rsswag_slo_coverage_start_seconds and reset it on collection gaps/restarts.\n# Prometheus increase extrapolates counter samples; results are not exact timestamped replay parity.\n" +
    YAML.stringify({ groups: [{ name: `rsswag-slo-${p.id}`, rules }] })
  );
}
export function generateSloToolkit(value: SloObjective): string {
  const p = JSON.stringify(normalizeSloObjective(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    "// RSSwag bounded request-based SLO toolkit. ES module, no dependencies or I/O.\n" +
    "// Completion events use integer epoch milliseconds; windows are (now-width, now].\n" +
    "// Coverage is an operator assertion, not a proof of complete instrumentation.\n" +
    "// forMs uses sampled evaluations only. Missing coverage/no-data/low volume reset holds.\n" +
    "// Capacity: 5000 retained events. Late events are refused after evaluation.\n" +
    "// Reset drops coverage by default. Re-declare it only when completeness is justified.\n" +
    "// This module contains policy metadata, without captured events or regression fixtures.\n" +
    "const policy = " +
    p +
    ";\n" +
    RUNTIME
  );
}
const RUNTIME = String.raw`
const MAX_TIME=4102531200000;
const int=(v,min,max)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==="string"&&v.length<=max&&new TextEncoder().encode(v).length<=max;
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
function event(v){
  if(!object(v)||!text(v.id,80)||!/^[A-Za-z0-9_-]+$/.test(v.id)||!text(v.name,120)||!v.name.trim()||!int(v.atMs,0,MAX_TIME)||!text(v.service,120)||!text(v.route,256)||!text(v.method,20)||!/^[A-Z][A-Z0-9_-]*$/.test(v.method)||!int(v.status,100,599)||typeof v.latencyMs!=="number"||!Number.isFinite(v.latencyMs)||v.latencyMs<0||v.latencyMs>86400000||!int(v.weight,1,1000000)||typeof v.excluded!=="boolean")fail("event");
  return {id:v.id,name:v.name,atMs:v.atMs,service:v.service,route:v.route,method:v.method,status:v.status,latencyMs:v.latencyMs,weight:v.weight,excluded:v.excluded};
}
function coverage(v){if(v===null)return null;if(!object(v)||!int(v.fromMs,0,MAX_TIME)||!int(v.toMs,v.fromMs,MAX_TIME))fail("project");return {fromMs:v.fromMs,toMs:v.toMs};}
function rawClassify(e){
  if(policy.scope.service&&e.service!==policy.scope.service||policy.scope.route&&e.route!==policy.scope.route||policy.scope.method!=="*"&&e.method!==policy.scope.method)return "scope";
  if(e.excluded)return "excluded";const status=policy.goodStatuses.some(r=>e.status>=r.from&&e.status<=r.to),latency=e.latencyMs<=policy.thresholdMs;
  return (policy.mode==="availability"?status:policy.mode==="latency"?latency:status&&latency)?"good":"bad";
}
export function classifyEvent(input){return rawClassify(event(input));}
function index(inputs){
  if(!Array.isArray(inputs)||inputs.length>5000)fail("limit");for(let i=0;i<inputs.length;i++)if(!Object.hasOwn(inputs,i))fail("event");
  const events=inputs.map(event);if(new Set(events.map(e=>e.id)).size!==events.length)fail("duplicate");
  const eligible=[];for(const e of events){const c=rawClassify(e);if(c==="good"||c==="bad")eligible.push({atMs:e.atMs,weight:e.weight,bad:c==="bad"?e.weight:0});}
  eligible.sort((a,b)=>a.atMs-b.atMs);const units=[0],bad=[0];for(const e of eligible){units.push(units.at(-1)+e.weight);bad.push(bad.at(-1)+e.bad);}
  function upper(t){let lo=0,hi=eligible.length;while(lo<hi){const mid=(lo+hi)>>>1;if(eligible[mid].atMs<=t)lo=mid+1;else hi=mid;}return lo;}
  return (atMs,width,declared)=>{
    if(!int(atMs,0,MAX_TIME)||!int(width,1,policy.windowMs))fail("clock");const c=coverage(declared),fromMs=atMs-width,a=upper(fromMs),b=upper(atMs),total=units[b]-units[a],badUnits=bad[b]-bad[a],good=total-badUnits,errorPpm=1000000-policy.targetPpm;
    const completeness=c===null?"unknown":fromMs>=c.fromMs&&atMs<=c.toMs?"complete":"partial",allocated=total*errorPpm,remaining=allocated-badUnits*1000000;
    const target=total===0?"no-data":policy.requireCoverage&&completeness!=="complete"?"unknown":remaining>=0?"met":"missed";
    return {fromMs,toMs:atMs,events:b-a,total,good,bad:badUnits,coverage:completeness,target,sliPercent:total?good/total*100:null,allowedBad:allocated/1000000,remainingBad:remaining/1000000,remainingPercent:allocated?remaining/allocated*100:null,burnRate:!total?null:allocated?badUnits*1000000/allocated:badUnits?null:0,infiniteBurn:!errorPpm&&badUnits>0};
  };
}
function atLeast(w,threshold){if(!w.total)return false;const error=1000000-policy.targetPpm;if(!error)return w.bad>0;return BigInt(w.bad)*1000000n*1000n>=BigInt(w.total)*BigInt(error)*BigInt(threshold);}
function point(read,atMs,c,previous){
  const holds=new Map(),rules=policy.rules.map(r=>{
    const long=read(atMs,r.longMs,c),short=read(atMs,r.shortMs,c);let status,sinceMs=null;
    if(!long.total||!short.total)status="no-data";
    else if(policy.requireCoverage&&(long.coverage!=="complete"||short.coverage!=="complete"))status="unknown";
    else if(long.total<r.minLongUnits||short.total<r.minShortUnits)status="insufficient";
    else if(!atLeast(long,r.burnMilli)||!atLeast(short,r.burnMilli))status="inactive";
    else{sinceMs=previous.get(r.id)??atMs;if(sinceMs>atMs)fail("clock");holds.set(r.id,sinceMs);status=atMs-sinceMs>=r.forMs?"firing":"pending";}
    return {id:r.id,name:r.name,status,sinceMs,long,short};
  });return {point:{atMs,window:read(atMs,policy.windowMs,c),rules,firing:rules.filter(r=>r.status==="firing").length},holds};
}
export function evaluateTimeline(inputs,settings){
  if(!object(settings)||!int(settings.fromMs,0,MAX_TIME)||!int(settings.toMs,settings.fromMs,MAX_TIME)||settings.toMs-settings.fromMs>7776000000||!int(settings.stepMs,1,7776000000)||Math.ceil((settings.toMs-settings.fromMs)/settings.stepMs)+1>240)fail("limit");
  const c=coverage(settings.coverage??null),read=index(inputs),times=[];for(let at=settings.fromMs;at<settings.toMs;at+=settings.stepMs)times.push(at);times.push(settings.toMs);let holds=new Map();
  return times.map(at=>{const r=point(read,at,c,holds);holds=r.holds;return r.point;});
}
export function createSloMonitor(options={}){
  let coverageStart=options.assumeCompleteFromMs??null;if(coverageStart!==null&&!int(coverageStart,0,MAX_TIME))fail("clock");
  const events=new Map();let holds=new Map(),lastMs=null,lastPoint=null,evicted=0,evaluations=0;
  const copy=v=>v===null?null:JSON.parse(JSON.stringify(v));
  return {
    record(input){const e=event(input),old=events.get(e.id);if(old){if(JSON.stringify(old)===JSON.stringify(e))return false;fail("duplicate");}if(lastMs!==null&&e.atMs<=lastMs)fail("late");if(events.size>=5000)fail("limit");events.set(e.id,e);return true;},
    evaluate(atMs){if(!int(atMs,0,MAX_TIME)||lastMs!==null&&atMs<lastMs||coverageStart!==null&&atMs<coverageStart)fail("clock");for(const [id,e]of events)if(e.atMs<=atMs-policy.windowMs){events.delete(id);evicted++;}const r=point(index([...events.values()]),atMs,coverageStart===null?null:{fromMs:coverageStart,toMs:atMs},holds);holds=r.holds;lastMs=atMs;lastPoint=r.point;evaluations++;return copy(lastPoint);},
    snapshot(){return {retained:events.size,evicted,evaluations,lastMs,point:copy(lastPoint)};},
    reset(start=null){if(start!==null&&!int(start,0,MAX_TIME))fail("clock");events.clear();holds=new Map();lastMs=null;lastPoint=null;evicted=0;evaluations=0;coverageStart=start;}
  };
}
`;
