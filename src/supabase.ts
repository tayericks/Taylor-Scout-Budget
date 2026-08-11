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
const budgetMetaTokens = new Map<string,string>()
const loadedBudgetIds = new Map<string,Map<string,string>>()
const loadedBudgetTombstones = new Map<string,Set<string>>()
const keyFor = (locationId:string) => `budget-location:${locationId}`
const bibleKey = (locationId:string) => `bible-location:${locationId}`
const budgetTombstoneKey = (locationId:string) => `budget-tombstone:${locationId}`
const locationTombstoneKey = (locationId:string) => `location-tombstone:${locationId}`
const revisionKey = (locationId:string) => `budget-revision:${locationId}:${Date.now()}:${crypto.randomUUID()}`
const tokenFor = (showId:string,locationId:string) => `${showId}:${locationId}`
const same = (a:any,b:any) => JSON.stringify(a)===JSON.stringify(b)
const cleanBudget = (budget:any) => { const {__remoteUpdatedAt,...rest}=budget||{}; return rest }
const normalize = (v:any) => String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')
const latestOf = (values:any[]) => { const sorted=values.filter(Boolean).sort(); return sorted.length?sorted[sorted.length-1]:undefined }

async function allBudgetRows(showId:string){
  if(!supabase)return {legacy:null,scoped:[],meta:null,locationTombstones:[],budgetTombstones:[]}
  const [{data:legacy,error:legacyError},{data:scoped,error:scopedError},{data:meta,error:metaError},{data:locationTombstones,error:locationTombError},{data:budgetTombstones,error:budgetTombError}] = await Promise.all([
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).eq('tool_key','budget').maybeSingle(),
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).like('tool_key','budget-location:%'),
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).eq('tool_key','budget-meta').maybeSingle(),
    supabase.from('tool_documents').select('tool_key').eq('show_id',showId).like('tool_key','location-tombstone:%'),
    supabase.from('tool_documents').select('tool_key,payload').eq('show_id',showId).like('tool_key','budget-tombstone:%'),
  ])
  if(legacyError)throw legacyError;if(scopedError)throw scopedError;if(metaError)throw metaError;if(locationTombError)throw locationTombError;if(budgetTombError)throw budgetTombError
  return {legacy,scoped:scoped||[],meta,locationTombstones:locationTombstones||[],budgetTombstones:budgetTombstones||[]}
}

async function lifecycleState(showId:string,locationId:string){
  if(!supabase)return {location:null,locationDeleted:false,budgetDeleted:false}
  const [{data:location,error:locationError},{data:locationTomb,error:locationTombError},{data:budgetTomb,error:budgetTombError}] = await Promise.all([
    supabase.from('production_locations').select('id,metadata,status').eq('show_id',showId).eq('id',locationId).maybeSingle(),
    supabase.from('tool_documents').select('tool_key').eq('show_id',showId).eq('tool_key',locationTombstoneKey(locationId)).maybeSingle(),
    supabase.from('tool_documents').select('tool_key').eq('show_id',showId).eq('tool_key',budgetTombstoneKey(locationId)).maybeSingle(),
  ])
  if(locationError)throw locationError;if(locationTombError)throw locationTombError;if(budgetTombError)throw budgetTombError
  return {location,locationDeleted:Boolean(locationTomb),budgetDeleted:Boolean(budgetTomb)}
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
  const [{data:legacy,error:legacyError},{data:scoped,error:scopedError},{data:locationTombstones,error:locationTombError}] = await Promise.all([
    supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key','bible').maybeSingle(),
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).like('tool_key','bible-location:%'),
    supabase.from('tool_documents').select('tool_key').eq('show_id',showId).like('tool_key','location-tombstone:%'),
  ])
  if(legacyError)throw legacyError;if(scopedError)throw scopedError;if(locationTombError)throw locationTombError
  if(!scoped?.length)return legacy
  const deleted=new Set((locationTombstones||[]).map((x:any)=>x.tool_key.slice('location-tombstone:'.length)))
  const bibles:any = {}; const commitments:any = {}
  for(const [id,record] of Object.entries(legacy?.payload?.bibles||{})){const r:any=record;if(!deleted.has(r?.locationId||r?.location?.id))bibles[id]=r}
  for(const row of scoped){const locationId=row.tool_key.slice('bible-location:'.length);if(deleted.has(locationId))continue;const record=row.payload?.record||row.payload;if(!record)continue;const id=record.id||record.bibleId||locationId;bibles[id]=record;Object.assign(commitments,record.commitments||{})}
  return {payload:{...(legacy?.payload||{}),bibles,commitments},updated_at:latestOf(scoped.map((r:any)=>r.updated_at))||legacy?.updated_at}
}

export async function loadBudgetDocument(showId:string){
  if(!supabase)return null
  const rows:any=await allBudgetRows(showId)
  if(rows.meta?.updated_at)budgetMetaTokens.set(showId,rows.meta.updated_at)
  const locationDeleted=new Set<string>((rows.locationTombstones||[]).map((x:any)=>x.tool_key.slice('location-tombstone:'.length)))
  const budgetDeleted=new Set<string>((rows.budgetTombstones||[]).map((x:any)=>x.tool_key.slice('budget-tombstone:'.length)))
  loadedBudgetTombstones.set(showId,new Set(budgetDeleted))
  let legacyBudgets:any[] = Array.isArray(rows.legacy?.payload?.budgets)?rows.legacy.payload.budgets:[]
  legacyBudgets=await resolveLegacyBudgetIds(showId,legacyBudgets)
  legacyBudgets=legacyBudgets.filter(b=>!b.sharedLocationId||(!locationDeleted.has(b.sharedLocationId)&&!budgetDeleted.has(b.sharedLocationId)))
  const byLocation=new Map<string,any>(),known=new Map<string,string>()
  for(const b of legacyBudgets){if(b.sharedLocationId)byLocation.set(b.sharedLocationId,b)}
  for(const row of rows.scoped){const locationId=row.tool_key.slice('budget-location:'.length);if(locationDeleted.has(locationId)||budgetDeleted.has(locationId))continue;const budget={...(row.payload?.budget||row.payload),sharedLocationId:locationId,__remoteUpdatedAt:row.updated_at};byLocation.set(locationId,budget);budgetTokens.set(tokenFor(showId,locationId),row.updated_at);known.set(locationId,row.updated_at)}
  const migrated=legacyBudgets.filter(b=>b.sharedLocationId&&!rows.scoped.some((r:any)=>r.tool_key===keyFor(b.sharedLocationId)))
  for(const budget of migrated){const locationId=budget.sharedLocationId;const state=await lifecycleState(showId,locationId);if(state.locationDeleted||state.budgetDeleted||!state.location)continue;const {data,error}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:keyFor(locationId),payload:{version:2,locationId,budget:cleanBudget(budget),migratedFrom:'budget'}},{onConflict:'show_id,tool_key'}).select('updated_at').single();if(error)throw error;budgetTokens.set(tokenFor(showId,locationId),data.updated_at);known.set(locationId,data.updated_at);byLocation.set(locationId,{...budget,__remoteUpdatedAt:data.updated_at})}
  loadedBudgetIds.set(showId,known)
  const unlinked=legacyBudgets.filter(b=>!b.sharedLocationId)
  return {payload:{version:2,budgets:[...byLocation.values(),...unlinked],cities:rows.meta?.payload?.cities??rows.legacy?.payload?.cities,vendors:rows.meta?.payload?.vendors??rows.legacy?.payload?.vendors,migration:{unlinkedBudgetCount:unlinked.length}},updated_at:latestOf([...rows.scoped.map((r:any)=>r.updated_at),rows.meta?.updated_at,rows.legacy?.updated_at])}
}

export async function saveBudgetDocument(showId:string,payload:any){
  if(!supabase)return null
  const budgets=Array.isArray(payload?.budgets)?payload.budgets:[];let latest:any=null;const conflicts:string[]=[]
  const localMeta={version:2,cities:payload?.cities||[],vendors:payload?.vendors||[]};const{data:currentMeta,error:currentMetaError}=await supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key','budget-meta').maybeSingle();if(currentMetaError)throw currentMetaError;const knownMeta=budgetMetaTokens.get(showId)||'';if(currentMeta&&same(currentMeta.payload,localMeta)){budgetMetaTokens.set(showId,currentMeta.updated_at);latest=currentMeta.updated_at}else if(currentMeta&&(!knownMeta||currentMeta.updated_at!==knownMeta)){conflicts.push('budget-meta');latest=currentMeta.updated_at}else{const{data:meta,error:metaError}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:'budget-meta',payload:localMeta},{onConflict:'show_id,tool_key'}).select('updated_at').single();if(metaError)throw metaError;budgetMetaTokens.set(showId,meta.updated_at);latest=meta.updated_at}
  const presentLocations=new Set<string>();const known=loadedBudgetIds.get(showId)||new Map<string,string>();const tombstonesAtLoad=loadedBudgetTombstones.get(showId)||new Set<string>()
  for(const budget of budgets){
    const locationId=await ensureLocationId(showId,budget);presentLocations.add(locationId);let state=await lifecycleState(showId,locationId);if(state.locationDeleted||!state.location||state.location.metadata?.archived_at){conflicts.push(locationId);continue}if(state.budgetDeleted){if(!tombstonesAtLoad.has(locationId)){conflicts.push(locationId);continue}const{error:clearError}=await supabase.from('tool_documents').delete().eq('show_id',showId).eq('tool_key',budgetTombstoneKey(locationId));if(clearError)throw clearError;tombstonesAtLoad.delete(locationId);state={...state,budgetDeleted:false}}
    const toolKey=keyFor(locationId); const local=cleanBudget({...budget,sharedLocationId:locationId})
    const {data:current,error:currentError}=await supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key',toolKey).maybeSingle();if(currentError)throw currentError
    const knownToken=budgetTokens.get(tokenFor(showId,locationId))||budget.__remoteUpdatedAt||''
    const remoteBudget=current?.payload?.budget||current?.payload||null
    if(current&&same(cleanBudget(remoteBudget),local)){budgetTokens.set(tokenFor(showId,locationId),current.updated_at);known.set(locationId,current.updated_at);budget.__remoteUpdatedAt=current.updated_at;latest=current.updated_at||latest;continue}
    if(current&&knownToken&&current.updated_at!==knownToken){conflicts.push(locationId);continue}
    if(current&&!knownToken){conflicts.push(locationId);continue}
    if(current){
      const {error:revisionError}=await supabase.from('tool_documents').insert({show_id:showId,tool_key:revisionKey(locationId),payload:{version:1,locationId,savedAt:new Date().toISOString(),previousUpdatedAt:current.updated_at,budgetSnapshot:current.payload}})
      if(revisionError)throw revisionError
    }
    const {data,error}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:toolKey,payload:{version:2,locationId,budget:local}},{onConflict:'show_id,tool_key'}).select('updated_at').single();if(error)throw error
    budgetTokens.set(tokenFor(showId,locationId),data.updated_at);known.set(locationId,data.updated_at);budget.__remoteUpdatedAt=data.updated_at;latest=data.updated_at||latest
  }
  // Safety rule: ordinary Save never deletes another budget just because it is
  // absent from a transient client payload. Budget deletion must be explicit.
  // This prevents a partial/stale render from wiping unrelated locations.
  loadedBudgetIds.set(showId,known);loadedBudgetTombstones.set(showId,tombstonesAtLoad)
  if(conflicts.length)console.warn('Skipped stale or lifecycle-blocked budget records',conflicts)
  return {updated_at:latest,conflicts}
}

export async function deleteBudgetDocument(showId:string,budget:any){
  if(!supabase)throw new Error('Supabase unavailable')
  let resolved=budget
  if(!resolved?.sharedLocationId){const matches=await resolveLegacyBudgetIds(showId,[resolved]);resolved=matches[0]||resolved}
  const locationId=resolved?.sharedLocationId
  if(!locationId)throw new Error('This budget is not linked to a location yet. Save it once before deleting it.')
  const toolKey=keyFor(locationId)
  const {data:current,error:currentError}=await supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key',toolKey).maybeSingle()
  if(currentError)throw currentError
  if(current){
    const {error:revisionError}=await supabase.from('tool_documents').insert({show_id:showId,tool_key:revisionKey(locationId),payload:{version:1,locationId,savedAt:new Date().toISOString(),previousUpdatedAt:current.updated_at,budgetSnapshot:current.payload,reason:'before budget delete'}})
    if(revisionError)throw revisionError
  }
  const tombstone={version:2,locationId,deletedAt:new Date().toISOString(),reason:'Explicit budget delete',budgetSnapshot:current?.payload||{budget:cleanBudget({...resolved,sharedLocationId:locationId})}}
  const {error:tombError}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:budgetTombstoneKey(locationId),payload:tombstone},{onConflict:'show_id,tool_key'})
  if(tombError)throw tombError
  const {error:deleteError}=await supabase.from('tool_documents').delete().eq('show_id',showId).eq('tool_key',toolKey)
  if(deleteError)throw deleteError
  budgetTokens.delete(tokenFor(showId,locationId))
  const known=loadedBudgetIds.get(showId)||new Map<string,string>();known.delete(locationId);loadedBudgetIds.set(showId,known)
  const tombstones=loadedBudgetTombstones.get(showId)||new Set<string>();tombstones.add(locationId);loadedBudgetTombstones.set(showId,tombstones)
  return {locationId,deleted:true}
}

export async function loadSharedLocations(showId:string){
  if(!supabase)return[]
  const [{data,error},{data:budgetTombstones,error:tombError}] = await Promise.all([
    supabase.from('production_locations').select('*').eq('show_id',showId).order('created_at'),
    supabase.from('tool_documents').select('tool_key').eq('show_id',showId).like('tool_key','budget-tombstone:%'),
  ])
  if(error)throw error;if(tombError)throw tombError
  const budgetDeleted=new Set((budgetTombstones||[]).map((x:any)=>x.tool_key.slice('budget-tombstone:'.length)))
  return (data||[]).filter((r:any)=>!r.metadata?.archived_at&&!budgetDeleted.has(r.id))
}
export async function archiveLocation(locationId:string){if(!supabase)throw new Error('Supabase unavailable');const {data:row,error:loadError}=await supabase.from('production_locations').select('metadata,status').eq('id',locationId).single();if(loadError)throw loadError;const {error}=await supabase.from('production_locations').update({status:'Archived',metadata:{...(row.metadata||{}),archived_at:new Date().toISOString(),archived_from_status:row.status||null}}).eq('id',locationId);if(error)throw error}
export async function permanentlyDeleteLocation(showId:string,locationId:string,reason='Permanent delete'){if(!supabase)throw new Error('Supabase unavailable');const [{data:linked,error:linkedError},{data:locationRecord,error:locationError}]=await Promise.all([supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id',showId).in('tool_key',[keyFor(locationId),bibleKey(locationId)]),supabase.from('production_locations').select('*').eq('show_id',showId).eq('id',locationId).maybeSingle()]);if(linkedError)throw linkedError;if(locationError)throw locationError;const tombstone={version:2,locationId,deletedAt:new Date().toISOString(),reason,locationSnapshot:locationRecord||null,linkedRecords:(linked||[]).map((x:any)=>({toolKey:x.tool_key,payload:x.payload,updatedAt:x.updated_at}))};const {error:tombError}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:locationTombstoneKey(locationId),payload:tombstone},{onConflict:'show_id,tool_key'});if(tombError)throw tombError;if(linked?.length){const {error}=await supabase.from('tool_documents').delete().eq('show_id',showId).in('tool_key',linked.map((x:any)=>x.tool_key));if(error)throw error}const {error}=await supabase.from('production_locations').delete().eq('show_id',showId).eq('id',locationId);if(error)throw error}

// The current Budget UI removes a budget from React state first. Capture that
// explicit Delete Budget click and persist the corresponding budget tombstone
// after the local backup has updated. This keeps ordinary autosave non-destructive
// while making an intentional delete survive refresh.
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  document.addEventListener('click',(event)=>{
    const target=event.target as Element|null
    if(!target?.closest?.('.delete-budget-button'))return
    const showId=getShowId();if(!showId)return
    let before:any[]=[]
    try{before=JSON.parse(localStorage.getItem('tb-budgets')||'[]')}catch{return}
    window.setTimeout(async()=>{
      let after:any[]=[]
      try{after=JSON.parse(localStorage.getItem('tb-budgets')||'[]')}catch{return}
      const afterIds=new Set(after.map((b:any)=>b.id))
      const removed=before.filter((b:any)=>!afterIds.has(b.id)&&(b.showId===showId||!b.showId))
      for(const removedBudget of removed){
        try{await deleteBudgetDocument(showId,removedBudget)}catch(error){console.error('Budget delete did not persist',error)}
      }
    },1200)
  },true)
}

export function subscribeBudget(showId:string,cb:()=>void){
  if(!supabase||!showId)return()=>{}
  // Budget writes autosave locally first. Rehydrating in response to our own
  // budget/meta realtime echo can replace a just-edited value before the next
  // autosave finishes. Only cross-tool records should trigger a live refresh;
  // budget records themselves are refreshed on page load and explicit reload.
  let timer:number|undefined
  const refresh=()=>{ if(timer)window.clearTimeout(timer); timer=window.setTimeout(cb,1200) }
  const ch=supabase.channel(`budget-connected:${showId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'production_locations',filter:`show_id=eq.${showId}`},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'tool_documents',filter:`show_id=eq.${showId}`},(p:any)=>{
      const k=p.new?.tool_key||p.old?.tool_key||''
      if(k.startsWith('bible-location:')||k.startsWith('location-tombstone:')) refresh()
    })
    .subscribe()
  return()=>{if(timer)window.clearTimeout(timer);supabase.removeChannel(ch)}
}
