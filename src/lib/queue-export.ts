import { normalizeQueueDefinition, type QueueDefinition } from "./queue-model";
export function generateQueueToolkit(value: QueueDefinition) {
  const policy = JSON.stringify(normalizeQueueDefinition(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    "// RSSwag deterministic in-memory job queue. ES module, no dependencies or network I/O.\n// Supply a unique instance ID after state loss. Receipts fence leases; they are not authentication.\n// Authenticate/authorize before the Fetch handler; persist transactions externally for durability.\n// Virtual clock only: explicitly advance it. No provider compatibility or exactly-once effects.\n// Up to 100 retained jobs, 400 commands, 2000 journal rows; terminal jobs require purge.\n// Contains policy metadata only, without captured payloads, receipts or regression fixtures.\nconst policy = " +
    policy +
    ";\n" +
    RUNTIME
  );
}
const RUNTIME = String.raw`
const MAX_TIME=1000000000000,SPAN=7776000000;
const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const int=(v,min,max)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==="string"&&v.length<=max&&new TextEncoder().encode(v).length<=max;
const id=v=>text(v,80)&&/^[A-Za-z0-9_-]+$/.test(v);
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail("limit");for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))fail("step");return v;};
function value(input){let nodes=0;function visit(v,depth){if(depth>12||++nodes>512)fail("limit");if(v===null||typeof v==="boolean"||typeof v==="string")return v;if(typeof v==="number"&&Number.isFinite(v))return Object.is(v,-0)?0:v;if(Array.isArray(v))return list(v,512).map(x=>visit(x,depth+1));if(object(v)){const proto=Object.getPrototypeOf(v);if(proto===null||Object.getPrototypeOf(proto)===null)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k],depth+1)]));}fail("step");}const result=visit(input,0);if(new TextEncoder().encode(JSON.stringify(result)).length>4096)fail("limit");return result;}
function input(v){if(!object(v)||!id(v.id)||!text(v.name,120)||!v.name.trim()||!text(v.group,80)||!int(v.priority,-100,100)||!int(v.delayMs,0,SPAN))fail("step");return {id:v.id,name:v.name,group:v.group,priority:v.priority,delayMs:v.delayMs,payload:value(v.payload)};}
function command(v){if(!object(v))fail("step");if(v.type==="enqueue")return {type:v.type,job:input(v.job)};if(v.type==="poll"&&id(v.worker)&&int(v.limit,1,16))return {type:v.type,worker:v.worker,limit:v.limit};if(["ack","nack","heartbeat"].includes(v.type)&&id(v.job)&&id(v.worker)&&text(v.receipt,160)&&v.receipt)return {type:v.type,job:v.job,worker:v.worker,receipt:v.receipt};if(v.type==="advance"&&int(v.ms,0,SPAN))return {type:v.type,ms:v.ms};if(v.type==="cancel"&&id(v.job))return {type:v.type,job:v.job};if(v.type==="redrive"&&id(v.job)&&int(v.delayMs,0,SPAN))return {type:v.type,job:v.job,delayMs:v.delayMs};if(v.type==="purge")return {type:v.type};fail("step");}
const active=j=>j.status==="queued"||j.status==="leased";
function summary(s){const counts={ready:0,delayed:0,leased:0,done:0,dead:0,expired:0,cancelled:0},ages=[];for(const j of s.jobs){if(j.status==="queued"){if(j.availableMs<=s.nowMs){counts.ready++;ages.push(s.nowMs-j.availableMs);}else counts.delayed++;}else counts[j.status]++;}return {nowMs:s.nowMs,retained:s.jobs.length,commands:s.commands,...counts,oldestReadyAgeMs:ages.length?Math.max(...ages):0,journalDropped:s.journalDropped,metrics:{...s.metrics}};}
export function createQueue(instanceId){
 if(!id(instanceId))fail("definition");const d=policy;let state={instanceId,nowMs:0,sequence:0,deliveries:0,commands:0,jobs:[],metrics:{enqueued:0,duplicates:0,leased:0,acked:0,retried:0,dead:0,expired:0,cancelled:0,redriven:0,purged:0,rejected:0},journal:[],journalDropped:0,journalSequence:0};
 function time(n){if(n>MAX_TIME)fail("clock");return n;}
 function event(s,type,job,reason,worker=null,receipt=null){s.journal.push({sequence:++s.journalSequence,command:s.commands,atMs:s.nowMs,type,job:job?.id??null,worker,receipt,reason});if(s.journal.length>2000){s.journal.shift();s.journalDropped++;}}
 function failJob(s,j,reason){const lease=j.lease;j.lease=null;if(j.attempts>=d.maxAttempts){j.status="dead";s.metrics.dead++;event(s,"dead",j,reason,lease.worker,lease.receipt);}else{j.status="queued";j.availableMs=time(s.nowMs+Math.min(d.maxBackoffMs,d.backoffMs*2**(j.attempts-1)));s.metrics.retried++;event(s,"retry",j,reason,lease.worker,lease.receipt);}}
 function advance(s,target){while(true){let next=Infinity;for(const j of s.jobs)if(active(j)){next=Math.min(next,j.expiresMs);if(j.lease)next=Math.min(next,j.lease.untilMs);}if(next>target)break;s.nowMs=next;for(const j of s.jobs)if(active(j)&&j.expiresMs<=next){const lease=j.lease;j.status="expired";j.lease=null;s.metrics.expired++;event(s,"expired",j,"retention",lease?.worker,lease?.receipt);}for(const j of s.jobs)if(j.lease&&j.lease.untilMs<=next)failJob(s,j,"lease-expired");}s.nowMs=target;}
 function execute(s,step){
  const result=(accepted,reason,jobs=[])=>{if(!accepted)s.metrics.rejected++;event(s,step.type,"job"in step&&typeof step.job==="string"?s.jobs.find(j=>j.id===step.job)??null:null,reason,"worker"in step?step.worker:null,"receipt"in step?step.receipt:null);return {accepted,reason,jobs};};
  if(step.type==="advance"){advance(s,time(s.nowMs+step.ms));return result(true,"advanced");}
  if(step.type==="enqueue"){const old=s.jobs.find(j=>j.id===step.job.id);if(old){const v={id:old.id,name:old.name,group:old.group,priority:old.priority,delayMs:old.delayMs,payload:old.payload};if(JSON.stringify(v)!==JSON.stringify(step.job))return result(false,"conflict");s.metrics.duplicates++;return result(true,"duplicate",[old]);}if(s.jobs.length>=d.capacity)return result(false,"capacity");const j={...step.job,sequence:++s.sequence,createdMs:s.nowMs,availableMs:time(s.nowMs+step.job.delayMs),expiresMs:time(s.nowMs+d.retentionMs),status:"queued",attempts:0,deliveries:0,lease:null};s.jobs.push(j);s.metrics.enqueued++;event(s,"queued",j,"enqueued");return result(true,"enqueued",[j]);}
  if(step.type==="poll"){const held=s.jobs.filter(j=>j.lease?.worker===step.worker).length,slots=Math.min(step.limit,Math.max(0,d.perWorker-held)),jobs=[];for(let i=0;i<slots;i++){const ready=s.jobs.filter(j=>j.status==="queued"&&j.availableMs<=s.nowMs&&(!d.serialGroups||!j.group||!s.jobs.some(other=>other.group===j.group&&active(other)&&other.sequence<j.sequence))).sort((a,b)=>(d.order==="priority"?b.priority-a.priority:0)||a.sequence-b.sequence);const j=ready[0];if(!j)break;j.status="leased";j.attempts++;j.deliveries++;j.lease={worker:step.worker,receipt:instanceId+":"+(++s.deliveries),untilMs:time(Math.min(s.nowMs+d.visibilityMs,j.expiresMs))};s.metrics.leased++;jobs.push(j);event(s,"leased",j,"delivery",step.worker,j.lease.receipt);}return result(true,jobs.length?"leased":slots?"empty":"worker-full",jobs);}
  if(step.type==="purge"){const count=s.jobs.filter(j=>!active(j)).length;s.jobs=s.jobs.filter(active);s.metrics.purged+=count;return result(true,"purged");}
  const j=s.jobs.find(j=>j.id===step.job);if(!j)return result(false,"missing");
  if(step.type==="cancel"){if(!active(j))return result(false,"terminal");j.status="cancelled";j.lease=null;s.metrics.cancelled++;return result(true,"cancelled",[j]);}
  if(step.type==="redrive"){if(j.status!=="dead")return result(false,"not-dead");j.status="queued";j.attempts=0;j.sequence=++s.sequence;j.availableMs=time(s.nowMs+step.delayMs);j.expiresMs=time(s.nowMs+d.retentionMs);s.metrics.redriven++;return result(true,"redriven",[j]);}
  if(!j.lease||j.lease.worker!==step.worker||j.lease.receipt!==step.receipt||j.lease.untilMs<=s.nowMs)return result(false,"stale");
  if(step.type==="ack"){j.status="done";j.lease=null;s.metrics.acked++;return result(true,"acked",[j]);}if(step.type==="nack"){failJob(s,j,"nack");return result(true,j.status==="dead"?"dead":"retry",[j]);}j.lease.untilMs=time(Math.min(s.nowMs+d.visibilityMs,j.expiresMs));return result(true,"extended",[j]);
 }
 return {apply(v){const step=command(v);if(state.commands>=400)fail("limit");const next=clone(state);next.commands++;const result=execute(next,step);state=next;return clone(result);},snapshot:()=>clone(state),summary:()=>summary(state)};
}
export function createQueueHandler(queue){
 const reply=(status,value,headers={})=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
 return async request=>{
  const path=new URL(request.url).pathname;
  if(path!=="/queue/status"&&path!=="/queue/commands")return reply(404,{error:"not-found"});
  const method=path==="/queue/status"?"GET":"POST";if(request.method!==method)return reply(405,{error:"method"},{allow:method});
  if(method==="GET")return reply(200,queue.summary());
  if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")return reply(415,{error:"content-type"});
  try{
   let size=0,source="";const reader=request.body?.getReader(),decoder=new TextDecoder("utf-8",{fatal:true});
   if(reader)try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384){await reader.cancel();return reply(413,{error:"limit"});}source+=decoder.decode(r.value,{stream:true});}source+=decoder.decode();}finally{reader.releaseLock();}
   let step;try{step=JSON.parse(source);}catch{return reply(400,{error:"json"});}const decision=queue.apply(step);return reply(decision.accepted?200:409,decision);
  }catch(e){return reply(e?.code==="limit"?413:400,{error:e?.code??"step"});}
 };
}
`;
export function generateQueueOpenApi(value: QueueDefinition) {
  const d = normalizeQueueDefinition(value),
    id = { type: "string", pattern: "^[A-Za-z0-9_-]+$", maxLength: 80 },
    integer = (min: number, max: number) => ({
      type: "integer",
      minimum: min,
      maximum: max,
    }),
    object = (properties: Record<string, unknown>) => ({
      type: "object",
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    }),
    kind = (type: string, fields: Record<string, unknown> = {}) =>
      object({ type: { type: "string", const: type }, ...fields }),
    job = object({
      id,
      name: { type: "string", minLength: 1, maxLength: 120 },
      group: { type: "string", maxLength: 80 },
      priority: integer(-100, 100),
      delayMs: integer(0, 7776000000),
      payload: {
        description: "Bounded JSON: 4096 UTF-8 bytes, 512 nodes, depth 12.",
      },
    }),
    response = (description: string) => ({
      description,
      content: { "application/json": { schema: { type: "object" } } },
    });
  return {
    openapi: "3.1.0",
    info: {
      title: `${d.name} queue API`,
      version: "1.0.0",
      description:
        "RSSwag virtual-clock in-memory demonstration. Authenticate before the exported Fetch handler; receipts are not authorization. Not a durable broker.",
    },
    paths: {
      "/queue/status": {
        get: {
          operationId: "queueStatus",
          responses: {
            "200": response("Value-free queue summary"),
            "405": response("Wrong method"),
          },
        },
      },
      "/queue/commands": {
        post: {
          operationId: "queueCommand",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    kind("enqueue", { job }),
                    kind("poll", { worker: id, limit: integer(1, 16) }),
                    ...["ack", "nack", "heartbeat"].map((t) =>
                      kind(t, {
                        job: id,
                        worker: id,
                        receipt: {
                          type: "string",
                          minLength: 1,
                          maxLength: 160,
                        },
                      }),
                    ),
                    kind("advance", { ms: integer(0, 7776000000) }),
                    kind("cancel", { job: id }),
                    kind("redrive", {
                      job: id,
                      delayMs: integer(0, 7776000000),
                    }),
                    kind("purge"),
                  ],
                },
              },
            },
          },
          responses: {
            "200": response(
              "Accepted command; returned jobs may contain payloads",
            ),
            "400": response("Invalid JSON, command or clock"),
            "409": response(
              "Rejected transition, stale receipt, conflict or capacity",
            ),
            "413": response("Bound exceeded"),
            "415": response("Expected application/json"),
          },
        },
      },
    },
  };
}
