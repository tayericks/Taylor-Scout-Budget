import { configured, getShowId, loadBudgetDocument, saveBudgetDocument } from './supabase'

type AnyBudget=Record<string,any>
const bibleSections=[
  {id:'security',name:'Security',icon:'shield',account:'36-30'},
  {id:'bible-restrooms',name:'Restrooms',icon:'warehouse',account:'36-36'},
  {id:'bible-cleaning',name:'Cleaning',icon:'sparkles',account:'36-06'},
  {id:'bible-bins',name:'Bins & Dumpsters',icon:'warehouse',account:'36-36'},
  {id:'bible-equipment',name:'Equipment / HDR',icon:'wrench',account:'36-36'},
  {id:'bible-catering',name:'Catering Setup',icon:'warehouse',account:'36-08'},
  {id:'bible-snake',name:'Snake Wrangler',icon:'users',account:'36-04'},
  {id:'bible-maps',name:'Maps',icon:'map',account:'36-36'}
]
const norm=(v:any)=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ')
const showId=getShowId()
const params=new URLSearchParams(location.search)
const requestedBudgetId=params.get('budgetId')||''
const requestedLocationId=params.get('locationId')||''
let hidden=new Set<string>()
let activeBudget:AnyBudget|null=null
let lastPayload:any=null

function currentSetName(){return (document.querySelector('.budget-title h1')?.textContent||'').trim()}
function sectionName(section:Element){return (section.querySelector('.section-header input') as HTMLInputElement)?.value?.trim()||section.querySelector('.section-header h2,.section-header h3,.section-header strong')?.textContent?.trim()||''}
function slug(name:string){const n=norm(name);const known=bibleSections.find(x=>norm(x.name)===n);if(known)return known.id;return n.replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
function budgetKey(){return activeBudget?.id||requestedBudgetId||requestedLocationId||currentSetName()||'budget'}
function localKey(){return `ts-budget-hidden-sections:${showId||'local'}:${budgetKey()}`}
function loadLocal(){try{hidden=new Set(JSON.parse(localStorage.getItem(localKey())||'[]'))}catch{hidden=new Set()}}
function saveLocal(){localStorage.setItem(localKey(),JSON.stringify([...hidden]))}

async function loadRemote(){
  if(!configured||!showId){loadLocal();return}
  try{
    const doc=await loadBudgetDocument(showId);lastPayload=doc?.payload||doc||{};const budgets=lastPayload?.budgets||[];
    activeBudget=budgets.find((b:AnyBudget)=>requestedBudgetId&&b.id===requestedBudgetId)||budgets.find((b:AnyBudget)=>requestedLocationId&&b.sharedLocationId===requestedLocationId)||budgets.find((b:AnyBudget)=>norm(b.setName)===norm(currentSetName()))||null;
    hidden=new Set(activeBudget?.hiddenSections||[]);if(!hidden.size)loadLocal();
  }catch{loadLocal()}
}
async function persist(){
  saveLocal();if(!configured||!showId||!activeBudget)return;
  try{
    const doc=await loadBudgetDocument(showId),payload=doc?.payload||doc||{},budgets=[...(payload?.budgets||[])],idx=budgets.findIndex((b:AnyBudget)=>b.id===activeBudget?.id);
    if(idx<0)return;budgets[idx]={...budgets[idx],hiddenSections:[...hidden]};await saveBudgetDocument(showId,{...payload,budgets});activeBudget=budgets[idx];lastPayload={...payload,budgets}
  }catch(e){console.warn('Could not persist Budget section visibility',e)}
}
function applyHidden(){document.querySelectorAll('.budget-section').forEach(section=>{const id=slug(sectionName(section));(section as HTMLElement).style.display=hidden.has(id)?'none':''})}
function addRemoveButtons(){
  document.querySelectorAll('.budget-section').forEach(section=>{const head=section.querySelector('.section-header');if(!head||head.querySelector('.ts-remove-budget-section'))return;const name=sectionName(section),id=slug(name);const button=document.createElement('button');button.type='button';button.className='ts-remove-budget-section no-print';button.innerHTML='× <span>Remove section</span>';button.title=`Remove ${name} from this budget`;button.onclick=async e=>{e.preventDefault();e.stopPropagation();if(!confirm(`Remove “${name}” from this budget?\n\nThe section can be restored from Manage Sections.`))return;hidden.add(id);applyHidden();await persist()};head.append(button)
  })
}
async function ensureBibleSections(){
  if(!configured||!showId||!activeBudget)return alert('Connect this Budget to the show before syncing Bible sections.');
  const doc=await loadBudgetDocument(showId),payload=doc?.payload||doc||{},budgets=[...(payload?.budgets||[])],idx=budgets.findIndex((b:AnyBudget)=>b.id===activeBudget?.id);if(idx<0)return;
  const b=budgets[idx],custom=[...(b.customSections||[])],existing=new Set(custom.map((x:any)=>x.id));
  bibleSections.filter(x=>x.id!=='security').forEach(section=>{if(!existing.has(section.id))custom.push(section)});
  budgets[idx]={...b,customSections:custom,hiddenSections:[...hidden]};await saveBudgetDocument(showId,{...payload,budgets});localStorage.setItem('tb-budgets',JSON.stringify(budgets));location.reload()
}
function openManager(){
  document.querySelector('.ts-section-manager-backdrop')?.remove();const rows=[...document.querySelectorAll('.budget-section')].map(section=>({id:slug(sectionName(section)),name:sectionName(section)}));
  const all=[...new Map([...rows,...bibleSections].map(x=>[x.id,x])).values()];const backdrop=document.createElement('div');backdrop.className='ts-section-manager-backdrop';backdrop.innerHTML=`<div class="ts-section-manager"><header><div><small>BUDGET STRUCTURE</small><h2>Manage Sections</h2><p>Budget vendor sections mirror the Location Bible order planners. Remove anything this location does not need and restore it later.</p></div><button class="ts-manager-close">×</button></header><div class="ts-manager-grid">${all.map(x=>`<label><input type="checkbox" data-section-id="${x.id}" ${hidden.has(x.id)?'':'checked'}><span>${x.name}</span></label>`).join('')}</div><footer><button class="ts-sync-bible">Sync Bible section options</button><button class="ts-manager-done">Done</button></footer></div>`;document.body.append(backdrop);
  const close=()=>backdrop.remove();backdrop.querySelector('.ts-manager-close')?.addEventListener('click',close);backdrop.querySelector('.ts-manager-done')?.addEventListener('click',close);backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
  backdrop.querySelectorAll<HTMLInputElement>('[data-section-id]').forEach(box=>box.onchange=async()=>{box.checked?hidden.delete(box.dataset.sectionId||''):hidden.add(box.dataset.sectionId||'');applyHidden();await persist()});backdrop.querySelector('.ts-sync-bible')?.addEventListener('click',ensureBibleSections)
}
function mountButton(){const actions=document.querySelector('.budget-topbar .top-actions');if(!actions||actions.querySelector('.ts-manage-sections'))return;const btn=document.createElement('button');btn.type='button';btn.className='secondary ts-manage-sections';btn.textContent='Manage Sections';btn.onclick=openManager;actions.insertBefore(btn,actions.lastElementChild);}
function repair(){mountButton();addRemoveButtons();applyHidden()}
async function init(){await loadRemote();repair();new MutationObserver(()=>queueMicrotask(repair)).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('click',e=>{const b=(e.target as HTMLElement)?.closest?.('button');if(b&&/save budget/i.test(b.textContent||''))setTimeout(()=>persist(),600)},true)}
init()
