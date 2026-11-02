import {
  normalizeSyncDefinition,
  syncSchema,
  type SyncDefinition,
} from "./sync-model";
export function generateSyncToolkit(value: SyncDefinition): string {
  const d = JSON.stringify(normalizeSyncDefinition(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    "// RSSwag state-based synchronization toolkit. ES module; no dependencies.\n" +
    "// Actors must have unique, durable ownership. Never fork/reuse an actor after losing its state.\n" +
    "// Authenticate and route before the responder. Validation is not proof of state provenance.\n" +
    "// Full snapshots preserve causal context. Do not trim contexts or treat these as delta messages.\n" +
    "// No payloads, playground operations, message queues or scenario fixtures are embedded.\n" +
    "const definition = " +
    d +
    ";\n" +
    RUNTIME
  );
}
const RUNTIME = String.raw`
const MAX=262144;
const size=v=>new TextEncoder().encode(typeof v==="string"?v:JSON.stringify(v)).length;
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const int=(v,min,max)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==="string"&&v.length<=max&&size(v)<=max;
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const list=(v,min,max)=>{if(!Array.isArray(v)||v.length<min||v.length>max)fail("limit");for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))fail("state");return v;};
const schema=JSON.stringify([definition.documentId,definition.actors.map(a=>a.id).sort(),definition.fields.map(f=>[f.id,f.type]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)]);
const clock=(v,a)=>Object.hasOwn(v,a)?v[a]:0;
const key=e=>JSON.stringify([e.actor,String(e.sequence)]);
function value(input){
  let nodes=0;
  function visit(v,depth){
    if(depth>16||++nodes>1024)fail("limit");if(v===null||typeof v==="boolean"||typeof v==="string")return v;
    if(typeof v==="number"&&Number.isFinite(v))return Object.is(v,-0)?0:v;
    if(Array.isArray(v))return list(v,0,1024).map(x=>visit(x,depth+1));
    if(object(v)){const proto=Object.getPrototypeOf(v);if(proto===null||Object.getPrototypeOf(proto)===null)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k],depth+1)]));}fail("state");
  }
  const result=visit(input,0);if(size(JSON.stringify(result))>2048)fail("limit");return result;
}
function normalizeClock(v,max){if(!object(v)||Object.keys(v).length>definition.actors.length)fail("state");for(const [k,n]of Object.entries(v))if(!definition.actors.some(a=>a.id===k)||!int(n,0,max))fail("state");return Object.fromEntries(definition.actors.map(a=>a.id).sort().filter(id=>Object.hasOwn(v,id)&&v[id]!==0).map(id=>[id,v[id]]));}
export function normalizeState(input){
  if(!object(input)||input.kind!=="rsswag-sync-state"||input.version!==1||input.schema!==schema||!object(input.fields)||Object.keys(input.fields).length!==definition.fields.length)fail("state");
  const fields=Object.fromEntries([...definition.fields].sort((a,b)=>a.id<b.id?-1:1).map(f=>{
    const v=Object.hasOwn(input.fields,f.id)?input.fields[f.id]:null;if(!object(v)||v.type!==f.type)fail("state");
    if(f.type==="counter")return [f.id,{type:f.type,positive:normalizeClock(v.positive,1000000000),negative:normalizeClock(v.negative,1000000000)}];
    const context=normalizeClock(v.context,1000000),entries=list(v.entries,0,f.type==="register"?8:64).map(e=>{
      if(!object(e)||typeof e.actor!=="string"||!definition.actors.some(a=>a.id===e.actor)||!int(e.sequence,1,clock(context,e.actor)))fail("state");if(f.type==="set"&&!text(e.value,120))fail("state");return {actor:e.actor,sequence:e.sequence,value:value(e.value)};
    }).sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:a.sequence-b.sequence);
    if(new Set(entries.map(key)).size!==entries.length||f.type==="register"&&new Set(entries.map(e=>e.actor)).size!==entries.length)fail("state");return [f.id,{type:f.type,context,entries}];
  }));
  const result={kind:"rsswag-sync-state",version:1,schema,fields};if(size(result)>MAX)fail("capacity");return result;
}
function empty(){return normalizeState({kind:"rsswag-sync-state",version:1,schema,fields:Object.fromEntries(definition.fields.map(f=>[f.id,f.type==="counter"?{type:f.type,positive:{},negative:{}}:{type:f.type,context:{},entries:[]}]))});}
function joinClock(a,b){return Object.fromEntries(definition.actors.map(a=>a.id).sort().flatMap(id=>{const n=Math.max(clock(a,id),clock(b,id));return n?[[id,n]]:[];}));}
export function mergeStates(left,right){
  const a=normalizeState(left),b=normalizeState(right),fields=Object.fromEntries(definition.fields.map(f=>{
    const x=a.fields[f.id],y=b.fields[f.id];if(f.type==="counter")return [f.id,{type:f.type,positive:joinClock(x.positive,y.positive),negative:joinClock(x.negative,y.negative)}];
    const ax=new Map(x.entries.map(e=>[key(e),e])),by=new Map(y.entries.map(e=>[key(e),e])),entries=[];
    for(const e of x.entries){const other=by.get(key(e));if(other){if(JSON.stringify(e.value)!==JSON.stringify(other.value))fail("equivocation");entries.push(e);}else if(clock(y.context,e.actor)<e.sequence)entries.push(e);}
    for(const e of y.entries)if(!ax.has(key(e))&&clock(x.context,e.actor)<e.sequence)entries.push(e);
    if(entries.length>(f.type==="register"?8:64))fail("capacity");return [f.id,{type:f.type,context:joinClock(x.context,y.context),entries}];
  }));return normalizeState({...a,fields});
}
export function projectState(input){const state=normalizeState(input);return Object.fromEntries(Object.entries(state.fields).map(([id,f])=>{
  if(f.type==="counter")return [id,{type:f.type,value:Object.values(f.positive).reduce((a,b)=>a+b,0)-Object.values(f.negative).reduce((a,b)=>a+b,0)}];
  const values=[...new Map(f.entries.map(e=>[JSON.stringify(e.value),e.value])).entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,v])=>v);return [id,f.type==="set"?{type:f.type,values}:{type:f.type,values,conflict:values.length>1}];
}));}
export function createReplica(actor,initial){
  if(!definition.actors.some(a=>a.id===actor))fail("step");let state=initial===undefined?empty():normalizeState(initial);
  return {
    snapshot:()=>normalizeState(state),view:()=>projectState(state),
    merge:input=>{const next=mergeStates(state,input);state=next;return normalizeState(state);},
    apply:operation=>{
      if(!object(operation))fail("step");const f=definition.fields.find(f=>f.id===operation.field);if(!f)fail("step");const current=state.fields[f.id];let next;
      if(operation.type==="increment"&&f.type==="counter"&&int(operation.amount,-1000000,1000000)&&operation.amount!==0){const k=operation.amount>0?"positive":"negative",n=clock(current[k],actor)+Math.abs(operation.amount);if(n>1000000000)fail("capacity");next={...current,[k]:{...current[k],[actor]:n}};}
      else if(f.type!=="counter"){
        const sequence=clock(current.context,actor)+1;if(sequence>1000000)fail("capacity");let entries=current.entries;
        if(operation.type==="assign"&&f.type==="register")entries=[{actor,sequence,value:value(operation.value)}];
        else if(operation.type==="clear"&&f.type==="register")entries=[];
        else if(operation.type==="add"&&f.type==="set"&&text(operation.value,120))entries=[...entries.filter(e=>e.value!==operation.value),{actor,sequence,value:operation.value}];
        else if(operation.type==="remove"&&f.type==="set"&&text(operation.value,120))entries=entries.filter(e=>e.value!==operation.value);else fail("step");
        if(entries.length>64)fail("capacity");next={type:f.type,context:{...current.context,[actor]:sequence},entries};
      }else fail("step");
      const candidate=normalizeState({...state,fields:{...state.fields,[f.id]:next}});state=candidate;return normalizeState(state);
    }
  };
}
async function readJson(message){
  const length=message.headers.get("Content-Length");if(length!==null&&(!/^\d{1,10}$/.test(length)||Number(length)>MAX)){await message.body?.cancel();fail("limit");}
  if(!message.body)fail("json");const reader=message.body.getReader(),parts=[];let count=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>MAX){await reader.cancel();fail("limit");}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(count);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^\uFEFF/,""));}catch{fail("json");}
}
const response=state=>new Response(JSON.stringify(normalizeState(state)),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
// transact(updater) MUST serialize updates atomically and return the committed state.
// Validation cannot distinguish forged clocks from legitimate authorized state.
export function createSyncResponder(adapter){
  if(!adapter||typeof adapter.read!=="function"||typeof adapter.transact!=="function")fail("adapter");
  return async request=>{
    if(!["GET","POST"].includes(request.method))return new Response(null,{status:405,headers:{Allow:"GET, POST"}});
    try{
      if(request.method==="GET")return response((await adapter.read())??empty());
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type")||"")||request.headers.get("Content-Encoding")&&!/^identity$/i.test(request.headers.get("Content-Encoding")))return new Response(null,{status:415});
      const incoming=normalizeState(await readJson(request));if(request.signal.aborted)throw request.signal.reason;
      const committed=await adapter.transact(current=>mergeStates(current??empty(),incoming));return response(committed);
    }catch(error){const code=error?.code,status=code==="limit"?413:["capacity","equivocation"].includes(code)?409:["state","json"].includes(code)?400:500;return new Response(JSON.stringify({error:status===500?"storage":code}),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
  };
}
// Explicit POST only; merge into CURRENT local state after awaiting the server.
export async function synchronizeReplica(replica,url,options={}){
  const target=new URL(url);if(!["http:","https:"].includes(target.protocol)||target.username||target.password)fail("url");const timeout=options.timeoutMs??20000;if(!int(timeout,1,120000))fail("limit");
  const state=normalizeState(replica.snapshot()),controller=new AbortController(),abort=()=>controller.abort(options.signal.reason);if(options.signal?.aborted)abort();else options.signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error("deadline")),timeout);
  try{
    if(controller.signal.aborted)throw controller.signal.reason;const headers=new Headers(options.headers);headers.set("Content-Type","application/json");headers.set("Accept","application/json");
    const result=await (options.fetch??globalThis.fetch)(target.href,{method:"POST",body:JSON.stringify(state),headers,signal:controller.signal,credentials:"omit",redirect:"error",cache:"no-store"});
    if(result.status!==200){await result.body?.cancel();fail("http-"+result.status);}if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(result.headers.get("Content-Type")||"")){await result.body?.cancel();fail("state");}
    const incoming=normalizeState(await readJson(result));if(controller.signal.aborted)throw controller.signal.reason;return replica.merge(incoming);
  }finally{clearTimeout(timer);options.signal?.removeEventListener("abort",abort);}
}
`;
export function generateSyncOpenApi(value: SyncDefinition) {
  const d = normalizeSyncDefinition(value),
    clock = (max: number) => ({
      type: "object",
      properties: Object.fromEntries(
        d.actors.map((a) => [
          a.id,
          { type: "integer", minimum: 0, maximum: max },
        ]),
      ),
      additionalProperties: false,
    });
  const fields = Object.fromEntries(
    d.fields.map((f) => [
      f.id,
      f.type === "counter"
        ? {
            type: "object",
            required: ["type", "positive", "negative"],
            properties: {
              type: { const: "counter" },
              positive: clock(1000000000),
              negative: clock(1000000000),
            },
          }
        : {
            type: "object",
            required: ["type", "context", "entries"],
            properties: {
              type: { const: f.type },
              context: clock(1000000),
              entries: {
                type: "array",
                maxItems: f.type === "register" ? 8 : 64,
                items: {
                  type: "object",
                  required: ["actor", "sequence", "value"],
                  properties: {
                    actor: { type: "string", enum: d.actors.map((a) => a.id) },
                    sequence: { type: "integer", minimum: 1, maximum: 1000000 },
                    value:
                      f.type === "set"
                        ? {
                            type: "string",
                            maxLength: 120,
                            description: "At most 120 UTF-8 bytes.",
                          }
                        : {
                            description:
                              "Portable JSON value: at most 2048 UTF-8 bytes, depth 16 and 1024 nodes.",
                          },
                  },
                },
              },
            },
          },
    ]),
  );
  const payload = {
    description:
      "Full state snapshot. The service validates causal dots, actor membership and bounded state. Authenticate/protect actor ownership outside this contract.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SyncState" },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: `${d.documentId} synchronization API`,
      version: "1.0.0",
      description:
        "State-based synchronization. Implement POST using an atomic merge transaction. No endpoint is deployed by this export.",
    },
    paths: {
      "/sync": {
        get: {
          operationId: "getSyncState",
          responses: {
            "200": payload,
            "500": { description: "Storage failure" },
          },
        },
        post: {
          operationId: "mergeSyncState",
          requestBody: { required: true, content: payload.content },
          responses: {
            "200": payload,
            "400": { description: "Invalid snapshot" },
            "409": { description: "Merge capacity or dot equivocation" },
            "413": { description: "Snapshot limit exceeded" },
            "415": { description: "Unsupported media type or content coding" },
            "500": { description: "Storage failure" },
          },
        },
      },
    },
    components: {
      schemas: {
        SyncState: {
          type: "object",
          required: ["kind", "version", "schema", "fields"],
          properties: {
            kind: { const: "rsswag-sync-state" },
            version: { const: 1 },
            schema: { const: syncSchema(d) },
            fields: {
              type: "object",
              required: d.fields.map((f) => f.id),
              properties: fields,
              additionalProperties: false,
            },
          },
        },
      },
    },
  };
}
