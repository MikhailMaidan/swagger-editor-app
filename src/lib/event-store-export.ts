import {
  normalizeEventDefinition,
  type EventStoreDefinition,
} from "./event-store-model";
export function generateEventStoreToolkit(value: EventStoreDefinition) {
  const definition = JSON.stringify(normalizeEventDefinition(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    "// RSSwag event-sourced API toolkit. ES module; no dependencies, timers or outbound I/O.\n// In-memory model: durable transactions and authentication/authorization belong outside this module.\n// Catalog and projection constants are embedded; captured events, scenarios and views are not.\n// Append is atomic per batch; projection progress is atomic per event and may stop after a good prefix.\n// Log import replays append sources; it validates structure/concurrency/contracts, not provenance.\nconst definition = " +
    "JSON.parse(" +
    JSON.stringify(definition) +
    ")" +
    ";\n" +
    RUNTIME
  );
}
const RUNTIME = String.raw`
const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const int=(v,min,max)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==="string"&&v.length<=max&&new TextEncoder().encode(v).length<=max;
const id=v=>text(v,80)&&/^[A-Za-z0-9_-]+$/.test(v);
const key=v=>typeof v==="number"?Number.isFinite(v):text(v,256)&&!!v.trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const fault=reason=>{const e=new Error(reason);e.projectionFault=true;throw e;};
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail("limit");for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))fail("definition");return v;};
function json(input,max=4096){let nodes=0;function visit(v,depth){if(depth>12||++nodes>512)fail("limit");if(v===null||typeof v==="boolean"||typeof v==="string")return v;if(typeof v==="number"&&Number.isFinite(v))return Object.is(v,-0)?0:v;if(Array.isArray(v))return list(v,512).map(x=>visit(x,depth+1));if(object(v)){const proto=Object.getPrototypeOf(v);if(proto===null||Object.getPrototypeOf(proto)===null)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k],depth+1)]));}fail("command");}const value=visit(input,0);if(new TextEncoder().encode(JSON.stringify(value)).length>max)fail("limit");return value;}
function raw(v){if(!object(v)||!id(v.id)||!id(v.type)||!int(v.version,1,8)||!object(v.payload))fail("command");return {id:v.id,type:v.type,version:v.version,payload:json(v.payload)};}
function command(v){if(!object(v))fail("command");if(v.type==="append"&&id(v.stream)&&int(v.expectedRevision,0,500)){const events=list(v.events,20).map(raw);if(!events.length)fail("command");return {type:v.type,stream:v.stream,expectedRevision:v.expectedRevision,events};}if(v.type==="project"&&id(v.projectionId)&&int(v.limit,1,500))return {type:v.type,projectionId:v.projectionId,limit:v.limit};if(v.type==="rebuild"&&id(v.projectionId))return {type:v.type,projectionId:v.projectionId};if(v.type==="skip"&&id(v.projectionId)&&int(v.position,1,500))return {type:v.type,projectionId:v.projectionId,position:v.position};fail("command");}
function log(v){if(!object(v)||v.kind!=="rsswag-event-log"||v.version!==1)fail("log");const batches=list(v.batches,500).map(v=>{const c=command(v);if(c.type!=="append")fail("log");return c;});if(batches.reduce((n,b)=>n+b.events.length,0)>500||new TextEncoder().encode(JSON.stringify(batches)).length>4194304)fail("limit");return {kind:v.kind,version:1,batches};}
function pointer(value,path){if(path==="")return {found:true,value};for(const encoded of path.slice(1).split("/")){const k=encoded.replace(/~1/g,"/").replace(/~0/g,"~");if(value===null||typeof value!=="object"||!Object.hasOwn(value,k)||Array.isArray(value)&&!/^(0|[1-9][0-9]*)$/.test(k))return {found:false};value=value[k];}return {found:true,value};}
function matches(v,kind){if(kind==="null")return v===null;if(kind==="array")return Array.isArray(v);if(kind==="object")return v!==null&&typeof v==="object"&&!Array.isArray(v);if(kind==="integer")return typeof v==="number"&&Number.isSafeInteger(v);return typeof v===kind;}
function upgrade(input){const type=definition.types.find(t=>t.id===input.type);if(!type||input.version>type.version)fail("contract");let version=input.version,payload=clone(input.payload);while(version<type.version){const u=definition.upcasters.find(u=>u.type===type.id&&u.fromVersion===version);if(!u)fail("upcast");const fields=new Map(Object.entries(payload)),sources=new Set(u.rename.map(r=>r.from));for(const r of u.rename)if(fields.has(r.from)&&fields.has(r.to)&&!sources.has(r.to))fail("upcast");for(const r of u.rename)fields.delete(r.from);for(const r of u.rename)if(Object.hasOwn(payload,r.from))fields.set(r.to,payload[r.from]);for(const [field,value]of Object.entries(u.defaults))if(!fields.has(field))fields.set(field,clone(value));try{payload=json(Object.fromEntries(fields));}catch{fail("upcast");}version++;}for(const f of type.fields){const v=pointer(payload,f.pointer);if(!v.found){if(f.required)fail("contract");}else if(!matches(v.value,f.kind))fail("contract");}return {...input,version,payload};}
export function upcastEvent(input){return upgrade(raw(input));}
function source(s,event){if(s.source==="literal")return s.value;if(s.source==="event")return event[s.field];const v=pointer(event.payload,s.pointer);if(!v.found)fault("missing-source");return v.value;}
const rowKey=k=>JSON.stringify([typeof k,k]);
function projectOne(p,event){const rules=definition.projections.find(x=>x.id===p.id).rules.filter(r=>r.eventType===event.type);if(!rules.length)return {rows:p.rows,matched:false};const rows=new Map(p.rows.map(r=>[rowKey(r.key),clone(r)]));for(const r of rules){const k=source(r.key,event);if(!key(k))fault("key");const identity=rowKey(k),existing=rows.get(identity);if(r.mode==="create"&&existing)fault("exists");if((r.mode==="update"||r.mode==="delete")&&!existing)fault("missing-entity");if(r.mode==="delete"){rows.delete(identity);continue;}const fields=new Map(Object.entries(existing?.fields??{}));for(const op of r.operations){if(op.op==="unset"){fields.delete(op.field);continue;}if(op.op==="assert"){const v=fields.get(op.field);if(typeof v!=="number"||!Number.isSafeInteger(v)||v<op.min||v>op.max)fault("invariant");continue;}const v=source(op.value,event);if(op.op==="set")fields.set(op.field,clone(v));else if(op.op==="increment"){const before=fields.has(op.field)?fields.get(op.field):0;if(typeof before!=="number"||typeof v!=="number"||!Number.isSafeInteger(before)||!Number.isSafeInteger(v)||!int(before+v,-1000000000000,1000000000000))fault("counter");fields.set(op.field,before+v);}else{const before=fields.has(op.field)?fields.get(op.field):[];if(!Array.isArray(before))fault("array");const values=[...before];if(!values.some(x=>JSON.stringify(x)===JSON.stringify(v)))values.push(clone(v));if(values.length>64)fault("view-capacity");fields.set(op.field,values);}}if(fields.size>32)fault("view-capacity");rows.set(identity,{key:k,fields:Object.fromEntries(fields)});}const result=[...rows.values()];if(result.length>100||new TextEncoder().encode(JSON.stringify(result)).length>262144)fault("view-capacity");return {rows:result,matched:true};}
function summary(s){return {events:s.events.length,streams:new Set(s.events.map(e=>e.stream)).size,commands:s.commands,errors:s.projections.filter(p=>p.error!==null).length,lag:s.projections.reduce((n,p)=>n+s.events.length-p.checkpoint,0),rows:s.projections.reduce((n,p)=>n+p.rows.length,0),skipped:s.metrics.skipped,metrics:{...s.metrics},projections:s.projections.map(p=>({id:p.id,checkpoint:p.checkpoint,lag:s.events.length-p.checkpoint,rows:p.rows.length,applied:p.applied,skipped:p.skipped,error:p.error?{...p.error}:null}))};}
export function createEventStore(initialLog){
 const empty=id=>({id,checkpoint:0,applied:0,skipped:0,error:null,rows:[]});let state={events:[],batches:[],projections:definition.projections.map(p=>empty(p.id)),commands:0,metrics:{appended:0,batches:0,duplicates:0,rejected:0,projected:0,skipped:0,rebuilds:0},journal:[]};
 function catchUp(s,p,limit){let processed=0;p.error=null;while(p.checkpoint<s.events.length&&processed<limit){const raw=s.events[p.checkpoint];try{const event={...raw,...upgrade(raw)},result=projectOne(p,event);p.rows=result.rows;p.checkpoint++;if(result.matched){p.applied++;s.metrics.projected++;}processed++;}catch(e){if(!e.projectionFault&&!e.code)throw e;p.error={position:raw.position,reason:e.code??e.message};break;}}return processed;}
 function execute(s,c){const result=(accepted,reason,processed=0,revision=null)=>{if(!accepted)s.metrics.rejected++;s.journal.push({command:s.commands,type:c.type,reason,position:s.events.length,processed,projectionId:"projectionId"in c?c.projectionId:null});return {accepted,reason,position:s.events.length,processed,revision};};if(c.type==="append"){const current=s.events.filter(e=>e.stream===c.stream).length,ids=c.events.map(e=>e.id);if(new Set(ids).size!==ids.length)return result(false,"id-conflict",0,current);const old=s.events.filter(e=>ids.includes(e.id));if(old.length){if(s.batches.some(b=>JSON.stringify(b)===JSON.stringify(c))){s.metrics.duplicates++;return result(true,"duplicate",0,current);}return result(false,old.length===c.events.length?"id-conflict":"partial-duplicate",0,current);}if(c.expectedRevision!==current)return result(false,"revision",0,current);if(s.events.length+c.events.length>definition.capacity)return result(false,"capacity",0,current);try{c.events.forEach(upgrade);}catch(e){if(e.code)return result(false,e.code==="upcast"?"upcast":"contract",0,current);throw e;}for(let i=0;i<c.events.length;i++)s.events.push({...c.events[i],stream:c.stream,revision:current+i+1,position:s.events.length+1});s.batches.push(clone(c));s.metrics.appended+=c.events.length;s.metrics.batches++;return result(true,"appended",c.events.length,current+c.events.length);}const p=s.projections.find(p=>p.id===c.projectionId);if(!p)return result(false,"projection-missing");if(c.type==="skip"){if(!p.error||p.error.position!==c.position||c.position!==p.checkpoint+1)return result(false,"skip-mismatch");p.checkpoint++;p.skipped++;p.error=null;s.metrics.skipped++;return result(true,"skipped",1);}if(c.type==="rebuild"){const i=s.projections.indexOf(p),fresh=empty(p.id);s.projections[i]=fresh;s.metrics.rebuilds++;const processed=catchUp(s,fresh,500);return result(!fresh.error,fresh.error?"projection-error":"rebuilt",processed);}const processed=catchUp(s,p,c.limit);return result(!p.error,p.error?"projection-error":"projected",processed);}
 if(initialLog!==undefined){for(const b of log(initialLog).batches){const r=execute(state,b);if(!r.accepted||r.reason!=="appended")fail("log");}state.journal=[];}
 return {apply(v){const c=command(v);if(state.commands>=300)fail("limit");const next=clone(state);next.commands++;const r=execute(next,c);state=next;return clone(r);},snapshot:()=>clone(state),summary:()=>summary(state),exportLog:()=>({kind:"rsswag-event-log",version:1,batches:clone(state.batches)}),read(after=0,limit=100){if(!int(after,0,500)||!int(limit,1,100))fail("command");return clone(state.events.filter(e=>e.position>after).slice(0,limit));},view(id){const p=state.projections.find(p=>p.id===id);if(!p)fail("reference");return clone(p);}};
}
export function createEventStoreHandler(store){
 const reply=(status,value,headers={})=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
 return async request=>{try{const url=new URL(request.url),path=url.pathname,isCommand=path==="/event-store/commands",isStatus=path==="/event-store/status",isEvents=path==="/event-store/events",viewPath=path.startsWith("/event-store/views/")?path.slice(19):null;if(!isCommand&&!isStatus&&!isEvents&&!viewPath)return reply(404,{error:"not-found"});const method=isCommand?"POST":"GET";if(request.method!==method)return reply(405,{error:"method"},{allow:method});if(isStatus)return reply(200,store.summary());if(isEvents){const parse=(name,fallback,min,max)=>{if(url.searchParams.getAll(name).length>1)fail("command");const raw=url.searchParams.get(name);if(raw===null)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(raw)||!int(Number(raw),min,max))fail("command");return Number(raw);};return reply(200,{events:store.read(parse("after",0,0,500),parse("limit",100,1,100))});}if(viewPath){try{return reply(200,store.view(decodeURIComponent(viewPath)));}catch(e){if(e.code==="reference")return reply(404,{error:"reference"});throw e;}}if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")return reply(415,{error:"content-type"});let bytes=0,source="";const reader=request.body?.getReader(),decoder=new TextDecoder("utf-8",{fatal:true});if(reader)try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>131072){await reader.cancel();return reply(413,{error:"limit"});}source+=decoder.decode(part.value,{stream:true});}source+=decoder.decode();}finally{reader.releaseLock();}let c;try{c=JSON.parse(source);}catch{return reply(400,{error:"json"});}const decision=store.apply(c);return reply(decision.accepted?200:409,decision);}catch(e){return reply(e?.code==="limit"?413:400,{error:e?.code??"command"});}};
}
`;
export function generateEventStoreOpenApi(value: EventStoreDefinition) {
  const d = normalizeEventDefinition(value),
    id = { type: "string", pattern: "^[A-Za-z0-9_-]+$", maxLength: 80 },
    integer = (minimum: number, maximum: number) => ({
      type: "integer",
      minimum,
      maximum,
    }),
    object = (properties: Record<string, unknown>) => ({
      type: "object",
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    }),
    kind = (type: string, fields: Record<string, unknown>) =>
      object({ type: { type: "string", const: type }, ...fields }),
    response = (description: string) => ({
      description,
      content: { "application/json": { schema: { type: "object" } } },
    }),
    raw = object({
      id,
      type: id,
      version: integer(1, 8),
      payload: {
        type: "object",
        description:
          "4096 UTF-8 bytes, depth 12, 512 nodes. Upcasting and catalog field checks are runtime constraints.",
      },
    });
  return {
    openapi: "3.1.0",
    info: {
      title: `${d.name} API`,
      version: "1.0.0",
      description:
        "RSSwag in-memory event store demonstration. Authenticate/authorize before the Fetch handler; provide durable transactions externally. Captured event and view responses may contain private values.",
    },
    paths: {
      "/event-store/status": {
        get: {
          operationId: "eventStoreStatus",
          responses: { "200": response("Value-free event-store summary") },
        },
      },
      "/event-store/events": {
        get: {
          operationId: "readStoredEvents",
          parameters: [
            { in: "query", name: "after", schema: integer(0, 500) },
            { in: "query", name: "limit", schema: integer(1, 100) },
          ],
          responses: {
            "200": response(
              "Events after an exclusive global position; includes payloads",
            ),
            "400": response("Invalid cursor or limit"),
          },
        },
      },
      "/event-store/views/{projectionId}": {
        get: {
          operationId: "readEventProjection",
          parameters: [
            { in: "path", name: "projectionId", required: true, schema: id },
          ],
          responses: {
            "200": response("Projection checkpoint, error and private rows"),
            "404": response("Unknown projection"),
          },
        },
      },
      "/event-store/commands": {
        post: {
          operationId: "applyEventStoreCommand",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    kind("append", {
                      stream: id,
                      expectedRevision: integer(0, 500),
                      events: {
                        type: "array",
                        minItems: 1,
                        maxItems: 20,
                        items: raw,
                      },
                    }),
                    kind("project", {
                      projectionId: id,
                      limit: integer(1, 500),
                    }),
                    kind("rebuild", { projectionId: id }),
                    kind("skip", {
                      projectionId: id,
                      position: integer(1, 500),
                    }),
                  ],
                },
              },
            },
          },
          responses: {
            "200": response("Accepted command decision"),
            "409": response(
              "Rejected write or projection failure; a projection command can retain its successfully processed prefix",
            ),
            "400": response("Invalid command or JSON"),
            "413": response("Input/count bound exceeded"),
            "415": response("Expected application/json"),
          },
        },
      },
    },
  };
}
