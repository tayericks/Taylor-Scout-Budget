import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Building2, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, ClipboardList, DollarSign,
  FileText, Flame, MapPin, Plus, Printer, Shield, Sparkles,
  Pencil, Trash2, Truck, Users, Warehouse, Wrench, X, Copy, Film, FolderOpen, Image, Settings, ArrowLeft, Play, Home, Link2, Upload, Download, BookOpen, CalendarDays
} from 'lucide-react'
import './styles.css'
import { configured as supabaseConfigured, getSession, getShowId, getShowName, loadBibleDocument, loadBudgetDocument, loadSharedLocations, saveBudgetDocument, subscribeBudget } from './supabase'

function TaylorScoutLogo({compact=false}:{compact?:boolean}) { return <span className={`ts-logo ${compact?'compact':''}`} aria-label="Taylor Scout"><svg viewBox="0 0 74 92" role="img" aria-hidden="true"><path className="pin-outline" d="M37 3C18 3 5 17 5 36c0 22 17 40 32 53 15-13 32-31 32-53C69 17 56 3 37 3Z"/><path className="mountain" d="M16 39l15-13 8 7 10-10 12 14-12-8-10 10-8-7-15 7Z"/><path className="road" d="M19 69c12-14 24-18 31-27-3 14-12 22-20 31l7 8-9 2-9-14Z"/><path className="star" d="M21 17l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/></svg><span className="ts-wordmark"><b>TAYLOR SCOUT</b><small>PRODUCTION TOOLS</small></span></span> }

type CalcType = 'flat' | 'rateDay' | 'hourly' | 'dayRate' | 'vendor'

type BudgetItem = {
  id: string
  sectionId: string
  name: string
  calcType: CalcType
  people?: number
  days?: number
  regHours?: number
  ot15Hours?: number
  ot2Hours?: number
  hourlyRate?: number
  dayRate?: number
  includedHours?: number
  kitFee?: number
  kitFeeMode?: 'perDay' | 'flat'
  units?: number
  weeks?: number
  servicesPerUnit?: number
  weeklyRate?: number
  serviceRate?: number
  flatAmount?: number
  vendor?: string
  cityRateKey?: string
  notes?: string
  poNumber?: string
  vendorBillingType?: 'weekly' | 'flat'
  vendorFlatRate?: number
  status?: 'estimate' | 'approved' | 'committed' | 'paid' | 'actual'
  actualAmount?: number
  bibleOrderedAmount?: number
}

type Section = { id: string; name: string; icon: string; account: string }

type CityFee = { name:string; rate:string; per:string; source?:string }

type CityProfile = {
  id: string
  city: string
  state: string
  fireOfficerRate: number
  policeOfficerRate: number
  policeSupervisorRate: number
  officerMinimumHours: number
  permitBaseFee: number
  parkingPostingFee: number
  officialFees?: CityFee[]
  officialFeesPublished?: string
}

type VendorItem = {
  id: string
  vendor: string
  name: string
  billingType?: 'weekly' | 'flat'
  weeklyRate: number
  flatRate?: number
  serviceRate: number
  deliveryFee: number
  pickupFee: number
}

type ShowProfile = {
  id: string
  name: string
  productionCompany: string
  season: string
  episodes: string[]
  defaultContingency: number
  defaultCityId: string
  logo?: string
  createdAt: string
}

type BudgetPage = {
  id: string
  showId?: string
  episode: string
  production: string
  setName: string
  setNumber: string
  location: string
  version: string
  cityId: string
  contingency: number
  keyAssistantLocationManager?: string
  items: BudgetItem[]
  customSections?: Section[]
  sectionOverrides?: Record<string, {name?: string; account?: string}>
  sharedLocationId?: string
  calendarAssignmentIds?: string[]
  scenes?: string
  address?: string
  contact?: string
  phone?: string
  prepStart?: string
  prepEnd?: string
  shootStart?: string
  shootEnd?: string
  holdStart?: string
  holdEnd?: string
  strikeStart?: string
  strikeEnd?: string
}



const BUDGET_EPISODE_ORDER = ['Block 1', '303', '304', '305', '306', '307', '308'] as const

function budgetEpisodeGroup(value?: string) {
  const raw = String(value || '').trim()
  const normalized = raw.toUpperCase().replace(/[._-]+/g, ' ')
  if (/\bBLOCK\s*1\b/.test(normalized) || /\bEP\s*BLOCK\s*1\b/.test(normalized)) return 'Block 1'
  const match = normalized.match(/\b(303|304|305|306|307|308)\b/)
  return match ? match[1] : raw
}

function orderedBudgetEpisodes(values: string[]) {
  const normalized = values.map(budgetEpisodeGroup).filter(Boolean)
  const extras = Array.from(new Set(normalized.filter(v => !BUDGET_EPISODE_ORDER.includes(v as any)))).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}))
  return [...BUDGET_EPISODE_ORDER, ...extras]
}

type BibleCommitment = {
  key?: string
  title?: string
  vendor?: string
  sectionId?: string
  status?: string
  amount?: number
  workingTotal?: number
  po?: string
  locationId?: string | null
}

function normalizeBibleCommitments(payload:any): BibleCommitment[] {
  if (!payload?.commitments) return []
  return Object.entries(payload.commitments).map(([key,value]:any)=>({
    key,
    title:value?.title || key,
    vendor:value?.vendor || '',
    sectionId:value?.sectionId || 'vendors',
    status:value?.status || 'working',
    amount:Number(value?.amount ?? value?.workingTotal ?? 0),
    workingTotal:Number(value?.workingTotal ?? value?.amount ?? 0),
    po:value?.po || '',
    locationId:value?.locationId ?? payload.locationId ?? null,
  }))
}

const standardSections: Section[] = [
  { id: 'location-fees', name: 'Location Site Fee', icon: 'building', account: '36-01' },
  { id: 'staffing', name: 'Site Personnel', icon: 'users', account: '36-04' },
  { id: 'security', name: 'Security', icon: 'shield', account: '36-30' },
  { id: 'police', name: 'Police & Traffic Control', icon: 'truck', account: '36-31' },
  { id: 'fire', name: 'Fire & Safety', icon: 'flame', account: '36-32' },
  { id: 'parking', name: 'Parking & Logistics', icon: 'map', account: '36-03' },
  { id: 'permits', name: 'Permits & Notifications', icon: 'clipboard', account: '36-02' },
  { id: 'site-support-rentals', name: 'Site Support Rentals & Tents', icon: 'warehouse', account: '36-08' },
  { id: 'equipment-rentals', name: 'Equipment Rentals & Expendables', icon: 'wrench', account: '36-36' },
  { id: 'heating-ac', name: 'Heating / AC Rentals / AC Techs', icon: 'flame', account: '36-55' },
  { id: 'vendors', name: 'Vendors & Equipment Rentals', icon: 'warehouse', account: '36-36' },
  { id: 'layout', name: 'Layout & Protection', icon: 'wrench', account: '36-05' },
  { id: 'support', name: 'Support Payments & Services', icon: 'dollar', account: '36-06' },
  { id: 'restoration', name: 'Restoration & Claims', icon: 'sparkles', account: '36-08' },
  { id: 'unexpected', name: 'Unexpected Costs', icon: 'file', account: '36-99' },
]

const templateItems = (): BudgetItem[] => [
  // Location site fees
  {id:crypto.randomUUID(),sectionId:'location-fees',name:'Prep Day',calcType:'rateDay',days:0,dayRate:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'location-fees',name:'Shoot Day',calcType:'rateDay',days:0,dayRate:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'location-fees',name:'Strike Day',calcType:'rateDay',days:0,dayRate:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'location-fees',name:'Hold Day',calcType:'rateDay',days:0,dayRate:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'location-fees',name:'Neighbor Gratuities',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'location-fees',name:'Additional / Agreed Site Fee',calcType:'flat',flatAmount:0,status:'estimate'},

  // Site personnel
  {id:crypto.randomUUID(),sectionId:'staffing',name:'Site Rep',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:0,ot2Hours:0,hourlyRate:25,kitFee:0,kitFeeMode:'flat',status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'staffing',name:'Electrician',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:0,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'staffing',name:'HVAC',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:0,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'staffing',name:'Layout',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:0,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'staffing',name:'Restroom Attendant',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:0,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},

  // Security baseline rows remain Budget-owned; planner commitments can roll into these later.
  ...['Prep','Shoot','Strike','Hold'].flatMap(phase => ([
    {id:crypto.randomUUID(),sectionId:'security',name:`${phase} Guards`,calcType:'hourly' as CalcType,people:0,days:1,regHours:8,ot15Hours:4,ot2Hours:0,hourlyRate:33,kitFee:0,kitFeeMode:'perDay' as const,status:'estimate' as const},
    {id:crypto.randomUUID(),sectionId:'security',name:`${phase} Supervisor`,calcType:'hourly' as CalcType,people:0,days:1,regHours:8,ot15Hours:4,ot2Hours:0,hourlyRate:36,kitFee:0,kitFeeMode:'perDay' as const,status:'estimate' as const},
  ])),

  // Police / Fire
  {id:crypto.randomUUID(),sectionId:'police',name:'LAPD — Shoot Day Lane Closures',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:4,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'police',name:'LAPD — Prep / Wrap Lane Closures',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:4,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'fire',name:'LA City Fire Officer',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:4,ot2Hours:0,hourlyRate:127,kitFee:0,kitFeeMode:'flat',status:'estimate'},

  // Parking / logistics
  {id:crypto.randomUUID(),sectionId:'parking',name:'Crew Parking — Prep / Wrap',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'parking',name:'Crew Parking — Shoot',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'parking',name:'Basecamp',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'parking',name:'Background Parking',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'parking',name:'Truck Parking',calcType:'flat',flatAmount:0,status:'estimate'},

  // Permits
  {id:crypto.randomUUID(),sectionId:'permits',name:'Permit Application',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'permits',name:'Signatures & Notification',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'permits',name:'Lane Closures & Closure Fees',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'permits',name:'Fire Department Spot Check',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'permits',name:'Street Posting / Barricades / Signage',calcType:'flat',flatAmount:0,status:'estimate'},

  // Site support rentals & tents
  {id:crypto.randomUUID(),sectionId:'site-support-rentals',name:'Catering Location / Lunchboxes',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'site-support-rentals',name:'Staging / Holding Areas',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'site-support-rentals',name:'Tents & Background Processing',calcType:'flat',flatAmount:0,status:'estimate'},

  // Equipment rentals & expendables
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'Layout Materials',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'Maps',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'Restrooms',calcType:'vendor',vendor:'',units:0,weeks:1,servicesPerUnit:0,weeklyRate:850,serviceRate:150,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'Lights',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'Handwashing Stations',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — 10x10 Pop-Up Tent',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:70,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:"HDR — 10' Tent Side",calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:16,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Sandbag',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:7,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Handwashing Station',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:350,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Trash Can, 33 gal',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:5.5,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Milwaukee Light',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:60,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — GloBug Lighting System with Generator',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:330,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Fire Extinguisher, Small',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:24,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Delivery / Set-Up',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:425,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'equipment-rentals',name:'HDR — Strike Pick-Up',calcType:'vendor',vendor:'Hollywood Depot Rentals (HDR)',vendorBillingType:'flat',vendorFlatRate:425,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},

  // Heating / AC
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Heating / AC Equipment',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — 10x10 Cooling Tent',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:100,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — 1.5 Ton AC, 110V',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:200,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — 500 Amp Ultra Silent Generator',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:450,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — Distro Pack',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:400,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — Diesel Fuel (per gallon)',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:10,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — AC Delivery / Pick-Up',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:400,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'Air On Location — Generator Delivery / Pick-Up',calcType:'vendor',vendor:'Air on Location, Inc.',vendorBillingType:'flat',vendorFlatRate:300,units:0,weeks:1,servicesPerUnit:0,weeklyRate:0,serviceRate:0,flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'heating-ac',name:'AC Techs',calcType:'hourly',people:0,days:1,regHours:8,ot15Hours:4,ot2Hours:0,hourlyRate:0,kitFee:0,kitFeeMode:'flat',status:'estimate'},

  // Existing general-purpose vendor defaults retained for compatibility.
  {id:crypto.randomUUID(),sectionId:'vendors',name:'Tents, Tables & Chairs',calcType:'flat',flatAmount:0,status:'estimate'},
  {id:crypto.randomUUID(),sectionId:'vendors',name:'BG Changing',calcType:'flat',flatAmount:0,status:'estimate'},
]

function withRequiredTemplate(items: BudgetItem[]) {
  // Fill the standard security presets with the show's baseline rates while
  // preserving any rate the user has already entered manually.
  const normalized = items.map(item => {
    if (item.sectionId !== 'security' || (item.hourlyRate ?? 0) !== 0) return item
    if (/^(Prep|Shoot|Strike|Hold) Guards$/i.test(item.name)) return {...item, hourlyRate:33}
    if (/^(Prep|Shoot|Strike|Hold) Supervisor$/i.test(item.name)) return {...item, hourlyRate:36}
    return item
  })
  const required = templateItems()
  const keys = new Set(normalized.map(i => `${i.sectionId}|${i.name.toLowerCase()}`))
  return [...normalized, ...required.filter(i => !keys.has(`${i.sectionId}|${i.name.toLowerCase()}`))]
}

const FILMLA_LA_CITY_FEES: CityFee[] = [
  {name:'Permit Application Fee — up to 5 locations / 7 consecutive days',rate:'$931',per:'Permit'},
  {name:'Permit Rider — business hours',rate:'$148.75',per:'Rider'},
  {name:'Permit Rider — after business hours',rate:'$208',per:'Rider'},
  {name:'Still Photo Application Fee',rate:'$104',per:'Permit'},
  {name:'Still Photo Rider Fee',rate:'$31',per:'Rider'},
  {name:'Student Permit Fee — simple',rate:'$52',per:'Permit'},
  {name:'Student Permit Fee — complex',rate:'$134',per:'Permit'},
  {name:'Non-Profit (PSA) Permit Application',rate:'$73',per:'Permit'},
  {name:'Non-Profit (PSA) Permit Rider',rate:'$36',per:'Permit'},
  {name:'Notification Fee — base radius',rate:'$232',per:'Radius'},
  {name:'Lane Closure Administration Fee',rate:'$78',per:'Involved location'},
  {name:'Gunfire Administration Fee',rate:'$78',per:'Involved location'},
  {name:'Special FX — explosion & smoke administration',rate:'$78',per:'Involved location'},
  {name:'Drone Administration Fee',rate:'$78',per:'Involved location'},
  {name:'Helicopter Administration Fee',rate:'$78',per:'Involved location'},
  {name:'FilmLA Monitor',rate:'$44.50',per:'Hour · minimum/OT/DT may apply'},
  {name:'LAFD Spot Check Surcharge',rate:'$287',per:'Permit'},
  {name:'LAFD Fire Safety Officer',rate:'$127',per:'Hour · 4 hr minimum + 1 hr travel'},
  {name:'LA City Lane & Street Closure',rate:'$312',per:'Involved location'},
  {name:'LA City Posting Fee',rate:'$69',per:"300' linear curbside space"},
  {name:'LAPD Retired / Off Duty Officer',rate:'$67.19–$77.90',per:'Hour · 8 hr minimum · OT after 8 · DT after 12'},
  {name:'LAPD Motorcycle Fee',rate:'$75',per:'Day'},
  {name:'LAPD Active Duty Officer',rate:'$74',per:'Hour · 2–4 hr minimum · flat rate'},
  {name:'Rec & Parks — Film Use',rate:'$450',per:'Day'},
  {name:'Rec & Parks — Still Photo Use 1–14 people',rate:'$75',per:'Day'},
  {name:'Rec & Parks — Still Photo Use 15+ people',rate:'$150',per:'Day'},
  {name:'Rec & Parks — Prep / Strike',rate:'$150',per:'Day'},
  {name:'Rec & Parks — Basecamp Only',rate:'$450',per:'Day'},
  {name:'Rec & Parks — Crew Parking 1–15 cars',rate:'$100',per:'Day'},
  {name:'Rec & Parks — Crew Parking 16+ cars',rate:'$300',per:'Day'},
  {name:'Rec & Parks — Catering 1–74 people',rate:'$225',per:'Day'},
  {name:'Rec & Parks — Catering 75+ people',rate:'$450',per:'Day'},
  {name:'Rec & Parks — Special Facility Service',rate:'$150',per:'Day'},
  {name:'Rec & Parks — Monitor',rate:'$38',per:'Hour'},
  {name:'Rec & Parks — Monitor Reporting',rate:'$76',per:'Monitor shift'},
  {name:'DWP Facility Film Use',rate:'$800–$2,000',per:'Day'},
  {name:'DWP Facility Still Photo Use',rate:'$500',per:'Day'},
  {name:'DWP Facility Monitor',rate:'$50–$70',per:'Hour'},
  {name:'Port of Los Angeles — Use',rate:'$300',per:'Day'},
  {name:'Port of Los Angeles — Prep / Strike',rate:'$100',per:'Day'},
  {name:'Port of Los Angeles — Base Camp Only',rate:'$300',per:'Day'},
  {name:'Port of Los Angeles — Crew Parking Only',rate:'$150',per:'Day'},
  {name:'Port of Los Angeles — Police Officer',rate:'$112',per:'Hour'},
]

const normalizeCities = (input:CityProfile[]) => input.map(c => c.id==='la-city' || (c.city==='Los Angeles' && c.state==='CA') ? ({...c,fireOfficerRate:127,policeOfficerRate:77.90,policeSupervisorRate:77.90,officerMinimumHours:8,permitBaseFee:931,parkingPostingFee:69,officialFees:FILMLA_LA_CITY_FEES,officialFeesPublished:'FilmLA · Apr 1, 2026'}) : c)

const defaultCities: CityProfile[] = [
  {
    id: 'la-city', city: 'Los Angeles', state: 'CA', fireOfficerRate: 127,
    policeOfficerRate: 77.90, policeSupervisorRate: 77.90,
    officerMinimumHours: 8, permitBaseFee: 931, parkingPostingFee: 69, officialFees:FILMLA_LA_CITY_FEES, officialFeesPublished:'FilmLA · Apr 1, 2026',
  },
  {
    id: 'burbank', city: 'Burbank', state: 'CA', fireOfficerRate: 112,
    policeOfficerRate: 68, policeSupervisorRate: 76,
    officerMinimumHours: 4, permitBaseFee: 850, parkingPostingFee: 1450,
  },
]

const defaultVendors: VendorItem[] = [
  {id:'air-25',vendor:'Air on Location, Inc.',name:'25 Ton AC',billingType:'weekly',weeklyRate:1700,flatRate:1200,serviceRate:0,deliveryFee:400,pickupFee:0},
  {id:'air-20',vendor:'Air on Location, Inc.',name:'20 Ton AC',billingType:'weekly',weeklyRate:1500,flatRate:1000,serviceRate:0,deliveryFee:400,pickupFee:0},
  {id:'air-10',vendor:'Air on Location, Inc.',name:'10 Ton AC',billingType:'weekly',weeklyRate:1100,flatRate:800,serviceRate:0,deliveryFee:400,pickupFee:0},
  {id:'air-5',vendor:'Air on Location, Inc.',name:'5 Ton AC',billingType:'weekly',weeklyRate:600,flatRate:500,serviceRate:0,deliveryFee:400,pickupFee:0},
  {id:'air-15',vendor:'Air on Location, Inc.',name:'1.5 Ton AC',billingType:'weekly',weeklyRate:300,flatRate:200,serviceRate:0,deliveryFee:400,pickupFee:0},
  {id:'air-gen',vendor:'Air on Location, Inc.',name:'70 KVA Generator',billingType:'weekly',weeklyRate:1350,flatRate:450,serviceRate:0,deliveryFee:300,pickupFee:0},
  {id:'air-cooling-tent',vendor:'Air on Location, Inc.',name:'10x10 Cooling Tent',billingType:'flat',weeklyRate:0,flatRate:100,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'air-15-invoice',vendor:'Air on Location, Inc.',name:'1.5 Ton Air Conditioning Unit — 110V',billingType:'flat',weeklyRate:0,flatRate:200,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'air-gen-500',vendor:'Air on Location, Inc.',name:'500 Amp Ultra Silent Generator',billingType:'flat',weeklyRate:0,flatRate:450,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'air-distro',vendor:'Air on Location, Inc.',name:'Distro Pack — Base Camp',billingType:'flat',weeklyRate:0,flatRate:400,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'air-diesel',vendor:'Air on Location, Inc.',name:'Diesel Fuel — per gallon',billingType:'flat',weeklyRate:0,flatRate:10,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'air-ac-delivery-invoice',vendor:'Air on Location, Inc.',name:'AC Delivery / Pick-Up',billingType:'flat',weeklyRate:0,flatRate:400,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'air-generator-delivery-invoice',vendor:'Air on Location, Inc.',name:'Generator Delivery / Pick-Up',billingType:'flat',weeklyRate:0,flatRate:300,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-tent-10x10',vendor:'Hollywood Depot Rentals (HDR)',name:'10x10 Pop-Up Tent',billingType:'flat',weeklyRate:0,flatRate:70,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-tent-side-10',vendor:'Hollywood Depot Rentals (HDR)',name:"10' Tent Side",billingType:'flat',weeklyRate:0,flatRate:16,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-sandbag',vendor:'Hollywood Depot Rentals (HDR)',name:'Sandbag',billingType:'flat',weeklyRate:0,flatRate:7,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-handwash',vendor:'Hollywood Depot Rentals (HDR)',name:'Handwashing Station',billingType:'flat',weeklyRate:0,flatRate:350,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-trash-33',vendor:'Hollywood Depot Rentals (HDR)',name:'Trash Can, 33 gal',billingType:'flat',weeklyRate:0,flatRate:5.5,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-milwaukee-light',vendor:'Hollywood Depot Rentals (HDR)',name:'Milwaukee Light',billingType:'flat',weeklyRate:0,flatRate:60,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-globug-generator',vendor:'Hollywood Depot Rentals (HDR)',name:'GloBug Lighting System with Generator',billingType:'flat',weeklyRate:0,flatRate:330,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-fire-small',vendor:'Hollywood Depot Rentals (HDR)',name:'Fire Extinguisher, Small',billingType:'flat',weeklyRate:0,flatRate:24,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-delivery-setup',vendor:'Hollywood Depot Rentals (HDR)',name:'Delivery / Set-Up',billingType:'flat',weeklyRate:0,flatRate:425,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr-strike-pickup',vendor:'Hollywood Depot Rentals (HDR)',name:'Strike Pick-Up',billingType:'flat',weeklyRate:0,flatRate:425,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'lunch-large',vendor:'Lunchbox Transportation, LLC',name:'Large Catering Trailer',billingType:'flat',weeklyRate:0,flatRate:1450,serviceRate:0,deliveryFee:477,pickupFee:477},
  {id:'lunch-small',vendor:'Lunchbox Transportation, LLC',name:'Small Catering Trailer',billingType:'flat',weeklyRate:0,flatRate:1150,serviceRate:0,deliveryFee:392,pickupFee:392},
  {id:'elite-4room',vendor:'Elite Mobile Restrooms',name:'4-room restroom trailer',billingType:'flat',weeklyRate:0,flatRate:1000,serviceRate:175,deliveryFee:0,pickupFee:0},
  {id:'elite-construction',vendor:'Elite Mobile Restrooms',name:'Construction restroom unit',billingType:'flat',weeklyRate:0,flatRate:150,serviceRate:150,deliveryFee:0,pickupFee:0},
  {id:'reel-black',vendor:'Reel Waste & Recycling, LLC',name:'3 Yard Black Dumpster',billingType:'flat',weeklyRate:0,flatRate:175,serviceRate:175,deliveryFee:0,pickupFee:0},
  {id:'reel-blue',vendor:'Reel Waste & Recycling, LLC',name:'3 Yard Blue Recycle Dumpster',billingType:'flat',weeklyRate:0,flatRate:175,serviceRate:175,deliveryFee:0,pickupFee:0},
  {id:'reel-green',vendor:'Reel Waste & Recycling, LLC',name:'3 Yard Green Compost Dumpster',billingType:'flat',weeklyRate:0,flatRate:175,serviceRate:175,deliveryFee:0,pickupFee:0},
  {id:'reel-15',vendor:'Reel Waste & Recycling, LLC',name:'15 Yard Roll-off Dumpster',billingType:'flat',weeklyRate:0,flatRate:650,serviceRate:650,deliveryFee:0,pickupFee:0},
  {id:'reel-30',vendor:'Reel Waste & Recycling, LLC',name:'30 Yard Roll-off Dumpster',billingType:'flat',weeklyRate:0,flatRate:750,serviceRate:750,deliveryFee:0,pickupFee:0},
  {id:'map',vendor:'Map This Out, Inc.',name:'Production Map',billingType:'flat',weeklyRate:0,flatRate:90,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'security-guard',vendor:'Showbiz Inc.',name:'Security Guard',billingType:'flat',weeklyRate:0,flatRate:29.5,serviceRate:44.25,deliveryFee:0,pickupFee:0},
  {id:'security-gaffer',vendor:'Showbiz Inc.',name:'Security Gaffer',billingType:'flat',weeklyRate:0,flatRate:31.5,serviceRate:47.25,deliveryFee:0,pickupFee:0},
  {id:'snake',vendor:"Scott Perez's Company",name:'Snake Abatement Technician',billingType:'flat',weeklyRate:0,flatRate:50.41,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'street',vendor:'Quality Surface Maintenance',name:'Street Sweeping / Power Washing',billingType:'flat',weeklyRate:0,flatRate:130,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'permit-standard',vendor:'Pacific Production Services (PPS)',name:'Standard Permit Application',billingType:'flat',weeklyRate:0,flatRate:175,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'permit-difficult',vendor:'Pacific Production Services (PPS)',name:'Difficult Permit Application',billingType:'flat',weeklyRate:0,flatRate:225,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'permit-rider',vendor:'Pacific Production Services (PPS)',name:'Permit Rider',billingType:'flat',weeklyRate:0,flatRate:125,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'layout',vendor:'The Sunset Group LA, Inc. / Matmen',name:'Layout Board Labor',billingType:'flat',weeklyRate:0,flatRate:37.29,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'shower',vendor:'Hollywood Executive Restrooms LLC',name:'2-room Shower Trailer',billingType:'flat',weeklyRate:0,flatRate:2500,serviceRate:35,deliveryFee:0,pickupFee:0},
  {id:'changing',vendor:'Hollywood Executive Restrooms LLC',name:'5-room Changing Trailer',billingType:'flat',weeklyRate:0,flatRate:1150,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hmu',vendor:'Hollywood Executive Restrooms LLC',name:'6-station HMU Trailer',billingType:'flat',weeklyRate:0,flatRate:1150,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'cleaning',vendor:'White Tee Set Cleaning',name:'Set Cleaning',billingType:'flat',weeklyRate:0,flatRate:0,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'hdr',vendor:'Hollywood Depot Rentals (HDR)',name:'Equipment Rental Order',billingType:'flat',weeklyRate:0,flatRate:0,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'tent-20x20',vendor:'American Tents',name:'20 × 20 Frame Tent',billingType:'flat',weeklyRate:2469,flatRate:2179,serviceRate:0,deliveryFee:0,pickupFee:0},
  {id:'tent-20x40',vendor:'American Tents',name:'20 × 40 Frame Tent',billingType:'flat',weeklyRate:3290.55,flatRate:2698.13,serviceRate:0,deliveryFee:0,pickupFee:0},
]
const initialItems: BudgetItem[] = templateItems()

function withRequiredVendors(items: VendorItem[]) {
  const byId = new Map((items || []).map(v => [v.id, v]))
  const byKey = new Set((items || []).map(v => `${v.vendor}|${v.name}`.toLowerCase()))
  const missing = defaultVendors.filter(v => !byId.has(v.id) && !byKey.has(`${v.vendor}|${v.name}`.toLowerCase()))
  return [...(items || []), ...missing]
}


function applyLocationFeeDefaults(items: BudgetItem[], changedId: string, patch: Partial<BudgetItem>) {
  const changed = items.find(i => i.id === changedId)
  if (!changed || changed.sectionId !== 'location-fees') {
    return items.map(i => i.id === changedId ? {...i, ...patch} : i)
  }

  const nextItems = items.map(i => i.id === changedId ? {...i, ...patch, calcType:'rateDay' as CalcType} : i)
  const changedName = (patch.name ?? changed.name).trim().toLowerCase()
  if (changedName !== 'shoot day') return nextItems

  const oldShootRate = changed.dayRate || 0
  const newShootRate = patch.dayRate ?? oldShootRate
  const oldPrepStrikeRate = oldShootRate / 2
  const oldHoldRate = oldShootRate / 4
  const nextPrepStrikeRate = newShootRate / 2
  const nextHoldRate = newShootRate / 4

  return nextItems.map(item => {
    if (item.sectionId !== 'location-fees' || item.id === changedId) return item
    const name = item.name.trim().toLowerCase()
    if (name === 'prep day' || name === 'strike day') {
      const current = item.dayRate || 0
      if (current === 0 || Math.abs(current - oldPrepStrikeRate) < 0.001) return {...item, dayRate:nextPrepStrikeRate, calcType:'rateDay' as CalcType}
    }
    if (name === 'hold day') {
      const current = item.dayRate || 0
      if (current === 0 || Math.abs(current - oldHoldRate) < 0.001) return {...item, dayRate:nextHoldRate, calcType:'rateDay' as CalcType}
    }
    return item
  })
}


function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
}

function moneyPrecise(n: number) {
  const value = n || 0
  const hasCents = Math.abs(value - Math.round(value)) > 0.001
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 }).format(value)
}

function calcItem(item: BudgetItem) {
  // Location site fees always calculate as rate per day × number of days,
  // including older items that may have originally been saved as flat costs.
  if (item.sectionId === 'location-fees') return (item.days || 0) * (item.dayRate || 0)

  const people = item.people || 0
  const days = item.days || 0
  const kit = item.kitFee || 0
  if (item.calcType === 'flat') return item.flatAmount || 0
  if (item.calcType === 'rateDay') return (item.days || 0) * (item.dayRate || 0)
  if (item.calcType === 'hourly') {
    const r = item.hourlyRate || 0
    const labor = people * days * (((item.regHours || 0) * r) + ((item.ot15Hours || 0) * r * 1.5) + ((item.ot2Hours || 0) * r * 2))
    const kitTotal = item.kitFeeMode === 'flat' ? kit : people * days * kit
    return labor + kitTotal
  }
  if (item.calcType === 'dayRate') {
    const base = people * days * (item.dayRate || 0)
    const hourlyEquivalent = (item.dayRate || 0) / Math.max(item.includedHours || 12, 1)
    const overtime = people * days * (((item.ot15Hours || 0) * hourlyEquivalent * 1.5) + ((item.ot2Hours || 0) * hourlyEquivalent * 2))
    const kitTotal = item.kitFeeMode === 'flat' ? kit : people * days * kit
    return base + overtime + kitTotal
  }
  if (item.calcType === 'vendor') {
    const rental = item.vendorBillingType === 'flat'
      ? (item.units || 0) * (item.vendorFlatRate || 0)
      : (item.units || 0) * (item.weeks || 0) * (item.weeklyRate || 0)
    const service = (item.units || 0) * (item.servicesPerUnit || 0) * (item.serviceRate || 0)
    return rental + service + (item.flatAmount || 0)
  }
  return 0
}

const iconMap: Record<string, React.ReactNode> = {
  building: <Building2 size={18} />, users: <Users size={18} />, shield: <Shield size={18} />,
  truck: <Truck size={18} />, flame: <Flame size={18} />, clipboard: <ClipboardList size={18} />,
  map: <MapPin size={18} />, warehouse: <Warehouse size={18} />, wrench: <Wrench size={18} />,
  dollar: <DollarSign size={18} />, sparkles: <Sparkles size={18} />, file: <FileText size={18} />,
}

function App() {
  const hubShowId = useMemo(() => getShowId(), [])
  const hubShowName = useMemo(() => getShowName(), [])
  const requestedBudgetId = useMemo(() => new URLSearchParams(window.location.search).get('budgetId') || '', [])
  const requestedLocationId = useMemo(() => new URLSearchParams(window.location.search).get('locationId') || '', [])
  const [shows, setShows] = useState<ShowProfile[]>(() => {
    const saved = localStorage.getItem('tb-shows')
    if (saved) return JSON.parse(saved)
    return [{id:hubShowId || 'el-dorado-s3',name:hubShowName || 'EL DORADO',productionCompany:'',season:'Season 3',episodes:['Episode 303','Episode 304','Episode 305','Episode 306','Episode 307','Episode 308'],defaultContingency:10000,defaultCityId:'la-city',createdAt:new Date().toISOString()}]
  })
  const [activeShowId, setActiveShowId] = useState(() => hubShowId || localStorage.getItem('tb-active-show') || shows[0]?.id || '')
  const [appView, setAppView] = useState<'home'|'setup'|'budget'>(() => (hubShowId || localStorage.getItem('tb-active-show') || shows.length === 1) ? 'budget' : 'home')
  const [editingShow, setEditingShow] = useState<ShowProfile | null>(null)
  const [cities, setCities] = useState<CityProfile[]>(() => {
    const saved = localStorage.getItem('tb-cities') || localStorage.getItem('lbs-cities')
    return saved ? normalizeCities(JSON.parse(saved)) : defaultCities
  })
  const [vendors, setVendors] = useState<VendorItem[]>(() => {
    const saved = localStorage.getItem('tb-vendors') || localStorage.getItem('lbs-vendors')
    return saved ? withRequiredVendors(JSON.parse(saved)) : defaultVendors
  })
  const [budgets, setBudgets] = useState<BudgetPage[]>(() => {
    const saved = localStorage.getItem('tb-budgets')
    if (saved) return JSON.parse(saved).map((b:BudgetPage) => ({...b, showId:b.showId || 'legacy-show', items:b.items || [], customSections:b.customSections || [], sectionOverrides:b.sectionOverrides || {}}))
    const legacyItems = localStorage.getItem('lbs-items')
    return [{
      id: crypto.randomUUID(), showId: hubShowId || 'el-dorado-s3', episode: 'Episode 303', production: 'EL DORADO',
      setName: 'Ext. Salt Lake City - Outskirts / Ext. Pine Tree Forest', setNumber: '4.14, 4.15, 4.16', location: 'Darling Ranch',
      version: 'Budget V1', cityId: 'la-city', contingency: 10000, keyAssistantLocationManager:'Taylor Erickson', address:'1773 Darling Ave, Frazier Park, CA 93225', prepStart:'2026-07-30', prepEnd:'2026-07-31', shootStart:'2026-08-03', shootEnd:'2026-08-03', holdStart:'2026-08-01', holdEnd:'2026-08-02', strikeStart:'2026-08-04', strikeEnd:'2026-08-04', sharedLocationId:'darling-ranch',
      items: legacyItems ? JSON.parse(legacyItems) : initialItems,
    }]
  })
  const [activeBudgetId, setActiveBudgetId] = useState(() => requestedBudgetId || budgets.find(b=>requestedLocationId&&b.sharedLocationId===requestedLocationId)?.id || budgets[0]?.id || '')
  const [openEpisodes, setOpenEpisodes] = useState<string[]>(() => budgets[0] ? [budgetEpisodeGroup(budgets[0].episode)] : [])
  const [openSections, setOpenSections] = useState<string[]>(['location-fees', 'staffing', 'vendors'])
  const [activeModal, setActiveModal] = useState<'item' | 'city' | 'vendor' | 'newBudget' | 'copyBudget' | 'addSection' | 'printSelection' | 'connections' | null>(null)
  const [activeSection, setActiveSection] = useState('staffing')
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null)
  const [saveState, setSaveState] = useState<'saved'|'saving'>('saved')
  const [syncState, setSyncState] = useState<'local'|'connecting'|'connected'|'error'>('connecting')
  const [syncMessage, setSyncMessage] = useState('Connecting…')
  const [remoteReady, setRemoteReady] = useState(false)
  const [printBudgetIds, setPrintBudgetIds] = useState<string[]>([])
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [showActuals, setShowActuals] = useState(false)
  const [finalTracker, setFinalTracker] = useState(() => localStorage.getItem('tb-final-tracker') === '1')
  useEffect(()=>{localStorage.setItem('tb-final-tracker', finalTracker?'1':'0'); if(finalTracker) setShowActuals(true)},[finalTracker])
  const [printOrientation, setPrintOrientation] = useState<'portrait'|'landscape'>(() => (localStorage.getItem('tb-print-orientation') as 'portrait'|'landscape') || 'landscape')
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const [biblePayload, setBiblePayload] = useState<any>(null)
  const lastRemoteSaveAtRef = useRef(0)
  const remoteHydratingRef = useRef(false)

  // Local backup should never interrupt typing or change button state.
  useEffect(() => { const t=setTimeout(()=>{ localStorage.setItem('tb-budgets', JSON.stringify(budgets)) },600); return ()=>clearTimeout(t) }, [budgets])

  useEffect(() => {
    if (appView === 'home' && shows.length === 1) {
      const onlyShow = shows[0]
      setActiveShowId(onlyShow.id)
      const first = budgets.find(b => (b.showId || 'legacy-show') === onlyShow.id)
      setActiveBudgetId(first?.id || budgets[0]?.id || '')
      setOpenEpisodes([orderedBudgetEpisodes(onlyShow.episodes)[0]])
      setAppView('budget')
    }
  }, [appView, shows, budgets])

  useEffect(() => {
    if (!hubShowId || !supabaseConfigured) { setSyncState('local'); setSyncMessage('Local mode'); setRemoteReady(true); return }
    let cancelled=false
    const hydrate = async () => {
      if (remoteHydratingRef.current) return
      remoteHydratingRef.current = true
      try {
        setSyncState('connecting'); setSyncMessage('Connecting…')
        const session=await getSession(); if(!session) throw new Error('Not signed in')
        const [doc,locations,bibleDoc]=await Promise.all([loadBudgetDocument(hubShowId),loadSharedLocations(hubShowId),loadBibleDocument(hubShowId)])
        if(cancelled)return
        const sharedShow:ShowProfile={id:hubShowId,name:hubShowName||'EL DORADO',productionCompany:'',season:'',episodes:Array.from(new Set(locations.map((r:any)=>r.episode_name||r.episode_id).filter(Boolean))),defaultContingency:10000,defaultCityId:'la-city',createdAt:new Date().toISOString()}
        setShows(prev=>prev.some(s=>s.id===hubShowId)?prev.map(s=>s.id===hubShowId?{...s,...sharedShow,episodes:sharedShow.episodes.length?sharedShow.episodes:s.episodes}:s):[...prev,sharedShow])
        setActiveShowId(hubShowId); setAppView('budget')
        let remoteBudgets:BudgetPage[] = Array.isArray(doc?.payload?.budgets) ? doc.payload.budgets : []
        const calendarDrafts:BudgetPage[] = locations.filter((r:any)=>r.source==='calendar').map((r:any)=>({
          id:`calendar-${r.id}`,showId:hubShowId,episode:r.episode_name||r.episode_id||'Episode',production:hubShowName||'EL DORADO',setName:r.set_name||'New Set',setNumber:r.metadata?.scenes||'',scenes:r.metadata?.scenes||'',location:r.location_name||'',version:'Budget V1',cityId:'la-city',contingency:10000,keyAssistantLocationManager:Array.isArray(r.metadata?.key_ids)?r.metadata.key_ids.join(', '):'',address:r.address||'',contact:r.contact_name||'',phone:r.contact_phone||'',sharedLocationId:r.id,calendarAssignmentIds:[r.metadata?.calendar_event_id].filter(Boolean),prepStart:r.metadata?.schedule?.prep_start||'',prepEnd:r.metadata?.schedule?.prep_end||'',shootStart:r.metadata?.schedule?.shoot_start||'',shootEnd:r.metadata?.schedule?.shoot_end||'',holdStart:r.metadata?.schedule?.hold_start||'',holdEnd:r.metadata?.schedule?.hold_end||'',strikeStart:r.metadata?.schedule?.strike_start||'',strikeEnd:r.metadata?.schedule?.strike_end||'',items:templateItems(),customSections:[],sectionOverrides:{}
        }))
        if(remoteBudgets.length){
          const norm=(v:any)=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
          const reconciled=remoteBudgets.map(b=>{const linked=locations.find((r:any)=>b.sharedLocationId&&r.id===b.sharedLocationId)||locations.find((r:any)=>norm(r.episode_name||r.episode_id)===norm(b.episode)&&norm(r.set_name)===norm(b.setName))||locations.find((r:any)=>norm(r.episode_name||r.episode_id)===norm(b.episode)&&norm(r.location_name)===norm(b.location));const sc=linked?.metadata?.schedule||{};return{...b,showId:hubShowId,sharedLocationId:linked?.id||b.sharedLocationId,location:linked?.location_name||b.location,setName:linked?.set_name||b.setName,address:linked?.address||b.address,prepStart:sc.prep_start||b.prepStart||'',prepEnd:sc.prep_end||b.prepEnd||'',shootStart:sc.shoot_start||b.shootStart||'',shootEnd:sc.shoot_end||b.shootEnd||'',holdStart:sc.hold_start||b.holdStart||'',holdEnd:sc.hold_end||b.holdEnd||'',strikeStart:sc.strike_start||b.strikeStart||'',strikeEnd:sc.strike_end||b.strikeEnd||'',items:withRequiredTemplate(b.items||[])}});
          // Calendar is the source of truth for which location budgets should exist. Keep existing budgets,
          // then create a clean draft for any new Calendar location that does not have one yet.
          const linkedIds=new Set(reconciled.map(b=>b.sharedLocationId).filter(Boolean));
          const missingDrafts=calendarDrafts.filter(d=>d.sharedLocationId&&!linkedIds.has(d.sharedLocationId));
          const merged=[...reconciled,...missingDrafts];
          setBudgets(merged);
          const requested=merged.find(b=>requestedBudgetId&&b.id===requestedBudgetId)||merged.find(b=>requestedLocationId&&b.sharedLocationId===requestedLocationId);if(requested){setActiveBudgetId(requested.id);setOpenEpisodes(prev=>[...new Set([...prev,budgetEpisodeGroup(requested.episode)])])}
        }
        else if(calendarDrafts.length){ setBudgets(prev=>{const other=prev.filter(b=>b.showId!==hubShowId); return [...other,...calendarDrafts]});const requested=calendarDrafts.find(b=>requestedLocationId&&b.sharedLocationId===requestedLocationId);if(requested)setActiveBudgetId(requested.id) }
        if(doc?.payload?.cities) setCities(normalizeCities(doc.payload.cities))
        if(doc?.payload?.vendors) setVendors(withRequiredVendors(doc.payload.vendors))
        setBiblePayload(bibleDoc?.payload || null)
        setSyncState('connected'); setSyncMessage('Connected'); setRemoteReady(true)
      } catch(e:any) { if(!cancelled){setSyncState('error');setSyncMessage(e?.message||'Sync error');setRemoteReady(true)} }
      finally { remoteHydratingRef.current = false }
    }
    hydrate()
    const unsub=subscribeBudget(hubShowId,()=>{
      // Ignore our own realtime echo and never replace state while the user is typing.
      if (Date.now() - lastRemoteSaveAtRef.current < 5000) return
      const active = document.activeElement as HTMLElement | null
      if (active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName)) return
      hydrate()
    })
    return()=>{cancelled=true;unsub()}
  },[hubShowId,hubShowName])

  useEffect(() => {
    if(!hubShowId || !supabaseConfigured || !remoteReady || syncState==='error') return
    const t=setTimeout(async()=>{try{await saveBudgetDocument(hubShowId,{version:1,budgets:budgets.filter(b=>b.showId===hubShowId),cities,vendors});lastRemoteSaveAtRef.current=Date.now();setSyncState('connected');setSyncMessage('Connected')}catch(e:any){setSyncState('error');setSyncMessage(e?.message||'Sync error')}},3000)
    return()=>clearTimeout(t)
  },[budgets,cities,vendors,hubShowId,remoteReady])
  useEffect(() => localStorage.setItem('tb-cities', JSON.stringify(cities)), [cities])
  useEffect(() => localStorage.setItem('tb-vendors', JSON.stringify(vendors)), [vendors])
  useEffect(() => {
    localStorage.setItem('tb-print-orientation', printOrientation)
    let style = document.getElementById('tb-print-page-style') as HTMLStyleElement | null
    if (!style) { style = document.createElement('style'); style.id = 'tb-print-page-style'; document.head.appendChild(style) }
    style.textContent = `@media print { @page { size: ${printOrientation}; margin: .35in; } }`
  }, [printOrientation])

  useEffect(() => localStorage.setItem('tb-shows', JSON.stringify(shows)), [shows])
  useEffect(() => { if (activeShowId) localStorage.setItem('tb-active-show', activeShowId); else localStorage.removeItem('tb-active-show') }, [activeShowId])

  const activeShow = shows.find(s => s.id === activeShowId)
  const showBudgets = budgets.filter(b => (b.showId || 'legacy-show') === activeShowId)
  const budget = showBudgets.find(b => b.id === activeBudgetId) || showBudgets[0]
  useEffect(() => { if (!budget && showBudgets[0]) setActiveBudgetId(showBudgets[0].id) }, [budget, showBudgets])

  const openShow = (show:ShowProfile) => { setActiveShowId(show.id); const first=budgets.find(b=>(b.showId||'legacy-show')===show.id); setActiveBudgetId(first?.id || ''); setOpenEpisodes([budgetEpisodeGroup(first?.episode) || orderedBudgetEpisodes(show.episodes)[0]]); setAppView('budget') }
  const saveShow = (show:ShowProfile) => {
    const exists=shows.some(s=>s.id===show.id)
    setShows(exists?shows.map(s=>s.id===show.id?show:s):[...shows,show])
    setEditingShow(null); openShow(show)
  }
  if (appView === 'home') return <ShowHome shows={shows} budgets={budgets} onOpen={openShow} onNew={()=>{setEditingShow(null);setAppView('setup')}} onEdit={(show)=>{setEditingShow(show);setAppView('setup')}} onDelete={(show)=>{
    setShows(prev => prev.filter(s => s.id !== show.id))
    setBudgets(prev => prev.filter(b => (b.showId || 'legacy-show') !== show.id))
    if (activeShowId === show.id) { setActiveShowId(''); localStorage.removeItem('tb-active-show') }
  }} />
  if (appView === 'setup') return <ShowSetup initial={editingShow || undefined} cities={cities} onCancel={()=>setAppView('home')} onSave={saveShow} />
  if (!activeShow) { setAppView('home'); return null }
  if (!budget) return <EmptyShow show={activeShow} onHome={()=>setAppView('home')} onNew={()=>{ const created:BudgetPage={id:crypto.randomUUID(),showId:activeShow.id,production:activeShow.name,episode:activeShow.episodes[0]||'Episode 1',setName:'New Set',setNumber:'',location:'',version:'Budget V1',cityId:activeShow.defaultCityId||cities[0]?.id||'',contingency:activeShow.defaultContingency,keyAssistantLocationManager:'',items:templateItems(),customSections:[],sectionOverrides:{}}; setBudgets([...budgets,created]); setActiveBudgetId(created.id) }} onEdit={()=>{setEditingShow(activeShow);setAppView('setup')}} />

  const sections = [...standardSections, ...(budget.customSections || [])].map(s => ({...s, ...(budget.sectionOverrides?.[s.id] || {})}))
  const items = budget.items
  const city = cities.find(c => c.id === budget.cityId)
  const sectionTotals = Object.fromEntries(sections.map(s => [s.id, items.filter(i => i.sectionId === s.id).reduce((sum, i) => sum + calcItem(i), 0)]))
  const total = items.reduce((sum, i) => sum + calcItem(i), 0)
  const allBibleCommitments = normalizeBibleCommitments(biblePayload)
  const locationCommitments = allBibleCommitments.filter(c => !c.locationId || c.locationId === budget.sharedLocationId)
  const orderedCommitments = locationCommitments.filter(c => c.status === 'ordered' || c.status === 'committed' || c.status === 'paid')
  const committedTotal = orderedCommitments.reduce((sum,c)=>sum + Number(c.amount || c.workingTotal || 0),0)
  const remainingBudget = total - committedTotal
  const commitmentBySection = orderedCommitments.reduce((acc:Record<string,number>,c)=>{const key=c.sectionId||'vendors';acc[key]=(acc[key]||0)+Number(c.amount||c.workingTotal||0);return acc},{})
  const episodes = orderedBudgetEpisodes([...(activeShow?.episodes || []), ...showBudgets.map(b => b.episode)])

  const updateBudget = (patch: Partial<BudgetPage>) => setBudgets(prev => prev.map(b => b.id === budget.id ? {...b, ...patch} : b))
  const deleteCurrentBudget = () => {
    if (!window.confirm(`Delete budget “${budget.setName}”? This permanently removes this budget and cannot be undone.`)) return
    const remaining = showBudgets.filter(b => b.id !== budget.id)
    setBudgets(prev => prev.filter(b => b.id !== budget.id))
    setActiveBudgetId(remaining[0]?.id || '')
  }
  const updateSection = (sectionId:string, patch:{name?:string;account?:string}) => updateBudget({sectionOverrides:{...(budget.sectionOverrides||{}),[sectionId]:{...(budget.sectionOverrides?.[sectionId]||{}),...patch}}})
  const updateItem = (id:string, patch:Partial<BudgetItem>) => updateBudget({items:applyLocationFeeDefaults(items,id,patch)})
  const saveNow = async () => { localStorage.setItem('tb-budgets', JSON.stringify(budgets)); localStorage.setItem('tb-cities', JSON.stringify(cities)); localStorage.setItem('tb-vendors', JSON.stringify(vendors)); if(hubShowId&&supabaseConfigured){try{setSaveState('saving');await saveBudgetDocument(hubShowId,{version:1,budgets:budgets.filter(b=>b.showId===hubShowId),cities,vendors});lastRemoteSaveAtRef.current=Date.now();setSyncState('connected');setSyncMessage('Connected')}catch(e:any){setSyncState('error');setSyncMessage(e?.message||'Sync error')}} setSaveState('saved') }
  const printBudget = () => { setPrintBudgetIds([budget.id]); saveNow(); window.setTimeout(() => window.print(), 80) }
  const printSelectedBudgets = (ids:string[]) => { setPrintBudgetIds(ids); saveNow(); setActiveModal(null); window.setTimeout(() => window.print(), 120) }
  const saveItem = (item: BudgetItem) => {
    const existing = items.find(i => i.id === item.id)
    const next = existing
      ? applyLocationFeeDefaults(items, item.id, item)
      : [...items, item]
    updateBudget({items: next})
    if (!openSections.includes(item.sectionId)) setOpenSections(prev => [...prev, item.sectionId])
  }
  const deleteItem = (id: string) => updateBudget({items: items.filter(i => i.id !== id)})
  const duplicateItem = (item: BudgetItem) => {
    const duplicate: BudgetItem = {...item, id: crypto.randomUUID(), name: `${item.name} Copy`}
    const index = items.findIndex(i => i.id === item.id)
    const next = [...items]
    next.splice(index >= 0 ? index + 1 : next.length, 0, duplicate)
    updateBudget({items: next})
    if (!openSections.includes(item.sectionId)) setOpenSections(prev => [...prev, item.sectionId])
  }
  const startAddItem = (sectionId: string) => { setEditingItem(null); setActiveSection(sectionId); setActiveModal('item') }
  const startEditItem = (item: BudgetItem) => { setEditingItem(item); setActiveSection(item.sectionId); setActiveModal('item') }

  const contextQuery = new URLSearchParams({
    show: activeShow.id,
    showId: activeShow.id,
    showName: activeShow.name,
    ...(budget.sharedLocationId ? { locationId: budget.sharedLocationId } : {}),
    budgetId: budget.id,
    fromHub: '1'
  }).toString()
  const calendarUrl = `${import.meta.env.VITE_CALENDAR_URL || 'https://calendar.taylorscout.com'}?${contextQuery}`
  const bibleUrl = `${import.meta.env.VITE_BIBLE_URL || 'https://bible.taylorscout.com'}?${contextQuery}`

  return (
    <div className="app-shell">
      <header className="suite-global-bar no-print">
        <button className="suite-global-brand" onClick={()=>window.location.href='https://www.taylorscout.com'}><span className="suite-logo-tile"><TaylorScoutLogo compact/></span><span><b>TAYLOR SCOUT</b><small>PRODUCTION TOOLS</small></span></button>
        <strong>{activeShow.name}</strong>
        <div className="suite-global-tools">
          <div className="tool-switcher" aria-label="Connected tools"><button className="tool-tab" onClick={()=>window.location.href=calendarUrl}>Calendar</button><button className="tool-tab active" aria-current="page">Budget</button><button className="tool-tab" onClick={()=>window.location.href=bibleUrl}>Bible</button></div>
        </div>
      </header>
      <aside className="sidebar no-print">
        <div className="canonical-side-show"><strong>{activeShow.name}</strong><small>BUDGETS</small></div>
        <button className="show-switcher" onClick={()=>window.location.href='https://www.taylorscout.com'}><Home size={15}/> Show Dashboard</button><button className="show-switcher" onClick={()=>setAppView('home')}><ArrowLeft size={15}/> All Budgets</button>
        <button className="show-switcher" onClick={()=>{setEditingShow(activeShow);setAppView('setup')}}><Settings size={15}/> Show Settings</button>
        <button className="new-budget-btn" onClick={() => setActiveModal('newBudget')}><Plus size={17}/> New Budget</button>
        <div className="episode-nav-title"><Film size={15}/> Episodes</div>
        <div className="episode-tree">
          {episodes.map(ep => {
            const groupedBudgets = showBudgets.filter(b => budgetEpisodeGroup(b.episode) === ep)
            const open = openEpisodes.includes(ep)
            return <div className="episode-group" key={ep}>
              <button className="episode-toggle" onClick={() => setOpenEpisodes(open ? openEpisodes.filter(x => x !== ep) : [...openEpisodes, ep])}>{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<span>{ep}</span><b>{groupedBudgets.length}</b></button>
              {open && <div className="episode-budgets">{groupedBudgets.map(b => <button key={b.id} className={`budget-link ${b.id===budget.id?'active':''}`} onClick={() => setActiveBudgetId(b.id)}><FolderOpen size={14}/><span>{b.setName}</span><small>{money(b.items.reduce((sum,i)=>sum+calcItem(i),0))}</small></button>)}</div>}
            </div>
          })}
        </div>
        <nav className="library-nav">
          <button className="nav-item" onClick={() => setActiveModal('city')}><ClipboardList size={18}/> City Rate Library</button>
          <button className="nav-item" onClick={() => setActiveModal('vendor')}><Warehouse size={18}/> Vendor Library</button>
        </nav>
        <div className="sidebar-footer">{syncMessage}</div>
      </aside>

      <main className="main-content">
        <header className="topbar no-print budget-topbar">
          <div className="budget-title"><span className="eyebrow">{budget.episode} · LOCATIONS DEPARTMENT</span><h1>{budget.setName}</h1><p>{budget.location}</p></div>
          <div className="top-actions"><button className="secondary" onClick={()=>window.location.href='https://www.taylorscout.com'}><Home size={17}/> Home</button><button className="save-budget-btn" onClick={saveNow} disabled={saveState==='saving'} aria-busy={saveState==='saving'}>Save Budget</button>
            <button className="secondary" onClick={() => setActiveModal('copyBudget')}><Copy size={17}/> Duplicate Budget</button>
            <div className="print-dropdown"><button className="secondary print-trigger" onClick={()=>setPrintMenuOpen(!printMenuOpen)}><Printer size={16}/> Print <ChevronDown size={15}/></button>{printMenuOpen&&<div className="print-menu"><button onClick={()=>{setPrintOrientation('landscape');setPrintMenuOpen(false);window.setTimeout(printBudget,80)}}><FileText size={16}/><span><b>Landscape</b><small>Print this budget landscape</small></span></button><button onClick={()=>{setPrintMenuOpen(false);printBudget()}}><Printer size={16}/><span><b>Set</b><small>Print the current set budget</small></span></button><button onClick={()=>{setPrintMenuOpen(false);setActiveModal('printSelection')}}><Copy size={16}/><span><b>Episode / Sets</b><small>Choose multiple set budgets</small></span></button></div>}</div>
            <button className={`secondary actuals-toggle ${finalTracker?'active':''}`} onClick={()=>setFinalTracker(v=>!v)}><ClipboardList size={17}/>{finalTracker?'Exit Final Tracker':'Final Tracker'}</button><button className={`secondary actuals-toggle ${showActuals?'active':''}`} onClick={()=>setShowActuals(v=>!v)}><ClipboardList size={17}/>{showActuals?'Hide Actuals':'Show Actuals'}</button><button className="secondary" onClick={()=>setOpenSections(openSections.length===sections.length?[]:sections.map(s=>s.id))}>{openSections.length===sections.length?<><ChevronsUp size={17}/> Collapse All</>:<><ChevronsDown size={17}/> Expand All</>}</button>
<button className="primary" onClick={() => startAddItem('unexpected')}><Plus size={17}/> Add Cost</button><button className="danger-button delete-budget-button" onClick={deleteCurrentBudget}><Trash2 size={17}/> Delete Budget</button>
          </div>
        </header>

        <section className={`project-card ${detailsExpanded?'details-open':'details-collapsed'}`}><button className="project-summary-toggle no-print" onClick={()=>setDetailsExpanded(!detailsExpanded)}><span><b>{budget.production}</b> · {budget.episode} · {budget.location||'No location'}</span><small>{detailsExpanded?'Hide location details':'Show location details'}</small></button>
          <div className={`project-fields ${detailsExpanded?'expanded':'collapsed'}`}>
            <label>Production<input value={budget.production} onChange={e => updateBudget({production:e.target.value})}/></label>
            <label>Episode<input value={budget.episode} onChange={e => updateBudget({episode:e.target.value})}/></label>
            <label>Set name<input value={budget.setName} onChange={e => updateBudget({setName:e.target.value})}/></label>
            <label>Set #<input value={budget.setNumber} onChange={e => updateBudget({setNumber:e.target.value})}/></label>
            <label>City<div className="city-select-row"><select value={budget.cityId} onChange={e => updateBudget({cityId:e.target.value})}>{cities.map(c => <option key={c.id} value={c.id}>{c.city}, {c.state}</option>)}</select><button type="button" className="edit-city-btn" onClick={()=>setActiveModal('city')} title="Edit city information"><Pencil size={14}/></button></div></label>
            <label>Version<input value={budget.version} onChange={e => updateBudget({version:e.target.value})}/></label>
            <label>Key Assistant Location Manager<input value={budget.keyAssistantLocationManager || ''} onChange={e => updateBudget({keyAssistantLocationManager:e.target.value})} placeholder="Name assigned to this set"/></label>
            <label>Location<input value={budget.location} onChange={e => updateBudget({location:e.target.value})}/></label><label>Scenes<input value={budget.scenes || budget.setNumber || ''} onChange={e => updateBudget({scenes:e.target.value})}/></label><label>Address<input value={budget.address || ''} onChange={e => updateBudget({address:e.target.value})}/></label><label>Contact<input value={budget.contact || ''} onChange={e => updateBudget({contact:e.target.value})}/></label><label>Phone<input value={budget.phone || ''} onChange={e => updateBudget({phone:e.target.value})}/></label><label>Prep dates<input readOnly value={[budget.prepStart,budget.prepEnd].filter(Boolean).join(' – ')} placeholder="Import from Calendar"/></label><label>Shoot dates<input readOnly value={[budget.shootStart,budget.shootEnd].filter(Boolean).join(' – ')} placeholder="Import from Calendar"/></label><label>Hold dates<input readOnly value={[budget.holdStart,budget.holdEnd].filter(Boolean).join(' – ')} placeholder="Import from Calendar"/></label><label>Strike dates<input readOnly value={[budget.strikeStart,budget.strikeEnd].filter(Boolean).join(' – ')} placeholder="Import from Calendar"/></label>
          </div>
          <div className="metrics-row connected-financials">
            <Metric label="Current estimate" value={money(total)} tone="dark" />
            <Metric label="Committed from Bible" value={money(committedTotal)} tone="commitment" />
            <Metric label={remainingBudget < 0 ? "Over budget" : "Remaining"} value={money(Math.abs(remainingBudget))} tone={remainingBudget < 0 ? "over" : "remaining"} />
            <EditableMetric label="Contingency" value={budget.contingency} onChange={v => updateBudget({contingency:v})} />
            <Metric label="With contingency" value={money(total + budget.contingency)} tone="accent" />
            {showActuals&&<><Metric label="Actuals" value={money(items.reduce((sum,i)=>sum+(i.actualAmount||0),0))} tone="actual"/><Metric label="Variance" value={money(total-items.reduce((sum,i)=>sum+(i.actualAmount||0),0))} tone={total-items.reduce((sum,i)=>sum+(i.actualAmount||0),0)<0?'over':'remaining'}/></>}
          </div>
        </section>

        <div className="section-list">
          {sections.map(section => {
            const open = openSections.includes(section.id)
            const sectionItems = items.filter(i => i.sectionId === section.id)
            return <section className="budget-section" key={section.id}>
              <div className="section-header">
                <button className="section-toggle-button" onClick={() => setOpenSections(open ? openSections.filter(x => x !== section.id) : [...openSections, section.id])}>{open ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>
                <span className="section-icon">{iconMap[section.icon]}</span>
                <div className="section-edit-fields">
                  <input className="section-name-input" value={section.name} onChange={e=>updateSection(section.id,{name:e.target.value})} aria-label="Section name"/>
                  <div className="account-edit"><span>Account</span><input value={section.account} onChange={e=>updateSection(section.id,{account:e.target.value})} aria-label={`${section.name} account number`}/><small>· {sectionItems.length} item{sectionItems.length === 1 ? '' : 's'}</small></div>
                </div>
                <div className="section-total"><strong>{money(sectionTotals[section.id] || 0)}</strong>{(commitmentBySection[section.id]||0)>0&&<small>{money(commitmentBySection[section.id])} committed</small>}</div>
              </div>
              {open && <div className="section-body">
                {sectionItems.length === 0 ? <div className="empty">No items yet.</div> : <BudgetTable sectionId={section.id} items={sectionItems} onEdit={startEditItem} onDelete={deleteItem} onDuplicate={duplicateItem} onUpdate={updateItem} showActuals={showActuals} />}
                <button className="add-row no-print" onClick={() => startAddItem(section.id)}><Plus size={16}/> Add item to {section.name}</button>
              </div>}
            </section>
          })}
        </div>
        <button className="add-section-btn no-print" onClick={() => setActiveModal('addSection')}><Plus size={18}/> Add a section</button>

        <div className="print-only print-multi">
          {(printBudgetIds.length ? showBudgets.filter(b=>printBudgetIds.includes(b.id)) : [budget]).map(printBudget => <PrintBudgetSheet key={printBudget.id} budget={printBudget} show={activeShow} city={cities.find(c=>c.id===printBudget.cityId)} />)}
        </div>
      </main>

      {activeModal === 'item' && <ItemModal sectionId={activeSection} sectionName={sections.find(s=>s.id===activeSection)?.name || 'Budget Item'} initialItem={editingItem || undefined} cities={cities} city={city} vendors={vendors} onClose={() => { setActiveModal(null); setEditingItem(null) }} onSave={item => { saveItem(item); setActiveModal(null); setEditingItem(null) }} />}
      {activeModal === 'city' && <LibraryModal title="City Rate Library" onClose={() => setActiveModal(null)}><CityLibrary cities={cities} setCities={setCities}/></LibraryModal>}
      {activeModal === 'vendor' && <LibraryModal title="Vendor Library" onClose={() => setActiveModal(null)}><VendorLibrary vendors={vendors} setVendors={setVendors}/></LibraryModal>}
      {activeModal === 'connections' && <ConnectionsModal budget={budget} activeShow={activeShow} calendarUrl={calendarUrl} bibleUrl={bibleUrl} onClose={()=>setActiveModal(null)} />}
      {activeModal === 'newBudget' && <BudgetSetupModal title="New Budget" episodes={episodes} onClose={() => setActiveModal(null)} onSave={(data) => { const created:BudgetPage={id:crypto.randomUUID(),showId:activeShow.id,production:activeShow.name,episode:data.episode,setName:data.setName,setNumber:data.setNumber,location:data.location,version:'Budget V1',cityId:activeShow.defaultCityId || budget.cityId,contingency:activeShow.defaultContingency,keyAssistantLocationManager:'',items:templateItems(),customSections:[],sectionOverrides:{}}; setBudgets([...budgets,created]); setActiveBudgetId(created.id); setOpenEpisodes([...new Set([...openEpisodes,budgetEpisodeGroup(created.episode)])]); setActiveModal(null) }} />}
      {activeModal === 'addSection' && <AddSectionModal onClose={() => setActiveModal(null)} onSave={(section) => { updateBudget({customSections:[...(budget.customSections||[]),section]}); setOpenSections([...openSections,section.id]); setActiveModal(null) }} />}
      {activeModal === 'printSelection' && <PrintSelectionModal episodes={episodes} budgets={showBudgets} currentEpisode={budget.episode} onClose={()=>setActiveModal(null)} onPrint={printSelectedBudgets}/>}
      {activeModal === 'copyBudget' && <BudgetSetupModal title="Duplicate Entire Budget" episodes={episodes} initial={{episode:budget.episode,setName:`${budget.setName} Copy`,setNumber:budget.setNumber,location:budget.location}} helper="Choose the same episode to create another set there, or select a different episode to move the duplicate into that episode. All sections, items, rates, city settings, contingency, and PO numbers will be copied and remain editable." submitLabel="Create Duplicate" onClose={() => setActiveModal(null)} onSave={(data) => { const copy:BudgetPage={...budget,id:crypto.randomUUID(),episode:data.episode,setName:data.setName,setNumber:data.setNumber,location:data.location,version:'Budget V1',customSections:(budget.customSections||[]).map(s=>({...s})),sectionOverrides:{...(budget.sectionOverrides||{})},items:budget.items.map(i=>({...i,id:crypto.randomUUID()}))}; setBudgets([...budgets,copy]); setActiveBudgetId(copy.id); setOpenEpisodes([...new Set([...openEpisodes,budgetEpisodeGroup(copy.episode)])]); setActiveModal(null) }} />}
    </div>
  )
}


function ShowHome({shows,budgets,onOpen,onNew,onEdit,onDelete}:{shows:ShowProfile[],budgets:BudgetPage[],onOpen:(s:ShowProfile)=>void,onNew:()=>void,onEdit:(s:ShowProfile)=>void,onDelete:(s:ShowProfile)=>void}) {
  const [showToDelete,setShowToDelete]=useState<ShowProfile|null>(null)
  const deleteBudgetCount=showToDelete?budgets.filter(b=>(b.showId||'legacy-show')===showToDelete.id).length:0
  const confirmDelete=()=>{ if(!showToDelete)return; onDelete(showToDelete); setShowToDelete(null) }
  return <div className="show-home">
    <div className="show-home-top"><div className="home-brand"><div className="brand-mark large">TB</div><div><span className="eyebrow">LOCATIONS DEPARTMENT</span><h1>Taylor Budget</h1><p>Open a production or set up a new show.</p></div></div><button className="primary big" onClick={onNew}><Plus size={18}/> Start New Show</button></div>
    <div className="show-home-content"><div className="home-section-title"><div><span className="eyebrow">YOUR PRODUCTIONS</span><h2>Shows</h2></div><span>{shows.length} show{shows.length===1?'':'s'}</span></div>
      <div className="show-card-grid">{shows.map(show=>{const count=budgets.filter(b=>(b.showId||'legacy-show')===show.id).length; return <article className="show-card" key={show.id} onClick={()=>onOpen(show)}>
        <div className="show-logo">{show.logo?<img src={show.logo} alt=""/>:<Film size={34}/>}</div><div className="show-card-body"><span>{show.season||'Production'}</span><h3>{show.name}</h3><p>{show.productionCompany||'Locations Department'}</p><div className="show-stats"><b>{show.episodes.length}</b> episodes <i>·</i> <b>{count}</b> budget pages</div></div>
        <div className="show-card-actions"><div className="show-card-icon-actions"><button className="icon-btn" onClick={e=>{e.stopPropagation();onEdit(show)}} title="Show settings"><Settings size={16}/></button><button className="icon-btn danger" onClick={e=>{e.stopPropagation();setShowToDelete(show)}} title="Delete show"><Trash2 size={16}/></button></div><button className="open-show">Open <Play size={14}/></button></div>
      </article>})}</div>
      {shows.length===0&&<div className="home-empty"><Film size={42}/><h3>No shows yet</h3><p>Create your first show to establish episodes, branding and budget defaults.</p><button className="primary" onClick={onNew}>Start New Show</button></div>}
    </div>
    {showToDelete&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowToDelete(null)}}><div className="modal delete-show-modal" role="dialog" aria-modal="true" aria-labelledby="delete-show-title">
      <div className="modal-head"><div><span className="eyebrow">DELETE SHOW</span><h2 id="delete-show-title">Are you sure?</h2></div><button className="icon-btn" onClick={()=>setShowToDelete(null)} aria-label="Close"><X/></button></div>
      <div className="delete-warning"><Trash2 size={28}/><div><strong>{showToDelete.name}</strong><p>This will permanently delete the show and {deleteBudgetCount} budget page{deleteBudgetCount===1?'':'s'} stored with it.</p><p><b>This cannot be undone.</b></p></div></div>
      <div className="modal-actions"><button className="secondary" onClick={()=>setShowToDelete(null)}>Cancel</button><button className="danger-button" onClick={confirmDelete}><Trash2 size={16}/> Delete Show</button></div>
    </div></div>}
  </div>
}

function ShowSetup({initial,cities,onCancel,onSave}:{initial?:ShowProfile,cities:CityProfile[],onCancel:()=>void,onSave:(s:ShowProfile)=>void}) {
  const [step,setStep]=useState(1)
  const [data,setData]=useState<ShowProfile>(initial||{id:crypto.randomUUID(),name:'',productionCompany:'',season:'',episodes:['Episode 1'],defaultContingency:0,defaultCityId:cities[0]?.id||'',createdAt:new Date().toISOString()})
  const [episodeText,setEpisodeText]=useState(data.episodes.join('\n'))
  const loadLogo=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>setData({...data,logo:String(reader.result)});reader.readAsDataURL(file)}
  const normalizedEpisodes=episodeText.split(/\n|,/).map(x=>x.trim()).filter(Boolean)
  const finish=()=>onSave({...data,episodes:normalizedEpisodes.length?normalizedEpisodes:['Episode 1']})
  return <div className="setup-shell"><div className="setup-aside"><button className="back-link" onClick={onCancel}><ArrowLeft size={16}/> Back to shows</button><div className="setup-brand"><div className="brand-mark large">TB</div><span className="eyebrow">NEW PRODUCTION</span><h1>{initial?'Show Settings':'Set up your show'}</h1><p>Build the foundation once. Every budget page will inherit these preferences.</p></div><div className="setup-steps">{['Show details','Episodes','Budget defaults','Review'].map((label,i)=><button key={label} className={step===i+1?'active':step>i+1?'done':''} onClick={()=>setStep(i+1)}><b>{step>i+1?'✓':i+1}</b><span>{label}</span></button>)}</div></div>
    <main className="setup-main"><div className="setup-card">
      {step===1&&<><span className="eyebrow">STEP 1 OF 4</span><h2>Show details</h2><p className="setup-intro">This information appears throughout the app and on printed budgets.</p><div className="logo-uploader">{data.logo?<img src={data.logo} alt="Show logo"/>:<Image size={34}/>}<div><strong>Show logo</strong><span>PNG or JPG. Used in the sidebar and future print branding.</span><label className="upload-btn">Choose Logo<input type="file" accept="image/*" onChange={e=>loadLogo(e.target.files?.[0])}/></label>{data.logo&&<button className="text-button" onClick={()=>setData({...data,logo:undefined})}>Remove</button>}</div></div><div className="form-grid"><label className="span-2">Show name<input autoFocus value={data.name} onChange={e=>setData({...data,name:e.target.value})} placeholder="Example: Fallout"/></label><label>Season<input value={data.season} onChange={e=>setData({...data,season:e.target.value})} placeholder="Season 3"/></label><label>Production company<input value={data.productionCompany} onChange={e=>setData({...data,productionCompany:e.target.value})} placeholder="Production company"/></label></div></>}
      {step===2&&<><span className="eyebrow">STEP 2 OF 4</span><h2>Episodes</h2><p className="setup-intro">Enter one episode per line. These become the permanent episode folders in the sidebar.</p><label className="episode-editor">Episode list<textarea value={episodeText} onChange={e=>setEpisodeText(e.target.value)} rows={10} placeholder={'Episode 301\nEpisode 302\nEpisode 303'}/><small>{normalizedEpisodes.length} episode{normalizedEpisodes.length===1?'':'s'} will be created</small></label><div className="episode-preview">{normalizedEpisodes.map((ep,i)=><span key={`${ep}-${i}`}><Film size={14}/>{ep}</span>)}</div></>}
      {step===3&&<><span className="eyebrow">STEP 3 OF 4</span><h2>Budget defaults</h2><p className="setup-intro">New budget pages will start with these settings. You can keep refining the template while we work out the kinks.</p><div className="form-grid"><label>Default city<select value={data.defaultCityId} onChange={e=>setData({...data,defaultCityId:e.target.value})}>{cities.map(c=><option key={c.id} value={c.id}>{c.city}, {c.state}</option>)}</select></label><label>Default contingency ($)<input type="number" value={data.defaultContingency} onChange={e=>setData({...data,defaultContingency:+e.target.value})}/></label></div><div className="default-preview"><strong>Every new budget includes</strong><div className="preference-chips">{standardSections.slice(0,11).map(s=><span key={s.id}>{s.name}</span>)}</div><p>Location fee lines, 12-hour security presets, parking lines and core vendor items are added automatically.</p></div></>}
      {step===4&&<><span className="eyebrow">STEP 4 OF 4</span><h2>Ready to go</h2><p className="setup-intro">Review the show foundation before opening the workspace.</p><div className="review-show"><div className="review-logo">{data.logo?<img src={data.logo} alt=""/>:<Film size={38}/>}</div><div><span>{data.season||'Production'}</span><h3>{data.name||'Untitled Show'}</h3><p>{data.productionCompany||'No production company entered'}</p></div></div><div className="review-grid"><div><span>Episodes</span><strong>{normalizedEpisodes.length||1}</strong></div><div><span>Default city</span><strong>{cities.find(c=>c.id===data.defaultCityId)?.city||'None'}</strong></div><div><span>Contingency</span><strong>{money(data.defaultContingency)}</strong></div><div><span>Template</span><strong>{standardSections.length} sections</strong></div></div></>}
      <div className="setup-actions"><button className="secondary" onClick={()=>step===1?onCancel():setStep(step-1)}>{step===1?'Cancel':'Back'}</button>{step<4?<button className="primary" disabled={step===1&&!data.name.trim()} onClick={()=>setStep(step+1)}>Continue</button>:<button className="primary" disabled={!data.name.trim()} onClick={finish}>{initial?'Save Show Settings':'Create Show'}</button>}</div>
    </div></main>
  </div>
}

function EmptyShow({show,onHome,onNew,onEdit}:{show:ShowProfile,onHome:()=>void,onNew:()=>void,onEdit:()=>void}) { return <div className="empty-show"><div className="empty-show-card"><div className="show-logo large">{show.logo?<img src={show.logo} alt=""/>:<Film size={42}/>}</div><span className="eyebrow">{show.season}</span><h1>{show.name}</h1><p>Your show is ready. Create the first location budget page to begin.</p><div><button className="primary big" onClick={onNew}><Plus size={18}/> Create First Budget</button><button className="secondary" onClick={onEdit}><Settings size={16}/> Show Settings</button></div><button className="text-button" onClick={onHome}>Back to all shows</button></div></div> }

function PrintBudgetSheet({budget,show,city}:{budget:BudgetPage,show:ShowProfile,city?:CityProfile}) {
  const sections=[...standardSections,...(budget.customSections||[])].map(s=>({...s,...(budget.sectionOverrides?.[s.id]||{})}))
  const total=budget.items.reduce((sum,i)=>sum+calcItem(i),0)
  return <section className="print-sheet">
    <div className="print-logo-row">{show.logo?<img src={show.logo} alt={`${show.name} logo`}/>:<h2>{show.name}</h2>}<span>LOCATIONS DEPARTMENT</span></div>
    <div className="print-header"><div><h2>{budget.production}</h2><p>{budget.episode} · {budget.setName} · Set #{budget.setNumber}</p><p>{budget.location} · {city?.city||''}{city?`, ${city.state}`:''}</p>{budget.keyAssistantLocationManager&&<p><strong>Key Assistant Location Manager:</strong> {budget.keyAssistantLocationManager}</p>}<p>{budget.version}</p></div><div className="print-total"><span>SET TOTAL</span><strong>{money(total)}</strong><small>With contingency: {money(total+budget.contingency)}</small></div></div>
    {sections.map(section=>{const its=budget.items.filter(i=>i.sectionId===section.id);const subtotal=its.reduce((sum,i)=>sum+calcItem(i),0);return subtotal>0?<PrintSection key={section.id} section={section} items={its} total={subtotal}/>:null})}
    <div className="print-summary"><span>Contingency</span><strong>{money(budget.contingency)}</strong><span>Total with contingency</span><strong>{money(total+budget.contingency)}</strong></div>
  </section>
}

function PrintSelectionModal({episodes,budgets,currentEpisode,onClose,onPrint}:{episodes:string[],budgets:BudgetPage[],currentEpisode:string,onClose:()=>void,onPrint:(ids:string[])=>void}) {
  const initial=budgets.filter(b=>b.episode===currentEpisode).map(b=>b.id)
  const [selected,setSelected]=useState<string[]>(initial)
  const toggle=(id:string)=>setSelected(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id])
  const selectEpisode=(ep:string)=>setSelected(budgets.filter(b=>b.episode===ep).map(b=>b.id))
  return <div className="modal-backdrop"><div className="modal large"><div className="modal-head"><div><span className="eyebrow">PRINT MULTIPLE BUDGETS</span><h2>Choose an episode or individual sets</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="print-picker-episodes">{episodes.map(ep=><button key={ep} className="secondary" onClick={()=>selectEpisode(ep)}>Select all {ep}</button>)}</div><div className="print-picker-list">{budgets.map(b=><label key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={()=>toggle(b.id)}/><span><strong>{b.setName}</strong><small>{b.episode} · {b.location||'No location entered'}</small></span><b>{money(b.items.reduce((sum,i)=>sum+calcItem(i),0))}</b></label>)}</div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!selected.length} onClick={()=>onPrint(selected)}><Printer size={16}/> Print {selected.length} set{selected.length===1?'':'s'}</button></div></div></div>
}

function PrintSection({section,items,total}:{section:Section,items:BudgetItem[],total:number}) {
  const locationFee = section.id === 'location-fees'
  const labor = ['staffing','security','police','fire'].includes(section.id)
  return <div className="print-section">
    <div className="print-section-heading"><div><strong>{section.name}</strong> <span>#{section.account}</span></div><b>Total: {moneyPrecise(total)}</b></div>
    {locationFee ? <div className="print-grid print-fee-grid">
      <div className="print-grid-head"><span>Description</span><span>PO #</span><span>Rate</span><span>Days</span><span>Total</span></div>
      {items.map(i=><div className="print-grid-row" key={i.id}><span>{i.name}</span><span>{i.poNumber||''}</span><span>{moneyPrecise(i.dayRate||0)}</span><span>{cellNumber(i.days)}</span><strong>{moneyPrecise(calcItem(i))}</strong></div>)}
    </div> : labor ? <div className="print-grid print-labor-grid">
      <div className="print-grid-head"><span>Description</span><span>PO #</span><span>Pers</span><span>Days</span><span>Hrs</span><span>1.5×</span><span>2×</span><span>Rate</span><span>Equip/Flat</span><span>Total</span></div>
      {items.map(i=><div className="print-grid-row" key={i.id}><span>{i.name}</span><span>{i.poNumber||''}</span><span>{cellNumber(i.people)}</span><span>{cellNumber(i.days)}</span><span>{cellNumber(i.regHours)}</span><span>{cellNumber(i.ot15Hours)}</span><span>{cellNumber(i.ot2Hours)}</span><span>{i.calcType==='hourly'?moneyPrecise(i.hourlyRate||0):i.calcType==='dayRate'?moneyPrecise(i.dayRate||0):''}</span><span>{i.calcType==='flat'?moneyPrecise(i.flatAmount||0):i.kitFee?moneyPrecise(i.kitFee):''}</span><strong>{moneyPrecise(calcItem(i))}</strong></div>)}
    </div> : <div>{items.map(i=><div className="print-row" key={i.id}><span>{i.name}{i.poNumber ? ` · PO ${i.poNumber}` : ''}</span><small>{formulaText(i)}</small><strong>{moneyPrecise(calcItem(i))}</strong></div>)}</div>}
  </div>
}

function EditableMetric({label,value,onChange}:{label:string,value:number,onChange:(v:number)=>void}) {
  return <div className="metric editable-metric"><span>{label}</span><div className="money-input"><b>$</b><input type="number" value={value} onChange={e=>onChange(+e.target.value)}/></div><small>Click and type to edit</small></div>
}

function BudgetSetupModal({title,episodes,initial,helper,submitLabel,onClose,onSave}:{title:string,episodes:string[],initial?:{episode:string,setName:string,setNumber:string,location:string},helper?:string,submitLabel?:string,onClose:()=>void,onSave:(d:{episode:string,setName:string,setNumber:string,location:string})=>void}) {
  const [data,setData]=useState(initial||{episode:episodes[0]||'Episode 201',setName:'New Set',setNumber:'',location:''})
  return <div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault(); if(data.episode.trim()&&data.setName.trim()) onSave(data)}}><div className="modal-head"><div><span className="eyebrow">TAYLOR BUDGET</span><h2>{title}</h2></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div>{helper&&<p className="library-help">{helper}</p>}<div className="form-grid">
    <label>Destination episode<select value={data.episode} onChange={e=>setData({...data,episode:e.target.value})}>{episodes.map(e=><option key={e} value={e}>{e}</option>)}</select></label>
    <label>Set #<input value={data.setNumber} onChange={e=>setData({...data,setNumber:e.target.value})}/></label>
    <label className="span-2">New set name<input autoFocus value={data.setName} onChange={e=>setData({...data,setName:e.target.value})}/></label>
    <label className="span-2">Location<input value={data.location} onChange={e=>setData({...data,location:e.target.value})}/></label>
  </div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={!data.episode.trim()||!data.setName.trim()}>{submitLabel||title}</button></div></form></div>
}

function Metric({label, value, tone, small}:{label:string,value:string,tone?:string,small?:boolean}) {
  return <div className={`metric ${tone || ''}`}><span>{label}</span><strong className={small ? 'small-value' : ''}>{value}</strong></div>
}

function formulaText(i: BudgetItem) {
  if (i.calcType === 'flat') return 'Flat amount'
  if (i.calcType === 'rateDay') return `${i.days||0} day(s) × ${money(i.dayRate||0)}/day`
  if (i.calcType === 'hourly') return `${i.people||0} people × ${i.days||0} days · ${i.regHours||0} reg / ${i.ot15Hours||0} OT / ${i.ot2Hours||0} DT · ${money(i.hourlyRate||0)}/hr${i.kitFee ? ` + ${money(i.kitFee)} kit` : ''}`
  if (i.calcType === 'dayRate') return `${i.people||0} people × ${i.days||0} days × ${money(i.dayRate||0)} day rate${i.kitFee ? ` + ${money(i.kitFee)} kit` : ''}`
  return i.vendorBillingType==='flat' ? `${i.units||0} unit(s) × ${money(i.vendorFlatRate||0)} + ${i.servicesPerUnit||0} service(s)/unit × ${money(i.serviceRate||0)} + ${money(i.flatAmount||0)} delivery/pickup` : `${i.units||0} units × ${i.weeks||0} week(s) × ${money(i.weeklyRate||0)} + ${i.servicesPerUnit||0} service(s)/unit × ${money(i.serviceRate||0)} + ${money(i.flatAmount||0)} delivery/pickup`
}

function cellNumber(value?: number) { return value ? String(value) : '' }

function InlineText({value,onChange,className,ariaLabel}:{value:string,onChange:(v:string)=>void,className?:string,ariaLabel:string}) {
  return <input className={`inline-cell-input ${className||''}`} value={value} onClick={e=>e.stopPropagation()} onChange={e=>onChange(e.target.value)} aria-label={ariaLabel}/>
}
function InlineNumber({value,onChange,ariaLabel}:{value?:number,onChange:(v:number)=>void,ariaLabel:string}) {
  const [draft,setDraft]=useState(value == null ? '' : String(value))
  useEffect(()=>setDraft(value == null ? '' : String(value)),[value])
  const commit=()=>{ const n=Number(draft); onChange(draft.trim()==='' || !Number.isFinite(n) ? 0 : n) }
  return <input className="inline-cell-input number" type="number" step="any" value={draft} onClick={e=>e.stopPropagation()} onFocus={e=>e.currentTarget.select()} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur()}}} aria-label={ariaLabel}/>
}
function BudgetTable({sectionId, items, onEdit, onDelete, onDuplicate, onUpdate, showActuals=false}:{sectionId:string,items:BudgetItem[],onEdit:(item:BudgetItem)=>void,onDelete:(id:string)=>void,onDuplicate:(item:BudgetItem)=>void,onUpdate:(id:string,patch:Partial<BudgetItem>)=>void,showActuals?:boolean}) {
  const locationFee = sectionId === 'location-fees'
  const labor = ['staffing','security','police','fire'].includes(sectionId)
  if (!locationFee && !labor) {
    const grouped=new Map<string,{name:string,items:BudgetItem[]}>()
    const standalone:BudgetItem[]=[]
    items.forEach(item=>{
      if(item.calcType!=='vendor'||!item.vendor?.trim()){standalone.push(item);return}
      const key=vendorGroupKey(item.vendor)
      const group=grouped.get(key)
      if(group)group.items.push(item)
      else grouped.set(key,{name:item.vendor.trim(),items:[item]})
    })
    const repeated=[...grouped.values()].filter(group=>group.items.length>1)
    const singles=[...grouped.values()].filter(group=>group.items.length===1).flatMap(group=>group.items)
    const row=(item:BudgetItem,suppressVendor=false)=><BudgetRow key={item.id} item={item} suppressVendor={suppressVendor} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} onDuplicate={() => onDuplicate(item)} onUpdate={patch=>onUpdate(item.id,patch)} showActuals={showActuals} />
    return <div className="grouped-budget-items">{[...standalone,...singles].map(item=>row(item))}{repeated.map(group=><section className="budget-vendor-group" key={vendorGroupKey(group.name)}><div className="budget-vendor-head"><strong>{group.name}</strong><span>{group.items.length} items</span><b>{moneyPrecise(group.items.reduce((sum,item)=>sum+calcItem(item),0))}</b></div><div className="budget-vendor-rows">{group.items.map(item=>row(item,true))}</div></section>)}</div>
  }
  return <div className={`entry-table ${locationFee ? 'fee-table' : 'labor-table'}`}>
    <div className="entry-table-head">
      <span>Description</span><span>PO #</span>
      {locationFee ? <><span>Rate</span><span>Days</span></> : <><span>Pers</span><span>Days</span><span>Hrs</span><span>1.5×</span><span>2×</span><span>Rate</span><span>Equip/Flat</span></>}
      <span>Total</span>{showActuals&&<><span>Actual</span><span>Variance</span></>}<span className="no-print"></span>
    </div>
    {items.map(item => <div key={item.id} className="entry-table-row" >
      <span className="entry-description"><InlineText value={item.name} onChange={v=>onUpdate(item.id,{name:v})} ariaLabel="Description"/>{item.vendor && <small>{item.vendor}</small>}</span>
      <span className="po-cell"><InlineText value={item.poNumber||''} onChange={v=>onUpdate(item.id,{poNumber:v})} ariaLabel="PO number"/></span>
      {locationFee ? <>
        <span><InlineNumber value={item.dayRate} onChange={v=>onUpdate(item.id,{dayRate:v,calcType:'rateDay'})} ariaLabel="Rate per day"/></span><span><InlineNumber value={item.days} onChange={v=>onUpdate(item.id,{days:v,calcType:'rateDay'})} ariaLabel="Days"/></span>
      </> : <>
        <span><InlineNumber value={item.people} onChange={v=>onUpdate(item.id,{people:v})} ariaLabel="People"/></span><span><InlineNumber value={item.days} onChange={v=>onUpdate(item.id,{days:v})} ariaLabel="Days"/></span><span><InlineNumber value={item.regHours} onChange={v=>onUpdate(item.id,{regHours:v})} ariaLabel="Regular hours"/></span><span><InlineNumber value={item.ot15Hours} onChange={v=>onUpdate(item.id,{ot15Hours:v})} ariaLabel="Overtime hours"/></span><span><InlineNumber value={item.ot2Hours} onChange={v=>onUpdate(item.id,{ot2Hours:v})} ariaLabel="Double time hours"/></span>
        <span><InlineNumber value={item.calcType==='dayRate'?item.dayRate:item.hourlyRate} onChange={v=>onUpdate(item.id,item.calcType==='dayRate'?{dayRate:v}:{hourlyRate:v})} ariaLabel="Rate"/></span>
        <span><InlineNumber value={item.calcType==='flat'?item.flatAmount:item.kitFee} onChange={v=>onUpdate(item.id,item.calcType==='flat'?{flatAmount:v}:{kitFee:v})} ariaLabel="Equipment or flat fee"/></span>
      </>}
      <span className="table-total">{moneyPrecise(calcItem(item))}</span>{showActuals&&<><span><InlineNumber value={item.actualAmount} onChange={v=>onUpdate(item.id,{actualAmount:v,status:'actual'})} ariaLabel="Actual invoice amount"/></span><span className={`variance-cell ${(calcItem(item)-(item.actualAmount||0))<0?'negative':''}`}>{moneyPrecise(calcItem(item)-(item.actualAmount||0))}</span></>}
      <span className="table-actions no-print"><button className="icon-btn" onClick={()=>onEdit(item)} title="Open detailed editor"><Pencil size={14}/></button><button className="icon-btn" onClick={()=>onDuplicate(item)} title="Duplicate item"><Copy size={14}/></button><button className="icon-btn danger" onClick={()=>onDelete(item.id)} title="Delete item"><Trash2 size={14}/></button></span>
    </div>)}
  </div>
}

function BudgetRow({item, onEdit, onDelete, onDuplicate, onUpdate, showActuals=false, suppressVendor=false}:{item:BudgetItem,onEdit:()=>void,onDelete:()=>void,onDuplicate:()=>void,onUpdate:(patch:Partial<BudgetItem>)=>void,showActuals?:boolean,suppressVendor?:boolean}) {
  return <div className="budget-row editable-row" role="button" tabIndex={0} onClick={onEdit} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onEdit() }}>
    <div><strong>{item.name}</strong>{item.poNumber && <span className="po-badge">PO {item.poNumber}</span>}<small>{item.vendor && !suppressVendor ? `${item.vendor} · ` : ''}{formulaText(item)}</small><span className="edit-hint no-print">Click to edit</span></div>
    <div className="row-total"><span>{moneyPrecise(calcItem(item))}</span>{showActuals&&<span className="row-actuals"><label>Actual <InlineNumber value={item.actualAmount} onChange={v=>onUpdate({actualAmount:v,status:'actual'})} ariaLabel={`Actual for ${item.name}`}/></label><small className={(calcItem(item)-(item.actualAmount||0))<0?'negative':''}>Variance {moneyPrecise(calcItem(item)-(item.actualAmount||0))}</small></span>}<button className="icon-btn no-print" aria-label={`Edit ${item.name}`} onClick={e => { e.stopPropagation(); onEdit() }}><Pencil size={15}/></button><button className="icon-btn no-print" aria-label={`Duplicate ${item.name}`} onClick={e => { e.stopPropagation(); onDuplicate() }}><Copy size={15}/></button><button className="icon-btn no-print danger" aria-label={`Delete ${item.name}`} onClick={e => { e.stopPropagation(); onDelete() }}><Trash2 size={15}/></button></div>
  </div>
}

function ItemModal({sectionId, sectionName, initialItem, cities, city, vendors, onClose, onSave}:{sectionId:string,sectionName:string,initialItem?:BudgetItem,cities:CityProfile[],city?:CityProfile,vendors:VendorItem[],onClose:()=>void,onSave:(item:BudgetItem)=>void}) {
  const defaultType: CalcType = sectionId === 'vendors' ? 'vendor' : sectionId === 'location-fees' || sectionId === 'parking' ? 'rateDay' : sectionId === 'staffing' || sectionId === 'security' || sectionId === 'police' || sectionId === 'fire' ? 'hourly' : 'flat'
  const [type, setType] = useState<CalcType>(initialItem?.calcType || defaultType)
  const [name, setName] = useState(initialItem?.name || '')
  const matchedVendor = initialItem?.vendor ? vendors.find(v => v.vendor === initialItem.vendor && v.name === initialItem.name) : undefined
  const [vendorId, setVendorId] = useState(matchedVendor?.id || vendors[0]?.id || '')
  const [data, setData] = useState<any>({people:1,days:1,regHours:8,ot15Hours:sectionId==='security'?4:0,ot2Hours:0,hourlyRate:50,dayRate:600,includedHours:12,kitFee:0,kitFeeMode:'perDay',units:1,weeks:1,servicesPerUnit:1,weeklyRate:850,serviceRate:150,flatAmount:0,...initialItem})
  const selectedVendor = vendors.find(v => v.id === vendorId)

  useEffect(() => {
    if (selectedVendor && type === 'vendor') setData((d:any)=>({...d, vendorBillingType:selectedVendor.billingType||'weekly', vendorFlatRate:selectedVendor.flatRate||0, weeklyRate:selectedVendor.weeklyRate, serviceRate:selectedVendor.serviceRate, flatAmount:selectedVendor.deliveryFee + selectedVendor.pickupFee}))
  }, [vendorId, type])

  const applyCityRate = (key:'fire'|'police'|'permit') => {
    if (!city) return
    if (key === 'fire') { setName('Fire Safety Officer'); setType('hourly'); setData({...data, hourlyRate:city.fireOfficerRate, regHours:city.officerMinimumHours}) }
    if (key === 'police') { setName('Police Officer'); setType('hourly'); setData({...data, hourlyRate:city.policeOfficerRate, regHours:city.officerMinimumHours}) }
    if (key === 'permit') { setName('Film Permit'); setType('flat'); setData({...data, flatAmount:city.permitBaseFee}) }
  }

  const preview: BudgetItem = {id:'preview',sectionId,name:name||'New item',...data,calcType:type,vendor:type==='vendor'?selectedVendor?.vendor:undefined}

  const submitItem = () => {
    if (!name.trim()) return
    onSave({...preview,id:initialItem?.id || crypto.randomUUID(),status:initialItem?.status || 'estimate'})
  }

  return <div className="modal-backdrop"><form className="modal large" onSubmit={e=>{e.preventDefault();submitItem()}}><div className="modal-head"><div><span className="eyebrow">{initialItem ? 'EDIT BUDGET ITEM' : 'ADD BUDGET ITEM'}</span><h2>{sectionName}</h2></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div>
    <div className="type-tabs">{(['flat','rateDay','hourly','dayRate','vendor'] as CalcType[]).map(t=><button type="button" key={t} className={type===t?'active':''} onClick={()=>setType(t)}>{t==='flat'?'Flat Cost':t==='rateDay'?'Rate per Day':t==='hourly'?'Hourly Labor':t==='dayRate'?'Day Rate + OT':'Saved Vendor Item'}</button>)}</div>
    {city && <div className="quick-rates"><span>Quick city rates:</span><button type="button" onClick={()=>applyCityRate('police')}>Police {money(city.policeOfficerRate)}/hr</button><button type="button" onClick={()=>applyCityRate('fire')}>Fire {money(city.fireOfficerRate)}/hr</button><button type="button" onClick={()=>applyCityRate('permit')}>Permit {money(city.permitBaseFee)}</button></div>}
    <div className="form-grid">
      <label className="span-2">Item name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Describe the cost"/></label><label className="span-2">PO #<input value={data.poNumber || ''} onChange={e=>setData({...data,poNumber:e.target.value})} placeholder="Enter purchase order number"/></label>
      {type==='flat' && <label>Amount<input type="number" value={data.flatAmount} onChange={e=>setData({...data,flatAmount:+e.target.value})}/></label>}
      {type==='rateDay' && <><Num label="Number of days" value={data.days} set={(v)=>setData({...data,days:v})}/><Num label="Rate per day" value={data.dayRate} set={(v)=>setData({...data,dayRate:v})}/></>}
      {type==='hourly' && <>
        <Num label="People" value={data.people} set={(v)=>setData({...data,people:v})}/><Num label="Days" value={data.days} set={(v)=>setData({...data,days:v})}/><Num label="Regular hours/day" value={data.regHours} set={(v)=>setData({...data,regHours:v})}/><Num label="1.5× hours/day" value={data.ot15Hours} set={(v)=>setData({...data,ot15Hours:v})}/><Num label="2× hours/day" value={data.ot2Hours} set={(v)=>setData({...data,ot2Hours:v})}/><Num label="Hourly rate" value={data.hourlyRate} set={(v)=>setData({...data,hourlyRate:v})}/><Num label="Kit fee" value={data.kitFee} set={(v)=>setData({...data,kitFee:v})}/><label>Kit fee type<select value={data.kitFeeMode} onChange={e=>setData({...data,kitFeeMode:e.target.value})}><option value="perDay">Per person / day</option><option value="flat">Flat job fee</option></select></label>
      </>}
      {type==='dayRate' && <>
        <Num label="People" value={data.people} set={(v)=>setData({...data,people:v})}/><Num label="Days" value={data.days} set={(v)=>setData({...data,days:v})}/><Num label="Day rate" value={data.dayRate} set={(v)=>setData({...data,dayRate:v})}/><Num label="Included hours" value={data.includedHours} set={(v)=>setData({...data,includedHours:v})}/><Num label="1.5× hours/day" value={data.ot15Hours} set={(v)=>setData({...data,ot15Hours:v})}/><Num label="2× hours/day" value={data.ot2Hours} set={(v)=>setData({...data,ot2Hours:v})}/><Num label="Kit fee" value={data.kitFee} set={(v)=>setData({...data,kitFee:v})}/><label>Kit fee type<select value={data.kitFeeMode} onChange={e=>setData({...data,kitFeeMode:e.target.value})}><option value="perDay">Per person / day</option><option value="flat">Flat job fee</option></select></label>
      </>}
      {type==='vendor' && <>
        <label className="span-2">Saved vendor item<select value={vendorId} onChange={e=>{setVendorId(e.target.value); const v=vendors.find(x=>x.id===e.target.value); if(v)setName(v.name)}}>{Array.from(new Map(vendors.map(v=>[vendorGroupKey(v.vendor),v.vendor])).entries()).sort((a,b)=>a[1].localeCompare(b[1])).map(([key,label])=><optgroup key={key} label={label}>{vendors.filter(v=>vendorGroupKey(v.vendor)===key).sort((a,b)=>a.name.localeCompare(b.name)).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>)}</select></label>
        <Num label="Units" value={data.units} set={(v)=>setData({...data,units:v})}/>{data.vendorBillingType==='flat'?<Num label="Flat rate per unit" value={data.vendorFlatRate||0} set={(v)=>setData({...data,vendorFlatRate:v})}/>:<><Num label="Rental weeks" value={data.weeks} set={(v)=>setData({...data,weeks:v})}/><Num label="Weekly rate" value={data.weeklyRate} set={(v)=>setData({...data,weeklyRate:v})}/></>}<Num label="Services per unit" value={data.servicesPerUnit} set={(v)=>setData({...data,servicesPerUnit:v})}/><Num label="Service rate" value={data.serviceRate} set={(v)=>setData({...data,serviceRate:v})}/><Num label="Delivery + pickup" value={data.flatAmount} set={(v)=>setData({...data,flatAmount:v})}/>
      </>}
    </div>
    <div className="calc-preview"><div><span>Calculation</span><strong>{formulaText(preview)}</strong></div><b>{money(calcItem(preview))}</b></div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={!name.trim()}>{initialItem ? 'Save changes' : 'Add to budget'}</button></div>
  </form></div>
}

function AddSectionModal({onClose,onSave}:{onClose:()=>void,onSave:(section:Section)=>void}) {
  const [name,setName]=useState('')
  const [account,setAccount]=useState('36-')
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">CUSTOM BUDGET SECTION</span><h2>Add a section</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid"><label className="span-2">Section name<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Example: Special Equipment"/></label><label>Account code<input value={account} onChange={e=>setAccount(e.target.value)} placeholder="36-XX"/></label></div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!name.trim()} onClick={()=>onSave({id:`custom-${crypto.randomUUID()}`,name:name.trim(),account:account.trim()||'36-99',icon:'file'})}>Add section</button></div></div></div>
}

function Num({label,value,set}:{label:string,value:number,set:(v:number)=>void}) {
  const [draft,setDraft]=useState(value == null ? '' : String(value))
  useEffect(()=>setDraft(value == null ? '' : String(value)),[value])
  const commit=()=>{ const n=Number(draft); set(draft.trim()==='' || !Number.isFinite(n) ? 0 : n) }
  return <label>{label}<input type="number" step="any" value={draft} onFocus={e=>e.currentTarget.select()} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur()}}}/></label>
}

function LibraryModal({title,onClose,children}:{title:string,onClose:()=>void,children:React.ReactNode}) { return <div className="modal-backdrop"><div className="modal library"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X/></button></div>{children}</div></div> }

function CityLibrary({cities,setCities}:{cities:CityProfile[],setCities:(c:CityProfile[])=>void}) {
  const add = () => setCities([...cities,{id:crypto.randomUUID(),city:'New City',state:'CA',fireOfficerRate:0,policeOfficerRate:0,policeSupervisorRate:0,officerMinimumHours:4,permitBaseFee:0,parkingPostingFee:0}])
  const patch = (idx:number, changes:Partial<CityProfile>) => setCities(cities.map((x,i)=>i===idx?{...x,...changes}:x))
  return <div><p className="library-help">Edit city defaults here. Los Angeles official fees below are synchronized to the FilmLA schedule published Apr 1, 2026; provider fees remain subject to change.</p><div className="library-grid">{cities.map((c,idx)=><div className="library-card" key={c.id}><div className="library-card-head city-title-row"><input className="title-input" value={c.city} onChange={e=>patch(idx,{city:e.target.value})}/><input className="state-input" value={c.state} maxLength={2} onChange={e=>patch(idx,{state:e.target.value.toUpperCase()})} aria-label="State abbreviation"/><button className="icon-btn" onClick={()=>setCities(cities.filter(x=>x.id!==c.id))}><Trash2 size={15}/></button></div><div className="mini-grid"><Num label="Police officer / hr (planning default)" value={c.policeOfficerRate} set={v=>patch(idx,{policeOfficerRate:v})}/><Num label="Police supervisor / hr" value={c.policeSupervisorRate} set={v=>patch(idx,{policeSupervisorRate:v})}/><Num label="Fire officer / hr" value={c.fireOfficerRate} set={v=>patch(idx,{fireOfficerRate:v})}/><Num label="Minimum call hours" value={c.officerMinimumHours} set={v=>patch(idx,{officerMinimumHours:v})}/><Num label="Base permit fee" value={c.permitBaseFee} set={v=>patch(idx,{permitBaseFee:v})}/><Num label="Parking posting / 300 ft" value={c.parkingPostingFee} set={v=>patch(idx,{parkingPostingFee:v})}/></div>{c.officialFees?.length?<div className="official-fees"><div className="official-fees-head"><strong>Official LA City / FilmLA fee schedule</strong><span>{c.officialFeesPublished}</span></div>{c.officialFees.map((f,i)=><div className="official-fee-row" key={i}><span>{f.name}</span><b>{f.rate}</b><small>{f.per}</small></div>)}</div>:null}</div>)}</div><button className="add-row" onClick={add}><Plus size={16}/> Add city profile</button></div>
}


function downloadJson(filename:string, data:any) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url)
}

function daysBetween(start?:string,end?:string){ if(!start)return 0; const a=new Date(start+'T12:00:00'); const b=new Date((end||start)+'T12:00:00'); return Math.max(1,Math.round((+b-+a)/86400000)+1) }

function ConnectionsModal({budget,activeShow,calendarUrl,bibleUrl,onClose}:{budget:BudgetPage,activeShow:ShowProfile,calendarUrl:string,bibleUrl:string,onClose:()=>void}) {
  const backup = () => downloadJson(`${activeShow.name}_${budget.episode}_${budget.location || budget.setName}_Budget.json`, budget)
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal connections-modal compact-connections"><div className="modal-head"><div><span className="eyebrow">SHARED SHOW DATA</span><h2>Connected tools</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><p className="library-help">Calendar, Budget, and Bible now use the same shared show and location records. Manual JSON import and Bible-package export are no longer needed.</p><div className="connection-status-list"><div><CalendarDays size={20}/><span><b>Calendar</b><small>Connected schedule and location source</small></span><strong>Connected</strong></div><div><DollarSign size={20}/><span><b>Budget</b><small>{budget.episode} · {budget.setName}</small></span><strong>Active</strong></div><div><BookOpen size={20}/><span><b>Bible</b><small>Connected orders and commitments</small></span><strong>Connected</strong></div></div><div className="connection-status"><strong>Connected record</strong><span>{budget.episode} · {budget.setName}</span><span>{budget.location||'No physical location'}</span><small>{budget.sharedLocationId?'Shared location ID: '+budget.sharedLocationId:'Not yet linked to a shared location'}</small></div><div className="modal-actions connection-actions"><button className="secondary" onClick={()=>window.location.href=calendarUrl}>Open Calendar</button><button className="secondary" onClick={()=>window.location.href=bibleUrl}>Open Bible</button><button className="secondary" onClick={backup}><Download size={16}/> Budget Backup</button><button className="primary" onClick={onClose}>Done</button></div></div></div>
}

function vendorGroupKey(value:string) {
  return String(value || 'Unassigned vendor').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim()
}

function VendorLibrary({vendors,setVendors}:{vendors:VendorItem[],setVendors:(v:VendorItem[])=>void}) {
  const groups=useMemo(()=>{
    const byKey=new Map<string,{key:string,name:string,items:VendorItem[]}>()
    vendors.forEach(item=>{
      const key=vendorGroupKey(item.vendor)
      const current=byKey.get(key)
      if(current) current.items.push(item)
      else byKey.set(key,{key,name:item.vendor.trim()||'Unassigned vendor',items:[item]})
    })
    return Array.from(byKey.values()).map(group=>({...group,items:[...group.items].sort((a,b)=>a.name.localeCompare(b.name))})).sort((a,b)=>a.name.localeCompare(b.name))
  },[vendors])
  const [openKeys,setOpenKeys]=useState<string[]>(()=>groups.slice(0,1).map(g=>g.key))
  const patchItem=(id:string,changes:Partial<VendorItem>)=>setVendors(vendors.map(item=>item.id===id?{...item,...changes}:item))
  const renameVendor=(key:string,name:string)=>setVendors(vendors.map(item=>vendorGroupKey(item.vendor)===key?{...item,vendor:name}:item))
  const addVendor=()=>{
    const item={id:crypto.randomUUID(),vendor:'New Vendor',name:'New item',billingType:'weekly' as const,weeklyRate:0,flatRate:0,serviceRate:0,deliveryFee:0,pickupFee:0}
    setVendors([...vendors,item]); setOpenKeys([...new Set([...openKeys,vendorGroupKey(item.vendor)])])
  }
  const addItem=(group:{key:string,name:string})=>{
    const item={id:crypto.randomUUID(),vendor:group.name,name:'New item',billingType:'weekly' as const,weeklyRate:0,flatRate:0,serviceRate:0,deliveryFee:0,pickupFee:0}
    setVendors([...vendors,item]); setOpenKeys([...new Set([...openKeys,group.key])])
  }
  const removeVendor=(key:string)=>{
    const group=groups.find(g=>g.key===key)
    if(!group||!window.confirm(`Delete ${group.name} and all ${group.items.length} saved item${group.items.length===1?'':'s'}?`))return
    setVendors(vendors.filter(item=>vendorGroupKey(item.vendor)!==key))
  }
  return <div className="vendor-library"><p className="library-help">Vendors are consolidated below. Open a vendor to edit or select its saved equipment and services. New items added inside a vendor remain grouped with that vendor automatically.</p><div className="vendor-groups">{groups.map(group=>{
    const open=openKeys.includes(group.key)
    return <section className={`vendor-group ${open?'open':''}`} key={group.key}>
      <div className="vendor-group-head"><button className="vendor-expand" onClick={()=>setOpenKeys(open?openKeys.filter(k=>k!==group.key):[...openKeys,group.key])} aria-expanded={open}>{open?<ChevronDown size={18}/>:<ChevronRight size={18}/>}<span><strong>{group.name}</strong><small>{group.items.length} saved item{group.items.length===1?'':'s'}</small></span></button><div className="vendor-head-actions"><button className="secondary compact" onClick={()=>addItem(group)}><Plus size={14}/> Add item</button><button className="icon-btn danger" onClick={()=>removeVendor(group.key)} title="Delete vendor"><Trash2 size={15}/></button></div></div>
      {open&&<div className="vendor-item-list"><label className="vendor-name-field">Vendor name<input value={group.name} onChange={e=>renameVendor(group.key,e.target.value)}/></label>{group.items.map(v=><article className="vendor-item-row" key={v.id}><div className="vendor-item-title"><input className="title-input" value={v.name} onChange={e=>patchItem(v.id,{name:e.target.value})} aria-label="Vendor item name"/><button className="icon-btn" onClick={()=>setVendors(vendors.filter(x=>x.id!==v.id))} title="Delete item"><Trash2 size={15}/></button></div><label>Billing type<select value={v.billingType||'weekly'} onChange={e=>patchItem(v.id,{billingType:e.target.value as 'weekly'|'flat'})}><option value="weekly">Weekly rental</option><option value="flat">Flat item</option></select></label><div className="mini-grid">{(v.billingType||'weekly')==='weekly'?<Num label="Weekly rate" value={v.weeklyRate} set={n=>patchItem(v.id,{weeklyRate:n})}/>:<Num label="Flat rate per unit" value={v.flatRate||0} set={n=>patchItem(v.id,{flatRate:n})}/>}<Num label="Service rate / unit" value={v.serviceRate} set={n=>patchItem(v.id,{serviceRate:n})}/><Num label="Delivery" value={v.deliveryFee} set={n=>patchItem(v.id,{deliveryFee:n})}/><Num label="Pickup" value={v.pickupFee} set={n=>patchItem(v.id,{pickupFee:n})}/></div></article>)}</div>}
    </section>
  })}</div><button className="add-row" onClick={addVendor}><Plus size={16}/> Add vendor</button></div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
