import { createClient } from '@supabase/supabase-js'
import { createSharedCookieStorage } from './sharedAuthStorage'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:createSharedCookieStorage()}}) : null
export const getShowId = () => { const p=new URLSearchParams(location.search); return p.get('show')||p.get('showId')||'' }
export const getShowName = () => { const p=new URLSearchParams(location.search); return p.get('showName')||'EL DORADO' }
export async function getSession(){ if(!supabase)return null; const {data,error}=await supabase.auth.getSession(); if(error)throw error; return data.session }

const budgetTokens = new Map<string,string>()
const keyFor = (locationId:string) => `budget-location:${locationId}`
const tokenFor = (showId:string,locationId:string) => `${showId}:${locationId}`
const same = (a:any,b:any) => JSON.stringify(a)===JSON.stringify(b)
const cleanBudget = (budget:any) => { const {__remoteUpdatedAt,...rest}=budget||{}; return rest }
const normalize = (v:any) => String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')

async function allBudgetRows(showId:string){
  if(!supabase)return[]
  const [{data:legacy,error:legacyError},{data:scoped,error:scopedError},{data:meta,error:metaError}] = await Promise.all([
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).eq('tool_key','budget').maybeSingle(),
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).like('tool_key','budget-location:%'),
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).eq('tool_key','budget-meta').maybeSingle(),
  ])
  if(legacyError)throw legacyError;if(scopedError)throw scopedError;if(metaError)throw metaError
  return {legacy,scoped:scoped||[],meta}
}

async function resolveLegacyBudgetIds(showId:string,budgets:any[]){
  if(!supabase||!budgets.length)return budgets
  const {data:locations,error}=await supabase.from('production_locations').select('id,episode_id,episode_name,set_name,location_name').eq('show_id',showId)
  if(error)throw error
  return budgets.map(b=>{
    if(b.sharedLocationId)return b
    const exact=(locations||[]).filter((r:any)=>normalize(r.episode_name||r.episode_id)===normalize(b.episode) && normalize(r.set_name)===normalize(b.setName) && normalize(r.location_name)===normalize(b.location))
    const setMatch=exact.length===1?exact:(locations||[]).filter((r:any)=>normalize(r.episode_name||r.episode_id)===normalize(b.episode) && normalize(r.set_name)===normalize(b.setName))
    const match=setMatch.length===1?setMatch[0]:null
    return match?{...b,sharedLocationId:match.id}:b
  })
}

async function ensureLocationId(showId:string,budget:any){
  if(budget.sharedLocationId)return budget.sharedLocationId
  if(!supabase)throw new Error('Supabase unavailable')
  const {data,error}=await supabase.from('production_locations').insert({show_id:showId,episode_id:budget.episode||null,episode_name:budget.episode||null,set_name:budget.setName||'',location_name:budget.location||'Untitled Location',address:budget.address||'',contact_name:budget.contact||'',contact_phone:budget.phone||'',status:'Budget Draft',source:'budget',metadata:{created_from:'budget',scenes:budget.scenes||budget.setNumber||''}}).select('id').single()
  if(error)throw error
  budget.sharedLocationId=data.id
  return data.id
}

export async function loadBibleDocument(showId:string){
  if(!supabase)return null
  const [{data:legacy,error:legacyError},{data:scoped,error:scopedError}] = await Promise.all([
    supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key','bible').maybeSingle(),
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).like('tool_key','bible-location:%'),
  ])
  if(legacyError)throw legacyError;if(scopedError)throw scopedError
  if(!scoped?.length)return legacy
  const bibles:any = {...(legacy?.payload?.bibles||{})}; const commitments:any = {}
  for(const row of scoped){const record=row.payload?.record||row.payload;if(!record)continue;const id=record.id||record.bibleId||row.tool_key.slice('bible-location:'.length);bibles[id]=record;Object.assign(commitments,record.commitments||{})}
  return {payload:{...(legacy?.payload||{}),bibles,commitments},updated_at:scoped.map((r:any)=>r.updated_at).sort().at(-1)||legacy?.updated_at}
}

export async function loadBudgetDocument(showId:string){
  if(!supabase)return null
  const rows:any=await allBudgetRows(showId)
  let legacyBudgets:any[] = Array.isArray(rows.legacy?.payload?.budgets)?rows.legacy.payload.budgets:[]
  legacyBudgets=await resolveLegacyBudgetIds(showId,legacyBudgets)
  const byLocation=new Map<string,any>()
  for(const b of legacyBudgets){if(b.sharedLocationId)byLocation.set(b.sharedLocationId,b)}
  for(const row of rows.scoped){const locationId=row.tool_key.slice('budget-location:'.length);const budget={...(row.payload?.budget||row.payload),sharedLocationId:locationId,__remoteUpdatedAt:row.updated_at};byLocation.set(locationId,budget);budgetTokens.set(tokenFor(showId,locationId),row.updated_at)}
  const migrated=legacyBudgets.filter(b=>b.sharedLocationId&&!rows.scoped.some((r:any)=>r.tool_key===keyFor(b.sharedLocationId)))
  for(const budget of migrated){const locationId=budget.sharedLocationId;const {data,error}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:keyFor(locationId),payload:{version:2,locationId,budget:cleanBudget(budget),migratedFrom:'budget'}},{onConflict:'show_id,tool_key'}).select('updated_at').single();if(error)throw error;budgetTokens.set(tokenFor(showId,locationId),data.updated_at);byLocation.set(locationId,{...budget,__remoteUpdatedAt:data.updated_at})}
  const unlinked=legacyBudgets.filter(b=>!b.sharedLocationId)
  return {payload:{version:2,budgets:[...byLocation.values(),...unlinked],cities:rows.meta?.payload?.cities??rows.legacy?.payload?.cities,vendors:rows.meta?.payload?.vendors??rows.legacy?.payload?.vendors,migration:{unlinkedBudgetCount:unlinked.length}},updated_at:[...rows.scoped.map((r:any)=>r.updated_at),rows.meta?.updated_at,rows.legacy?.updated_at].filter(Boolean).sort().at(-1)}
}

export async function saveBudgetDocument(showId:string,payload:any){
  if(!supabase)return null
  const budgets=Array.isArray(payload?.budgets)?payload.budgets:[]
  const {data:meta,error:metaError}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:'budget-meta',payload:{version:2,cities:payload?.cities||[],vendors:payload?.vendors||[]}},{onConflict:'show_id,tool_key'}).select('updated_at').single()
  if(metaError)throw metaError
  let latest=meta.updated_at; const conflicts:string[]=[]
  for(const budget of budgets){
    const locationId=await ensureLocationId(showId,budget); const toolKey=keyFor(locationId); const local=cleanBudget({...budget,sharedLocationId:locationId})
    const {data:current,error:currentError}=await supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key',toolKey).maybeSingle();if(currentError)throw currentError
    const known=budgetTokens.get(tokenFor(showId,locationId))||budget.__remoteUpdatedAt||''
    const remoteBudget=current?.payload?.budget||current?.payload||null
    if(current&&known&&current.updated_at!==known&&!same(cleanBudget(remoteBudget),local)){conflicts.push(locationId);continue}
    if(current&&!known&&!same(cleanBudget(remoteBudget),local)){conflicts.push(locationId);continue}
    const {data,error}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:toolKey,payload:{version:2,locationId,budget:local}},{onConflict:'show_id,tool_key'}).select('updated_at').single();if(error)throw error
    budgetTokens.set(tokenFor(showId,locationId),data.updated_at);budget.__remoteUpdatedAt=data.updated_at;latest=data.updated_at||latest
  }
  if(conflicts.length)console.warn('Skipped stale budget locations',conflicts)
  return {updated_at:latest,conflicts}
}

export async function loadSharedLocations(showId:string){ if(!supabase)return[]; const {data,error}=await supabase.from('production_locations').select('*').eq('show_id',showId).order('created_at'); if(error)throw error; return (data||[]).filter((r:any)=>!r.metadata?.archived_at) }
export async function archiveLocation(locationId:string){if(!supabase)throw new Error('Supabase unavailable');const {data:row,error:loadError}=await supabase.from('production_locations').select('metadata,status').eq('id',locationId).single();if(loadError)throw loadError;const {error}=await supabase.from('production_locations').update({status:'Archived',metadata:{...(row.metadata||{}),archived_at:new Date().toISOString(),archived_from_status:row.status||null}}).eq('id',locationId);if(error)throw error}
export async function permanentlyDeleteLocation(showId:string,locationId:string,reason='Permanent delete'){if(!supabase)throw new Error('Supabase unavailable');const {data:linked,error:linkedError}=await supabase.from('tool_documents').select('tool_key,payload').eq('show_id',showId).or(`tool_key.eq.${keyFor(locationId)},tool_key.eq.bible-location:${locationId}`);if(linkedError)throw linkedError;const tombstone={version:1,locationId,deletedAt:new Date().toISOString(),reason,linkedKeys:(linked||[]).map((x:any)=>x.tool_key)};const {error:tombError}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:`location-tombstone:${locationId}`,payload:tombstone},{onConflict:'show_id,tool_key'});if(tombError)throw tombError;if(linked?.length){const {error}=await supabase.from('tool_documents').delete().eq('show_id',showId).in('tool_key',linked.map((x:any)=>x.tool_key));if(error)throw error}const {error}=await supabase.from('production_locations').delete().eq('show_id',showId).eq('id',locationId);if(error)throw error}
export function subscribeBudget(showId:string,cb:()=>void){ if(!supabase||!showId)return()=>{}; const ch=supabase.channel(`budget-connected:${showId}`).on('postgres_changes',{event:'*',schema:'public',table:'production_locations',filter:`show_id=eq.${showId}`},cb).on('postgres_changes',{event:'*',schema:'public',table:'tool_documents',filter:`show_id=eq.${showId}`},(p:any)=>{const k=p.new?.tool_key||p.old?.tool_key||'';if(k==='budget'||k==='budget-meta'||k.startsWith('budget-location:')||k.startsWith('bible-location:'))cb()}).subscribe(); return()=>{supabase.removeChannel(ch)} }
