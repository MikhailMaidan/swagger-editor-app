import {
  normalizeTransferResource,
  type TransferResource,
} from "./transfer-project";
/** Literal source avoids serialization of bundler-transformed functions. Payloads are never embedded. */
export function generateTransferToolkit(value: TransferResource): string {
  const r = normalizeTransferResource(value),
    defaults = JSON.stringify({
      contentType: r.contentType,
      lastModified: r.lastModified,
      dateStrong: r.dateStrong,
      ranges: r.ranges,
    })
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  return (
    "// RSSwag bounded byte-range toolkit. ES module for Node.js 22+ / Fetch runtimes.\n" +
    "// No resource payloads, captured responses, URLs or checkpoints are embedded.\n" +
    "// Route/authenticate and evaluate ordinary HTTP preconditions BEFORE calling the responder.\n" +
    "// It implements Range/If-Range for a selected identity-coded representation, not an HTTP server.\n" +
    "// The client requires strong sha256-* ETags and HEAD Content-Length, rejects content codings,\n" +
    "// uses sequential single ranges, rejects redirects, and verifies the complete SHA-256.\n" +
    "// SHA-256 detects byte changes; authenticate the origin separately. Checkpoints contain bytes.\n" +
    "const defaults = " +
    defaults +
    ";\n" +
    RUNTIME
  );
}
const RUNTIME = String.raw`
const MAX=4194304, WIRE=MAX+65536;
const integer=(v,min,max)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const strong=v=>typeof v==="string"&&/^"sha256-[a-f0-9]{64}"$/.test(v);
const type=v=>typeof v==="string"&&v.length<=200&&/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ \t]*[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]+)*$/.test(v);
const date=v=>typeof v==="string"&&v.length===29&&Number.isFinite(Date.parse(v))&&new Date(v).toUTCString()===v;
const ows=v=>v.replace(/^[ \t]+|[ \t]+$/g,"");
const fail=message=>{throw new Error(message);};
const ascii=s=>new TextEncoder().encode(s);
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer)),b=>b.toString(16).padStart(2,"0")).join("");}
function encode(bytes){let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function decode(s,max=MAX){if(typeof s!=="string"||s.length>4*Math.ceil(max/3)||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail("bytes");const out=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(out.length>max||encode(out)!==s)fail("bytes");return out;}
function indexOf(h,n,start=0){outer:for(let i=start;i<=h.length-n.length;i++){for(let j=0;j<n.length;j++)if(h[i+j]!==n[j])continue outer;return i;}return -1;}
function join(pieces){const length=pieces.reduce((n,p)=>n+p.length,0);if(length>WIRE)fail("limit");const out=new Uint8Array(length);let at=0;for(const p of pieces){out.set(p,at);at+=p.length;}return out;}
export function parseByteRanges(header,length){
  const ignored={kind:"ignored",ranges:[]};if(!integer(length,0,MAX))fail("limit");
  if(header===null||!length||typeof header!=="string"||header.length>4096||/[^\t\x20-\x7e]/.test(header))return ignored;
  const matched=/^bytes=(.*)$/i.exec(ows(header));if(!matched)return ignored;
  const members=matched[1].split(",").map(ows).filter(Boolean);if(!members.length||members.length>16)return ignored;
  const n=BigInt(length),found=[];
  for(let order=0;order<members.length;order++){
    const m=/^(\d{1,80})?-(\d{1,80})?$/.exec(members[order]);if(!m||!m[1]&&!m[2])return ignored;
    if(!m[1]){const count=BigInt(m[2]);if(count===0n)continue;found.push({start:count>=n?0:Number(n-count),end:length-1,order});}
    else{const start=BigInt(m[1]),end=m[2]?BigInt(m[2]):n-1n;if(m[2]&&end<start)return ignored;if(start>=n)continue;found.push({start:Number(start),end:Number(end>=n?n-1n:end),order});}
  }
  if(!found.length)return {kind:"unsatisfiable",ranges:[]};const merged=[];
  for(const r of found.sort((a,b)=>a.start-b.start)){const p=merged.at(-1);if(p&&r.start<=p.end+1){p.end=Math.max(p.end,r.end);p.order=Math.min(p.order,r.order);}else merged.push({...r});}
  return {kind:"ranges",ranges:merged.sort((a,b)=>a.order-b.order).map(({start,end})=>({start,end}))};
}
function serve(resource,request){
  const {bytes}=resource,headers={"Accept-Ranges":resource.ranges?"bytes":"none",ETag:resource.etag,"Content-Type":resource.contentType};
  if(resource.lastModified)headers["Last-Modified"]=resource.lastModified;
  const response=(status,body,ranges,reason)=>({status,headers:{...headers,"Content-Length":String(body.length)},body,ranges,reason});
  if(request.method!=="GET"&&request.method!=="HEAD"){headers.Allow="GET, HEAD";return response(405,new Uint8Array(),[],"method");}
  if(request.method==="HEAD")return {...response(200,new Uint8Array(),[],"head"),headers:{...headers,"Content-Length":String(bytes.length)}};
  const full=reason=>response(200,bytes.slice(),[],reason);
  if(!resource.ranges||request.range===null||!bytes.length)return full("full");
  if(request.ifRange!==null){const v=ows(request.ifRange);if(v!==resource.etag&&!(resource.dateStrong&&resource.lastModified!==null&&date(v)&&v===resource.lastModified))return full("validator");}
  const parsed=parseByteRanges(request.range,bytes.length);if(parsed.kind==="ignored")return full("ignored");
  if(parsed.kind==="unsatisfiable"){headers["Content-Range"]="bytes */"+bytes.length;return response(416,new Uint8Array(),[],"unsatisfiable");}
  const ranges=parsed.ranges;
  if(ranges.length===1){const r=ranges[0];headers["Content-Range"]="bytes "+r.start+"-"+r.end+"/"+bytes.length;return response(206,bytes.slice(r.start,r.end+1),ranges,"single");}
  let boundary="";for(let i=0;i<64;i++){const c="rsswag_"+resource.etag.slice(8,40)+"_"+i;if(indexOf(bytes,ascii(c))<0){boundary=c;break;}}
  if(!boundary)return full("ignored");headers["Content-Type"]="multipart/byteranges; boundary="+boundary;
  const pieces=ranges.flatMap(r=>[ascii("--"+boundary+"\r\nContent-Type: "+resource.contentType+"\r\nContent-Range: bytes "+r.start+"-"+r.end+"/"+bytes.length+"\r\n\r\n"),bytes.slice(r.start,r.end+1),ascii("\r\n")]);
  pieces.push(ascii("--"+boundary+"--\r\n"));return response(206,join(pieces),ranges,"multipart");
}
export async function createByteRangeResponder(input,options={}){
  if(!(input instanceof Uint8Array)||input.length>MAX)fail("bytes");
  const config={...defaults,...options};if(!type(config.contentType)||!(config.lastModified===null||date(config.lastModified))||typeof config.dateStrong!=="boolean"||typeof config.ranges!=="boolean")fail("metadata");
  const bytes=new Uint8Array(input),resource={...config,bytes,etag:'"sha256-'+await digest(bytes)+'"'};
  return request=>{const result=serve(resource,{method:request.method,range:request.headers.get("Range"),ifRange:request.headers.get("If-Range")});return new Response(request.method==="HEAD"?null:result.body,{status:result.status,headers:result.headers});};
}
function contentRange(value){const m=/^bytes (\d{1,16})-(\d{1,16})\/(\d{1,16})$/.exec(value);if(!m)fail("packet");const [start,end,total]=m.slice(1).map(Number);if(!integer(total,1,MAX)||!integer(start,0,total-1)||!integer(end,start,total-1))fail("packet");return {start,end,total};}
// Inspect a bounded identity-coded GET/HEAD packet. Body is canonical base64.
export function inspectRangeResponse(value){
  if(!object(value)||value.kind!=="rsswag-range-response"||value.version!==1||!["GET","HEAD"].includes(value.method)||!integer(value.status,100,599)||!object(value.headers))fail("packet");
  if(Object.keys(value.headers).length>32)fail("limit");const headers=Object.create(null);
  for(const [key,v] of Object.entries(value.headers)){const k=key.toLowerCase();if(!/^[A-Za-z0-9-]{1,80}$/.test(key)||typeof v!=="string"||v.length>4096||/[^\t\x20-\x7e]/.test(v)||Object.hasOwn(headers,k))fail("packet");headers[k]=v;}
  const body=decode(value.base64,WIRE),status=value.status,length=headers["content-length"];
  if(length!==undefined&&(!/^\d{1,16}$/.test(length)||!integer(Number(length),0,WIRE)))fail("packet");
  if(value.method==="HEAD"){if(body.length||status!==200||length!==undefined&&Number(length)>MAX)fail("packet");return {status,total:length===undefined?null:Number(length),parts:[],body,multipart:false,headers};}
  if(length!==undefined&&Number(length)!==body.length)fail("packet");if(headers["content-encoding"]&&headers["content-encoding"].toLowerCase()!=="identity")fail("packet");
  if(status===200){if(body.length>MAX||headers["content-range"]!==undefined)fail("packet");return {status,total:body.length,parts:[],body,multipart:false,headers};}
  if(status===416){const m=/^bytes \*\/(\d{1,16})$/.exec(headers["content-range"]||"");if(!m||!integer(Number(m[1]),0,MAX))fail("packet");return {status,total:Number(m[1]),parts:[],body,multipart:false,headers};}
  if(status!==206)fail("packet");const t=headers["content-type"]||"";
  if(!/^multipart\/byteranges(?:;|$)/i.test(t)){const r=contentRange(headers["content-range"]||"");if(body.length!==r.end-r.start+1||!type(t))fail("packet");return {status,total:r.total,parts:[{...r,contentType:t,bytes:body.slice()}],body,multipart:false,headers};}
  if(headers["content-range"]!==undefined)fail("packet");
  const m=/^multipart\/byteranges;[ \t]*boundary=(?:"([A-Za-z0-9_-]{1,70})"|([A-Za-z0-9_-]{1,70}))$/i.exec(t);if(!m)fail("packet");
  const boundary=m[1]||m[2],marker=ascii("--"+boundary),separator=ascii("\r\n\r\n"),parts=[];let at=0,total=null;
  while(true){
    if(indexOf(body,marker,at)!==at)fail("packet");at+=marker.length;
    if(body[at]===45&&body[at+1]===45){at+=2;if(body[at]===13&&body[at+1]===10)at+=2;if(at!==body.length||!parts.length)fail("packet");break;}
    if(body[at++]!==13||body[at++]!==10||parts.length>=16)fail("packet");const end=indexOf(body,separator,at);if(end<at||end-at>1024)fail("packet");
    let text;try{text=new TextDecoder("utf-8",{fatal:true}).decode(body.slice(at,end));}catch{fail("packet");}const fields=Object.create(null);
    for(const line of text.split("\r\n")){const i=line.indexOf(":"),key=line.slice(0,i).toLowerCase(),v=ows(line.slice(i+1));if(i<1||!["content-range","content-type"].includes(key)||Object.hasOwn(fields,key)||/[^\x20-\x7e]/.test(v))fail("packet");fields[key]=v;}
    const r=contentRange(fields["content-range"]||"");if(!type(fields["content-type"])||total!==null&&total!==r.total)fail("packet");total=r.total;at=end+4;
    const length=r.end-r.start+1;if(at+length+2>body.length)fail("packet");const bytes=body.slice(at,at+length);if(indexOf(bytes,ascii("\r\n--"+boundary))>=0)fail("packet");
    parts.push({...r,contentType:fields["content-type"],bytes});at+=length;if(body[at++]!==13||body[at++]!==10)fail("packet");
  }
  return {status,total,parts,body,multipart:true,headers};
}
export function normalizeCheckpoint(value){
  if(!object(value)||value.kind!=="rsswag-transfer-checkpoint"||value.version!==1||!strong(value.etag)||!integer(value.total,0,MAX)||!Array.isArray(value.segments)||value.segments.length>200)fail("checkpoint");
  const segments=[];for(let i=0;i<value.segments.length;i++){if(!Object.hasOwn(value.segments,i))fail("checkpoint");const s=value.segments[i];if(!object(s)||!integer(s.start,0,Math.max(0,value.total-1)))fail("checkpoint");const bytes=decode(s.base64);if(!bytes.length||s.start+bytes.length>value.total)fail("checkpoint");segments.push({start:s.start,base64:s.base64,length:bytes.length});}
  segments.sort((a,b)=>a.start-b.start);for(let i=1;i<segments.length;i++)if(segments[i-1].start+segments[i-1].length>segments[i].start)fail("checkpoint");
  return {kind:value.kind,version:1,etag:value.etag,total:value.total,segments:segments.map(({start,base64})=>({start,base64}))};
}
function assembly(etag,total,checkpoint){
  let state=normalizeCheckpoint(checkpoint||{kind:"rsswag-transfer-checkpoint",version:1,etag,total,segments:[]}),segments=state.segments.map(s=>({start:s.start,bytes:decode(s.base64)}));
  const reset=(tag,length)=>{state={kind:"rsswag-transfer-checkpoint",version:1,etag:tag,total:length,segments:[]};segments=[];};
  const initialRestart=state.etag!==etag||state.total!==total;if(initialRestart)reset(etag,total);
  const covered=()=>segments.reduce((n,s)=>n+s.bytes.length,0);
  function next(chunk){let start=0;for(const s of segments){if(s.start>start)return {start,end:Math.min(start+chunk-1,s.start-1,state.total-1)};start=s.start+s.bytes.length;}return start<state.total?{start,end:Math.min(start+chunk-1,state.total-1)}:null;}
  function accept(packet,requested){
    let p;try{p=inspectRangeResponse(packet);}catch{return {accepted:false,restart:false};}const tag=p.headers.etag;if(!strong(tag))return {accepted:false,restart:false};
    if(p.status===200){const restart=tag!==state.etag||p.total!==state.total;reset(tag,p.total);segments=p.body.length?[{start:0,bytes:p.body.slice()}]:[];return {accepted:true,restart};}
    if(p.status!==206||p.multipart||p.parts.length!==1||tag!==state.etag||p.total!==state.total)return {accepted:false,restart:false};const part=p.parts[0];
    if(part.start!==requested.start||part.end!==requested.end||segments.some(s=>part.start<s.start+s.bytes.length&&part.end>=s.start))return {accepted:false,restart:false};
    const all=[...segments,{start:part.start,bytes:part.bytes.slice()}].sort((a,b)=>a.start-b.start),merged=[];
    for(const s of all){const p=merged.at(-1);if(p&&p.start+p.bytes.length===s.start){const b=new Uint8Array(p.bytes.length+s.bytes.length);b.set(p.bytes);b.set(s.bytes,p.bytes.length);p.bytes=b;}else merged.push({...s});}segments=merged;return {accepted:true,restart:false};
  }
  return {next,accept,covered,initialRestart,metadata:()=>({etag:state.etag,total:state.total}),checkpoint:()=>({...state,segments:segments.map(s=>({start:s.start,base64:encode(s.bytes)}))}),bytes:()=>{if(covered()!==state.total)fail("checkpoint");const out=new Uint8Array(state.total);for(const s of segments)out.set(s.bytes,s.start);return out;}};
}
async function readLimited(response){
  const value=response.headers.get("Content-Length");if(value!==null&&(!/^\d{1,16}$/.test(value)||!integer(Number(value),0,MAX))) {await response.body?.cancel();fail("limit");}
  if(!response.body)return new Uint8Array();const reader=response.body.getReader(),pieces=[];let count=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>MAX){await reader.cancel();fail("limit");}pieces.push(value);}}finally{reader.releaseLock();}
  return join(pieces);
}
// Calling this function explicitly sends HEAD/GET traffic. No module-import side effects.
export async function downloadBytes(url,options={}){
  const target=new URL(url);if(!["http:","https:"].includes(target.protocol)||target.username||target.password)fail("url");
  const chunkSize=options.chunkSize??65536,maxAttempts=options.maxAttempts??100,deadlineMs=options.deadlineMs??300000;
  if(!integer(chunkSize,1,1048576)||!integer(maxAttempts,1,200)||!integer(deadlineMs,1,600000))fail("limit");
  const checkpoint=options.checkpoint?normalizeCheckpoint(options.checkpoint):undefined,fetcher=options.fetch??globalThis.fetch;
  const controller=new AbortController(),abort=()=>controller.abort(options.signal.reason);
  if(options.signal?.aborted)abort();else options.signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error("deadline")),deadlineMs);
  try{
    const common={redirect:"error",credentials:"omit",cache:"no-store",signal:controller.signal},headers=new Headers(options.headers);
    for(const key of ["Range","If-Range","If-Match","If-None-Match","If-Modified-Since","If-Unmodified-Since"])headers.delete(key);
    headers.set("Accept-Encoding","identity");
    if(controller.signal.aborted)throw controller.signal.reason;
    const head=await fetcher(target.href,{...common,method:"HEAD",headers}),etag=head.headers.get("ETag"),length=head.headers.get("Content-Length"),coding=head.headers.get("Content-Encoding");
    await head.body?.cancel();
    if(head.status!==200||!strong(etag)||length===null||!/^\d{1,16}$/.test(length)||!integer(Number(length),0,MAX)||coding&&coding.toLowerCase()!=="identity")fail("metadata");
    const state=assembly(etag,Number(length),checkpoint);let attempts=0,rejected=0,restarts=Number(state.initialRestart),wireBytes=0;
    for(;attempts<maxAttempts;){
      if(controller.signal.aborted)throw controller.signal.reason;
      const requested=state.next(chunkSize);if(!requested)break;attempts++;
      const requestHeaders=new Headers(headers);requestHeaders.set("Range","bytes="+requested.start+"-"+requested.end);requestHeaders.set("If-Range",state.metadata().etag);
      let accepted=false;
      try{
        const response=await fetcher(target.href,{...common,method:"GET",headers:requestHeaders}),body=await readLimited(response);wireBytes+=body.length;
        const decision=state.accept({kind:"rsswag-range-response",version:1,method:"GET",status:response.status,headers:Object.fromEntries(response.headers),base64:encode(body)},requested);
        accepted=decision.accepted;if(decision.restart)restarts++;
      }catch(error){if(controller.signal.aborted)throw controller.signal.reason;}
      if(!accepted)rejected++;
      options.onProgress?.({attempts,rejected,restarts,wireBytes,covered:state.covered(),total:state.metadata().total});
    }
    if(controller.signal.aborted)throw controller.signal.reason;
    let outcome="exhausted",bytes=null;
    if(state.covered()===state.metadata().total){const value=state.bytes();outcome='"sha256-'+await digest(value)+'"'===state.metadata().etag?"complete":"integrity-failed";if(outcome==="complete")bytes=value;}
    if(controller.signal.aborted)throw controller.signal.reason;
    return {outcome,attempts,rejected,restarts,wireBytes,covered:state.covered(),total:state.metadata().total,checkpoint:state.checkpoint(),bytes};
  }finally{clearTimeout(timer);options.signal?.removeEventListener("abort",abort);}
}
`;
