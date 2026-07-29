import { createClient } from '@supabase/supabase-js'
import { createSharedCookieStorage } from './sharedAuthStorage'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:createSharedCookieStorage()}}) : null
export const getShowId = () => { const p=new URLSearchParams(location.search); return p.get('show')||p.get('showId')||'' }
export const getShowName = () => { const p=new URLSearchParams(location.search); return p.get('showName')||'EL DORADO' }
export async function getSession(){ if(!supabase)return null; const {data,error}=await supabase.auth.getSession(); if(error)throw error; return data.session }
export async function loadBudgetDocument(showId:string){ if(!supabase)return null; const {data,error}=await supabase.from('tool_documents').select('payload,updated_at').eq('show_id',showId).eq('tool_key','budget').maybeSingle(); if(error)throw error; return data }
export async function saveBudgetDocument(showId:string,payload:any){ if(!supabase)return null; const {data,error}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:'budget',payload},{onConflict:'show_id,tool_key'}).select('updated_at').single(); if(error)throw error; return data }
export async function loadSharedLocations(showId:string){ if(!supabase)return[]; const {data,error}=await supabase.from('production_locations').select('*').eq('show_id',showId).order('created_at'); if(error)throw error; return data||[] }
export function subscribeBudget(showId:string,cb:()=>void){ if(!supabase||!showId)return()=>{}; const ch=supabase.channel(`budget-locations:${showId}`).on('postgres_changes',{event:'*',schema:'public',table:'production_locations',filter:`show_id=eq.${showId}`},cb).subscribe(); return()=>{supabase.removeChannel(ch)} }
