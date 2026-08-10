import { configured, supabase, getSession, getShowId, getShowName } from './supabase'

const showId=getShowId()
const requestedLocationId=new URLSearchParams(location.search).get('locationId')||''
let locations:any[]=[]
let loaded=false
let busy=false

const esc=(s='')=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))

async function loadOptions(){
  if(loaded)return locations
  loaded=true
  if(!configured||!supabase||!showId)return []
  try{
    const session=await getSession();if(!session)return []
    const [{data:locs,error:locErr},{data:docs,error:docErr}]=await Promise.all([
      supabase.from('production_locations').select('*').eq('show_id',showId).eq('status','Selected').eq('source','location_list').order('location_name'),
      supabase.from('tool_documents').select('tool_key').eq('show_id',showId).like('tool_key','budget-location:%')
    ])
    if(locErr)throw locErr;if(docErr)throw docErr
    const budgeted=new Set((docs||[]).map((d:any)=>String(d.tool_key).slice('budget-location:'.length)))
    locations=(locs||[]).filter((l:any)=>!l.metadata?.archived_at).map((l:any)=>({...l,__hasBudget:budgeted.has(l.id)}))
    return locations
  }catch(e){console.error('Budget location options failed',e);return []}
}

function nativeSet(el:HTMLInputElement|HTMLSelectElement|null,value:string){
  if(!el)return
  const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set
  setter?.call(el,value)
  el.dispatchEvent(new Event('input',{bubbles:true}))
  el.dispatchEvent(new Event('change',{bubbles:true}))
}

function fill(form:HTMLFormElement,loc:any){
  if(!loc)return
  const selects=form.querySelectorAll('select')
  const episode=selects.item(0) as HTMLSelectElement|null
  const inputs=[...form.querySelectorAll('input')] as HTMLInputElement[]
  const setNumber=inputs[0]||null
  const setName=inputs[1]||null
  const physical=inputs[2]||null
  const ep=String(loc.episode_name||loc.episode_id||'')
  if(episode&&ep){
    const option=[...episode.options].find(o=>o.value===ep||o.textContent===ep||o.value.includes(ep)||String(o.textContent||'').includes(ep))
    if(option)nativeSet(episode,option.value)
  }
  nativeSet(setName,String(loc.set_name||loc.location_name||''))
  nativeSet(physical,String(loc.location_name||''))
  if(setNumber&&!setNumber.value&&loc.metadata?.scenes)nativeSet(setNumber,String(loc.metadata.scenes))
}

async function createLinkedBudget(form:HTMLFormElement,loc:any){
  if(busy||!supabase||!showId)return
  busy=true
  try{
    const session=await getSession();if(!session)throw new Error('Sign in required')
    const {data:existing,error:existingError}=await supabase.from('tool_documents').select('tool_key').eq('show_id',showId).eq('tool_key',`budget-location:${loc.id}`).maybeSingle()
    if(existingError)throw existingError
    if(existing){
      const q=new URLSearchParams(location.search);q.set('locationId',loc.id);q.delete('budgetId');location.href=`${location.pathname}?${q.toString()}`;return
    }
    const selects=form.querySelectorAll('select');const episode=(selects.item(0) as HTMLSelectElement|null)?.value||loc.episode_name||loc.episode_id||'Episode'
    const inputs=[...form.querySelectorAll('input')] as HTMLInputElement[]
    const setNumber=inputs[0]?.value||loc.metadata?.scenes||''
    const setName=inputs[1]?.value||loc.set_name||loc.location_name||'New Set'
    const sc=loc.metadata?.schedule||{}
    const budget={id:crypto.randomUUID(),showId,episode,production:getShowName()||'TAYLOR SCOUT',setName,setNumber,scenes:setNumber,location:loc.location_name||'',version:'Budget V1',cityId:'la-city',contingency:10000,keyAssistantLocationManager:'',items:[],customSections:[],sectionOverrides:{},sharedLocationId:loc.id,address:loc.address||'',contact:loc.contact_name||'',phone:loc.contact_phone||'',prepStart:sc.prep_start||'',prepEnd:sc.prep_end||'',shootStart:sc.shoot_start||'',shootEnd:sc.shoot_end||'',holdStart:sc.hold_start||'',holdEnd:sc.hold_end||'',strikeStart:sc.strike_start||'',strikeEnd:sc.strike_end||''}
    const {error}=await supabase.from('tool_documents').upsert({show_id:showId,tool_key:`budget-location:${loc.id}`,payload:{version:2,locationId:loc.id,budget}},{onConflict:'show_id,tool_key'})
    if(error)throw error
    const q=new URLSearchParams(location.search);q.set('locationId',loc.id);q.delete('budgetId');location.href=`${location.pathname}?${q.toString()}`
  }catch(e:any){busy=false;console.error(e);alert(e?.message||'Could not create budget for this location')}
}

async function augment(){
  const modal=document.querySelector('.modal-backdrop .modal') as HTMLElement|null
  if(!modal)return
  const h2=modal.querySelector('h2')?.textContent?.trim()||''
  if(h2!=='New Budget'||modal.dataset.locationBudgetPicker==='1')return
  modal.dataset.locationBudgetPicker='1'
  const form=modal.closest('form') as HTMLFormElement|null || modal.querySelector('form') as HTMLFormElement|null
  const targetForm=(modal.tagName==='FORM'?modal:form) as HTMLFormElement|null
  const grid=modal.querySelector('.form-grid') as HTMLElement|null
  if(!targetForm||!grid)return
  const opts=await loadOptions()
  const wrap=document.createElement('div');wrap.className='budget-location-picker'
  wrap.innerHTML=`<label>Locked Location<select id="tb_locked_location"><option value="">Choose a selected location…</option>${opts.map(l=>`<option value="${esc(l.id)}">${esc(l.location_name||'Unnamed location')}${l.set_name?` — ${esc(l.set_name)}`:''}${l.__hasBudget?' — Budget exists':''}</option>`).join('')}</select></label><div class="budget-location-preview"><strong>Select a locked Location List record</strong><span>Address, contact, set and schedule information will carry into the budget.</span></div>`
  grid.parentElement?.insertBefore(wrap,grid)
  const select=wrap.querySelector('select') as HTMLSelectElement
  const preview=wrap.querySelector('.budget-location-preview') as HTMLElement
  const apply=()=>{const loc=opts.find(l=>l.id===select.value);if(!loc)return;fill(targetForm,loc);preview.innerHTML=`<strong>${esc(loc.location_name||'Unnamed location')}</strong><span>${esc(loc.address||'Address not entered')}${loc.contact_name?` · ${esc(loc.contact_name)}`:''}${loc.__hasBudget?' · Existing budget will open':''}</span>`}
  select.onchange=apply
  if(requestedLocationId&&opts.some(l=>l.id===requestedLocationId)){select.value=requestedLocationId;apply()}
  targetForm.addEventListener('submit',e=>{const loc=opts.find(l=>l.id===select.value);if(!loc)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();createLinkedBudget(targetForm,loc)},true)
}

const observer=new MutationObserver(()=>setTimeout(augment,0));observer.observe(document.body,{childList:true,subtree:true});
loadOptions();augment();

const style=document.createElement('style');style.textContent=`.budget-location-picker{margin:4px 0 18px;padding:14px;border:1px solid #cbd9e1;border-radius:10px;background:#f4f8fa}.budget-location-picker>label{display:grid;gap:7px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#168e89}.budget-location-picker select{width:100%;min-height:42px;border:1px solid #c5d4dd;border-radius:7px;background:#fff;padding:9px 11px;font:600 14px Inter,Arial,sans-serif;color:#173247}.budget-location-preview{display:grid;gap:3px;margin-top:10px}.budget-location-preview strong{font-size:13px;color:#173247}.budget-location-preview span{font-size:12px;color:#60788b}`;document.head.append(style)
