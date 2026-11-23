'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,CarFront,ClipboardList,FilePlus2,Plus,ShieldAlert,Wrench} from 'lucide-react';
import {EvidencePanel} from './Evidence';
import {tabs,stateNames,categories,showDate,money,type Vehicle,type Register,type Transport,type Evidence,type Section} from './types';
import './vehicles.css';

type Mode='list'|'detail'|'add'|'capture'|'fault'|'hold'|'release';
const included:Record<Section,string[]>={Home:[],Registration:['payment','expiry','renewal'],Maintenance:['fault','hold','release','repair','followup'],Servicing:['service','meter']};
function Status({vehicle}:{vehicle:Vehicle}){return <span className="veh-status" data-state={vehicle.state}>{stateNames[vehicle.state]}</span>}

const meterNumber = new Intl.NumberFormat('en-AU', {maximumFractionDigits: 2});

function vehicleRecordsLabel(filename: string, kinds: string[]) {
  if (filename !== 'Vehicle note.txt' || !kinds.length) return filename;
  if (kinds.every(kind => included.Registration.includes(kind))) return 'Registration note';
  if (kinds.includes('service')) return 'Service note';
  if (kinds.every(kind => included.Maintenance.includes(kind))) return 'Maintenance note';
  return 'Vehicle note';
}

type RecordsProps = {
  vehicle: Vehicle;
  section: Section;
  api: Transport;
  canEdit: boolean;
  onReview: (evidence: Evidence) => void;
};

function VehicleRecords({vehicle, section, api, canEdit, onReview}: RecordsProps) {
  const history = vehicle.history.filter(entry => section === 'Home' || included[section].includes(entry.kind)).reverse();
  const labels = new Map(vehicle.files.map(file => {
    const kinds = vehicle.history.filter(entry => entry.source === file.id).map(entry => entry.kind);
    return [file.id, vehicleRecordsLabel(file.name, kinds)];
  }));
  const title = section === 'Home' ? 'Vehicle history' : section + ' history';
  const actionNames: Record<string, string> = {...categories, hold: 'Do not use', release: 'Returned to service'};

  return <>
    <section className="veh-panel veh-history">
      <h2>{title}</h2>
      {history.length ? <table className="veh-ledger" aria-label={title}>
        <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{history.map(entry => {
          const day = entry.day || entry.at;
          const detail = [actionNames[entry.kind] || entry.kind, money(entry.amount),
            entry.reading && meterNumber.format(Number(entry.reading)) + ' ' + entry.unit].filter(Boolean).join(' · ');
          return <tr key={entry.id}>
            <td className="veh-entry-date"><time dateTime={day?.slice(0, 10)}>{showDate(day)}</time></td>
            <td className="veh-entry-detail"><strong>{entry.label}</strong><small>{detail}</small></td>
            <td className="veh-entry-source">{entry.source &&
              <a href={api.file(entry.source)} aria-label={'Open original evidence for ' + entry.label}>
                {labels.get(entry.source) || 'Open original'}
              </a>}</td>
          </tr>;
        })}</tbody>
      </table> : <p>No entries recorded.</p>}
    </section>
    <section className="veh-panel">
      <h2>Original evidence</h2>
      {vehicle.files.map(file => {
        const evidence = vehicle.evidence.find(item => item.id === file.id);
        return <p key={file.id}><a href={api.file(file.id)} title={file.name}>{labels.get(file.id)}</a>{' '}
          {evidence && evidence.status !== 'confirmed' && canEdit &&
            <button onClick={() => onReview(evidence)}><ClipboardList size={15}/>Review</button>}
        </p>;
      })}
      {!vehicle.files.length && <p>No originals saved.</p>}
    </section>
  </>;
}

export function Vehicles({api,canEdit,email,shared}:{api:Transport;canEdit:boolean;email:string;shared:boolean}){
 const [data,setData]=useState<Register|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[section,setSection]=useState<Section>('Home'),[mode,setMode]=useState<Mode>('list'),[id,setId]=useState(''),[source,setSource]=useState<Evidence>(),[reason,setReason]=useState('');
 const vehicle=data?.vehicles.find(v=>v.id===id);const [capturePending,setCapturePending]=useState(false);
 const actionId=useRef(''),lock=useRef(false),count=useRef(0);
 const refresh=useCallback(async()=>{const n=++count.current;const d=await api.list();if(n===count.current)setData(d)},[api]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));return()=>{count.current++}},[refresh]);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message);await refresh().catch(()=>{})}finally{setBusy(false);lock.current=false}}
 function open(v:Vehicle,next:Mode='detail'){setId(v.id);setMode(next);setSource(undefined);setReason('');setError('');setCapturePending(false);actionId.current=crypto.randomUUID()}
 function add(){setId('');setMode('add');setCapturePending(false);setError('');actionId.current=crypto.randomUUID()}
 function capture(){if(vehicle){open(vehicle,'capture');return}if(data?.vehicles.length===1){open(data.vehicles[0],'capture');return}if(!data?.vehicles.length){add();return}setCapturePending(true);setMode('list')}
 function switchTab(value:Section){setSection(value);setMode(vehicle?'detail':'list');setCapturePending(false);setError('')}
 return <div className="vehicles-app"><div className="veh-header"><div><h1>Vehicles</h1><span>{vehicle?vehicle.title:'Household vehicle register'}</span></div><CarFront aria-hidden size={32}/></div>
 <div className="veh-ribbon" aria-label="Vehicle commands"><div className="veh-tabs" aria-label="Vehicle sections">{tabs.map(t=><button key={t} aria-current={section===t?'page':undefined} onClick={()=>switchTab(t)}>{t}</button>)}</div>
 <label className="veh-mobile-menu">Section <select value={section} onChange={e=>switchTab(e.target.value as Section)}>{tabs.map(t=><option key={t}>{t}</option>)}</select></label>
 <div className="veh-commands"><button className="veh-primary" disabled={!data||!canEdit||data.limited} onClick={capture}><FilePlus2 size={17}/>Add evidence</button>
 {canEdit&&<button onClick={add}><Plus size={16}/>Add vehicle</button>}
 {vehicle&&<><button onClick={()=>open(vehicle,'fault')} disabled={data?.limited}><Wrench size={16}/>Report fault</button>
 <button disabled={data?.limited} onClick={()=>open(vehicle,'hold')}><ShieldAlert size={16}/>Do not use</button>{vehicle.held&&vehicle.canRelease&&<button onClick={()=>open(vehicle,'release')}>Return to service</button>}</>}</div></div>
 {error&&<p role="alert">{error} <button onClick={()=>void run(refresh)}>Refresh</button></p>}
 {data?.limited&&<p role="status">Your vehicle register is available. Evidence review and readiness checks require the Sydney service update.</p>}
 {!data&&!error&&<p role="status">Opening vehicle register…</p>}
 {data&&mode==='add'&&<form className="veh-panel veh-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const get=(k:string)=>String(f.get(k)||'');const newId=actionId.current;void run(async()=>{await api.create(newId,{title:get('name'),plate:get('plate'),model:get('model'),owner:get('owner'),audience:get('audience'),use:get('use')});await refresh();setId(newId);setSection('Home');setMode('detail')})}}>
 <h2>Add vehicle</h2><div className="veh-grid"><label>Vehicle name<input name="name" required maxLength={140} placeholder="e.g. Farm ute"/></label><label>Plate or asset number<input name="plate" maxLength={100}/></label><label>Make and model<input name="model" maxLength={150}/></label>
 <label>Use<select name="use"><option>Road use</option><option>Off-road only</option></select></label><label>Access<select name="audience"><option value="private">Only me</option>{shared&&<option value="shared">Household members with shared access</option>}</select></label>
 <label>Responsible person<select name="owner" defaultValue={email}>{data.directory.map(p=><option key={p.email} value={p.email}>{p.name||p.email}</option>)}</select></label></div>
 <div className="veh-actions"><button className="veh-primary" disabled={busy}>Save vehicle</button><button type="button" onClick={()=>setMode('list')}>Cancel</button></div></form>}
 {data&&mode==='list'&&<><h2>{capturePending?'Select a vehicle for this evidence':section==='Home'?'Vehicle register':section}</h2>
 {data.vehicles.length?<table className="veh-register"><thead><tr>{['Vehicle','Readiness','Last rego payment','Confirmed expiry','Next action'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.vehicles.map(v=><tr key={v.id}><td data-label="Vehicle"><button onClick={()=>open(v,capturePending?'capture':'detail')}>{v.title}</button><small>{v.details['Registration or serial number']}</small></td><td data-label="Readiness"><Status vehicle={v}/></td><td data-label="Last rego payment">{v.lastPayment?showDate(v.lastPayment.day)+' '+money(v.lastPayment.amount):'No payment recorded'}</td><td data-label="Confirmed expiry">{showDate(v.expiry)}</td><td data-label="Next action">{v.nextAction}</td></tr>)}</tbody></table>:
 <div className="veh-empty"><CarFront size={28}/><h3>No vehicles yet</h3><p>{canEdit?'Add a car, ute, trailer or machine to start its record.':'Vehicles shared with you will appear here.'}</p>{canEdit&&<button onClick={add}>Add your first vehicle</button>}</div>}</>}
 {vehicle&&mode!=='list'&&mode!=='add'&&<><button onClick={()=>{setMode('list');setId('');setError('')}}><ArrowLeft size={16}/>Vehicle register</button>
 <section className="veh-panel"><div className="veh-header"><h2>{vehicle.title}</h2><Status vehicle={vehicle}/></div>
 <div className="veh-grid"><div><small>Last rego payment</small><div>{vehicle.lastPayment?showDate(vehicle.lastPayment.day)+' '+money(vehicle.lastPayment.amount):'No payment recorded'}</div>{vehicle.lastPayment?.source&&<a href={api.file(vehicle.lastPayment.source)}>Open payment receipt</a>}</div>
 <div><small>Confirmed expiry</small><div>{showDate(vehicle.expiry)}</div></div><div><small>Next action</small><div>{vehicle.nextAction}</div></div><div><small>Responsible person</small><div>{data?.directory.find(x=>x.email===vehicle.owner)?.name||vehicle.owner||'Unassigned'}</div></div></div></section>
 {mode==='capture'&&<EvidencePanel key={vehicle.id+(source?.id||'new')} vehicle={vehicle} source={source} api={api} onSave={refresh} onClose={()=>setMode('detail')}/>}
 {['release','hold','fault'].includes(mode)&&<form className="veh-panel veh-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.action(vehicle.id,mode,{reason,revision:vehicle.revision,request:actionId.current});await refresh();setMode('detail')})}}><h2>{mode==='release'?'Return to service':mode==='hold'?'Mark do not use':'Report a fault'}</h2>
 <label>{mode==='release'?'Reason for release and work verified':'What happened?'}<textarea required maxLength={600} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <div className="veh-actions"><button className="veh-primary" disabled={busy}>{mode==='release'?'Confirm return to service':mode==='hold'?'Confirm do not use':'Save fault'}</button><button type="button" onClick={()=>setMode('detail')}>Cancel</button></div></form>}
 {mode==='detail'&&<>{(section==='Home'||section==='Servicing')&&<section className="veh-panel"><h2>Servicing</h2><p>{vehicle.service?vehicle.service.label.replace(/[.]$/, '')+' · '+showDate(vehicle.service.day):'No service recorded.'}</p>{vehicle.service&&(vehicle.service.nextDay||vehicle.service.nextReading)&&<p>Next service due {[vehicle.service.nextDay&&'by '+showDate(vehicle.service.nextDay),vehicle.service.nextReading&&'at '+meterNumber.format(Number(vehicle.service.nextReading))+' '+vehicle.service.unit].filter(Boolean).join(' or ')}{vehicle.service.nextDay&&vehicle.service.nextReading?', whichever comes first':''}</p>}{Object.values(vehicle.meters).map(m=><p key={m.unit}>Last observed {meterNumber.format(Number(m.reading))} {m.unit} on {showDate(m.day)}</p>)}</section>}
 {section==='Home'&&vehicle.open.length>0&&<section className="veh-panel"><h2>Open actions</h2><ul>{vehicle.open.map(e=><li key={e.id}>{e.label}{e.nextDay?' · Due '+showDate(e.nextDay):''}{e.nextReading?' · Due at '+e.nextReading+' '+e.unit:''}</li>)}</ul></section>}
 <VehicleRecords vehicle={vehicle} section={section} api={api} canEdit={canEdit}
   onReview={evidence=>{setSource(evidence);setMode('capture')}}/></>}</>}</div>
}

