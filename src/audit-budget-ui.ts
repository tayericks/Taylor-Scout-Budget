const normalize = (value:string) => value.trim().replace(/\s+\d+$/,'').toLowerCase()

function disambiguateBudgetLabels(){
  document.querySelectorAll<HTMLElement>('.episode-budgets').forEach(group=>{
    const rows=[...group.querySelectorAll<HTMLElement>('.budget-link')]
    const entries=rows.map(row=>{
      const label=row.querySelector<HTMLElement>('span')
      if(!label) return null
      if(!label.dataset.auditBaseLabel) label.dataset.auditBaseLabel=label.textContent?.trim()||'Untitled Budget'
      return {label,base:label.dataset.auditBaseLabel}
    }).filter(Boolean) as {label:HTMLElement;base:string}[]
    const counts=new Map<string,number>()
    entries.forEach(({base})=>counts.set(normalize(base),(counts.get(normalize(base))||0)+1))
    const seen=new Map<string,number>()
    entries.forEach(({label,base})=>{
      const key=normalize(base)
      const ordinal=(seen.get(key)||0)+1
      seen.set(key,ordinal)
      label.textContent=(counts.get(key)||0)>1 && ordinal>1 ? `${base} ${ordinal}` : base
    })
  })
}

function installManageSections(){
  const actions=document.querySelector<HTMLElement>('.top-actions')
  if(!actions||actions.querySelector('.manage-sections-button')) return
  const deleteButton=actions.querySelector<HTMLElement>('.delete-budget-button')
  if(!deleteButton) return
  const button=document.createElement('button')
  button.type='button'
  button.className='secondary manage-sections-button'
  button.textContent='Manage Sections'
  button.addEventListener('click',()=>{
    const target=document.querySelector<HTMLElement>('.section-list')
    target?.scrollIntoView({behavior:'smooth',block:'start'})
    target?.querySelector<HTMLElement>('.section-name-input')?.focus({preventScroll:true})
  })
  actions.insertBefore(button,deleteButton)
}

function applyAuditUi(){
  disambiguateBudgetLabels()
  installManageSections()
}

let scheduled=false
const schedule=()=>{
  if(scheduled) return
  scheduled=true
  requestAnimationFrame(()=>{scheduled=false;applyAuditUi()})
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true})
else schedule()

new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true})
