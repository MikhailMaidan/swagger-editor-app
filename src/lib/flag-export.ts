import { normalizeFlagDefinition, type FlagDefinition } from "./flag-model";
export function generateFlagToolkit(value: FlagDefinition) {
  const definition = JSON.stringify(normalizeFlagDefinition(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    "// RSSwag feature-flag evaluator. ES module; Web Crypto SHA-256 required.\n// No network, timers or persistence. Evaluation time is supplied explicitly.\n// Policy includes targeting conditions and variant values; review before sharing.\n// No subject contexts, regression cases, candidate policies or cohort fixtures are embedded.\n// Bucketing is stable for exact key/salt/ID bytes; this is not authorization or an OpenFeature provider.\nconst definition = " +
    definition +
    ";\n" +
    RUNTIME
  );
}
const RUNTIME = String.raw`
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const text=(v,max)=>typeof v==="string"&&v.length<=max&&new TextEncoder().encode(v).length<=max;
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail("limit");for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))fail("definition");return v;};
function json(input,max=8192){let nodes=0;function visit(v,depth){if(depth>12||++nodes>512)fail("limit");if(v===null||typeof v==="boolean"||typeof v==="string")return v;if(typeof v==="number"&&Number.isFinite(v))return Object.is(v,-0)?0:v;if(Array.isArray(v))return list(v,512).map(x=>visit(x,depth+1));if(object(v)){const proto=Object.getPrototypeOf(v);if(proto===null||Object.getPrototypeOf(proto)===null)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k],depth+1)]));}fail("definition");}const value=visit(input,0);if(new TextEncoder().encode(JSON.stringify(value)).length>max)fail("limit");return value;}
function context(v){if(!object(v)||!text(v.key,256)||!v.key.trim()||!object(v.attributes)||typeof v.nowMs!=="number"||!Number.isSafeInteger(v.nowMs)||v.nowMs<0||v.nowMs>4102531200000)fail("context");return {key:v.key,attributes:json(v.attributes),nowMs:v.nowMs};}
function check(c,attributes,index){let value=attributes,found=true;if(c.pointer!=="")for(const encoded of c.pointer.slice(1).split("/")){const key=encoded.replace(/~1/g,"/").replace(/~0/g,"~");if(value===null||typeof value!=="object"||!Object.hasOwn(value,key)||Array.isArray(value)&&!/^(0|[1-9][0-9]*)$/.test(key)){found=false;break;}value=value[key];}const result=(passed,reason=passed?"matched":"different")=>({index,operator:c.operator,passed,reason});if(c.operator==="exists")return result(found);if(c.operator==="absent")return result(!found);if(!found)return result(false,"missing");const right=c.value,equal=(a,b)=>JSON.stringify(json(a))===JSON.stringify(json(b));switch(c.operator){case "equal":return result(equal(value,right));case "notEqual":return result(!equal(value,right));case "in":return Array.isArray(right)?result(right.some(v=>equal(value,v))):result(false,"type");case "contains":return Array.isArray(value)?result(value.some(v=>equal(v,right))):result(false,"type");case "startsWith":return typeof value==="string"&&typeof right==="string"?result(value.startsWith(right)):result(false,"type");default:if(typeof value!=="number"||typeof right!=="number")return result(false,"type");return result(c.operator==="greater"?value>right:c.operator==="greaterOrEqual"?value>=right:c.operator==="less"?value<right:value<=right);}}
async function bucket(flag,domain,key){try{const bytes=new TextEncoder().encode(JSON.stringify(["rsswag-flags-v1",definition.salt,flag.id,flag.salt,domain,key])),digest=await crypto.subtle.digest("SHA-256",bytes);return Math.floor(new DataView(digest).getUint32(0,false)*1000000/4294967296);}catch{fail("crypto");}}
async function evaluate(input,flagIds){
 const c=context(input),ids=flagIds===undefined?definition.flags.map(f=>f.id):list(flagIds,16).map(id=>{if(typeof id!=="string")fail("reference");return id;});if(new Set(ids).size!==ids.length||ids.some(id=>!definition.flags.some(f=>f.id===id)))fail("reference");const memo=new Map(),segments=new Map();
 function segment(id){let cached=segments.get(id);if(!cached){const s=definition.segments.find(s=>s.id===id),checks=s.conditions.map((condition,i)=>check(condition,c.attributes,i));cached={id,matched:checks.every(x=>x.passed),checks};segments.set(id,cached);}return cached;}
 function evaluateFlag(id){const cached=memo.get(id);if(cached)return cached;const promise=decide(id);memo.set(id,promise);return promise;}
 async function decide(id){const flag=definition.flags.find(f=>f.id===id),d={flagId:id,served:false,variantId:null,value:flag.offValue,reason:"disabled",rolloutBucket:null,allocationBucket:null,prerequisites:[],segments:[],rules:[]},used=new Set();const audience=(include,exclude)=>{include.forEach(id=>used.add(id));exclude.forEach(id=>used.add(id));if(exclude.some(id=>segment(id).matched))return "excluded";if(!include.every(id=>segment(id).matched))return "audience";return null;};const finish=(reason,variantId=null)=>{d.reason=reason;d.served=variantId!==null;d.variantId=variantId;d.value=variantId===null?flag.offValue:flag.variants.find(v=>v.id===variantId).value;d.segments=[...used].map(segment);return d;};
 if(!flag.enabled)return finish("disabled");if(flag.startMs!==null&&c.nowMs<flag.startMs||flag.endMs!==null&&c.nowMs>=flag.endMs)return finish("schedule");const blocked=audience(flag.include,flag.exclude);if(blocked)return finish(blocked);
 for(const p of flag.prerequisites){const child=await evaluateFlag(p.flagId),passed=child.served&&child.variantId===p.variantId;d.prerequisites.push({flagId:p.flagId,variantId:child.variantId,passed});if(!passed)return finish("prerequisite");}
 for(const r of flag.rules){const blocked=audience(r.include,r.exclude),checks=r.conditions.map((condition,i)=>check(condition,c.attributes,i));if(blocked){d.rules.push({id:r.id,status:"audience",checks,bucket:null});continue;}if(checks.some(x=>!x.passed)){d.rules.push({id:r.id,status:"conditions",checks,bucket:null});continue;}const n=await bucket(flag,"rule:"+r.id,c.key);if(n>=r.rolloutPpm){d.rules.push({id:r.id,status:"percentage",checks,bucket:n});continue;}d.rules.push({id:r.id,status:"matched",checks,bucket:n});return finish("rule",r.variantId);}
 d.rolloutBucket=await bucket(flag,"rollout",c.key);if(d.rolloutBucket>=flag.rolloutPpm)return finish("rollout");d.allocationBucket=await bucket(flag,"allocation",c.key);let boundary=0;for(const v of flag.variants){boundary+=v.weightPpm;if(d.allocationBucket<boundary)return finish("allocated",v.id);}fail("definition");
 }
 return JSON.parse(JSON.stringify(await Promise.all(ids.map(evaluateFlag))));
}
export function createFlagClient(){return {async evaluate(flagId,input){return (await evaluate(input,[flagId]))[0];},evaluateAll:input=>evaluate(input)};}
`;
