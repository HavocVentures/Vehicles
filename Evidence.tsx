'use client';
import {useEffect,useRef,useState} from 'react';
import {Mic,Paperclip,Square} from 'lucide-react';
import {blankEntry,categories,type Evidence,type Vehicle,type Transport,type Entry} from './types';

export type EvidenceNavigation = 'ready' | 'busy' | 'dirty';
export function canLeaveEvidence(state: EvidenceNavigation) {
  return state === 'ready' || (state === 'dirty' && window.confirm('Discard your unsaved changes to this evidence?'));
}
const meterKinds = new Set(['service','repair','fault','meter','followup']);

export function EvidencePanel({vehicle,source,api,onSave,onClose,onNavigationChange}:{vehicle:Vehicle;source?:Evidence;api:Transport;onSave:()=>Promise<void>;onClose:()=>void;onNavigationChange:(state:EvidenceNavigation)=>void}){
 const [evidence,setEvidence]=useState(source),[note,setNote]=useState(''),[entries,setEntries]=useState<Entry[]>(source?.suggestions||[]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),alive=useRef(true),locked=useRef(false),pending=useRef<File|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;const r=recorder.current;if(r?.state==='recording')r.stop();r?.stream.getTracks().forEach(t=>t.stop())}},[]);
 const [edited,setEdited]=useState(false),[startingMic,setStartingMic]=useState(false);
 const gettingStream=useRef(false);
 const navigation:EvidenceNavigation = busy || startingMic || recording ? 'busy'
   : edited || (!evidence && note.trim()) ? 'dirty' : 'ready';
 useEffect(()=>{onNavigationChange(navigation);return()=>onNavigationChange('ready')},[navigation,onNavigationChange]);
 useEffect(()=>{
   if(navigation==='ready')return;
   const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
   window.addEventListener('beforeunload',warn);
   return ()=>window.removeEventListener('beforeunload',warn);
 },[navigation]);
 async function run(fn:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await fn()}catch(e){if(alive.current)setError((e as Error).message)}finally{locked.current=false;if(alive.current)setBusy(false)}}
 async function extract(e:Evidence){
   if(e.mime.startsWith('audio/'))await api.action(vehicle.id,'transcribe',{evidence:e.id});
   const parsed=await api.action(vehicle.id,'extract',{evidence:e.id});if(!alive.current)return;
   setEvidence({...e,status:parsed.status||'review',transcript:parsed.transcript||e.transcript});setEntries(parsed.suggestions||[]);setEdited(false);await onSave();
 }
 async function capture(file:File){await run(async()=>{
    pending.current=file;if(file.size>4*1024*1024)throw Error('Choose a file of 4 MB or less.');
    const saved=await api.upload(vehicle.id,file);pending.current=null;const rows=await api.list();const e=rows.vehicles.find(v=>v.id===vehicle.id)?.evidence.find(v=>v.id===saved.id);
    if(!e)throw Error('Original was received. Reopen this vehicle to review its evidence.');
    if(!alive.current)return;setEvidence(e);setEntries(e.suggestions||[]);await onSave();if(e.status==='saved')await extract(e);
 })}
 async function voice(){if(recording){recorder.current?.stop();return}if(gettingStream.current)return;gettingStream.current=true;setStartingMic(true);setError('');
   try{if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia)throw Error('Choose an audio file or type your note on this device.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current){stream.getTracks().forEach(t=>t.stop());return}
   const type=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!type){stream.getTracks().forEach(t=>t.stop());throw Error('Choose an audio file instead on this device.')}
   const r=new MediaRecorder(stream,{mimeType:type});recorder.current=r;let size=0;const parts:BlobPart[]=[];
   r.ondataavailable=event=>{parts.push(event.data);size+=event.data.size;if(size>3500000&&r.state==='recording')r.stop()};
   r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);void capture(new File(parts,'Voice note.'+(type==='audio/mp4'?'m4a':type.split('/')[1]),{type}))}};
   r.start(500);setRecording(true);
   }catch(e){if(alive.current)setError((e as Error).message)}finally{gettingStream.current=false;if(alive.current)setStartingMic(false)}
 }
 function edit(index:number,key:keyof Entry,value:string){
   setEdited(true);
   setEntries(old=>old.map((entry,i)=>{
     if(i!==index)return entry;
     const next={...entry,[key]:value};
     if(key==='kind' && value!==entry.kind){
       next.target='';
       if(!meterKinds.has(value)){
         next.unit='';next.reading='';next.nextReading='';next.nextDay='';
       }
     }
     return next;
   }));
 }
 return <section className="veh-panel veh-review" aria-label="Evidence review"><div className="veh-header"><h2>{evidence?'Review evidence':'Add evidence'}</h2><button disabled={navigation==='busy'} onClick={()=>{if(canLeaveEvidence(navigation))onClose()}}>Close</button></div>
 {!evidence?<div className="veh-form"><label className="veh-field">Photo, PDF or voice file<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav" disabled={navigation==='busy'} onChange={e=>{const f=e.target.files?.[0];if(f)void capture(f);e.target.value=''}}/></label>
 <label className="veh-field">Typed note<textarea rows={3} disabled={busy||startingMic||recording} value={note} onChange={e=>setNote(e.target.value)} maxLength={20000}/></label>
 <div className="veh-actions"><button disabled={navigation==='busy'||!note.trim()} onClick={()=>void capture(new File([note],'Vehicle note.txt',{type:'text/plain'}))}>Save note</button>
 <button disabled={busy||startingMic} onClick={()=>void voice()}>{recording?<Square size={16}/>:<Mic size={16}/>} {recording?'Stop and save':'Record voice note'}</button></div></div>:
 <><p><Paperclip size={16}/> <a href={api.file(evidence.id)}>{evidence.name}</a> · Original saved</p>
 {evidence.transcript&&<details><summary>Transcript</summary><p>{evidence.transcript}</p></details>}
 {evidence.status==='confirmed'?<p>Review complete.</p>:<><p>Review the suggested changes together. Remove any entry that the evidence does not support.</p>
 <form className="veh-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.action(vehicle.id,'confirm',{evidence:evidence.id,entries});await onSave();onClose()})}}>
 {entries.map((item,i)=><fieldset key={i} disabled={busy}><legend>Entry {i+1}</legend><div className="veh-grid"><label>Type<select value={item.kind} onChange={e=>edit(i,'kind',e.target.value)}>{Object.entries(categories).map(([key,val])=><option key={key} value={key}>{val}</option>)}</select></label>
 <label>{item.kind==='expiry'?'Confirmed expiry':item.kind==='payment'?'Paid on':'Event date'}<input type="date" value={item.day} required={['payment','expiry'].includes(item.kind)} onChange={e=>edit(i,'day',e.target.value)}/></label>
 <label>Description<input value={item.label} required maxLength={600} onChange={e=>edit(i,'label',e.target.value)}/></label>
 <label>Amount (AUD)<input type="number" min="0" step=".01" value={item.amount} onChange={e=>edit(i,'amount',e.target.value)}/></label>
 {meterKinds.has(item.kind)&&<><label>Meter unit<select value={item.unit} onChange={e=>edit(i,'unit',e.target.value)}><option value="">Choose unit</option><option value="km">Kilometres</option><option value="h">Engine hours</option></select></label><label>Reading<input type="number" min="0" step=".01" value={item.reading} onChange={e=>edit(i,'reading',e.target.value)}/></label><label>Next due at reading<input type="number" min="0" step=".01" value={item.nextReading} onChange={e=>edit(i,'nextReading',e.target.value)}/></label><label>Next due date<input type="date" value={item.nextDay} onChange={e=>edit(i,'nextDay',e.target.value)}/></label></>}
 {['repair','payment'].includes(item.kind)&&<label>Completes<select value={item.target} onChange={e=>edit(i,'target',e.target.value)}><option value="">No linked item</option>{vehicle.open.filter(x=>(x.kind==='renewal')===(item.kind==='payment')).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>}</div>
 <button type="button" disabled={busy} onClick={()=>{setEdited(true);setEntries(entries.filter((_,n)=>n!==i))}}>Remove entry</button></fieldset>)}
 <div className="veh-actions"><button type="button" disabled={busy} onClick={()=>{setEdited(true);setEntries([...entries,blankEntry()])}}>Add entry</button>
 {evidence.status==='saved'&&<button type="button" disabled={busy} onClick={()=>{if(!edited||window.confirm('Replace your edited entries with newly extracted suggestions?'))void run(()=>extract(evidence))}}>Extract suggestions</button>}
 <button className="veh-primary" disabled={busy}>{entries.length?'Confirm reviewed changes':'File original only'}</button></div></form></>}</>}
 {recording&&<p role="status">Recording. Select Stop and save before leaving.</p>}
 {startingMic&&<p role="status">Waiting for microphone access…</p>}
 {busy&&<p role="status">{evidence?'Processing evidence…':'Saving original…'}</p>}{error&&<p role="alert">{error} {pending.current&&!evidence&&<button onClick={()=>void capture(pending.current!)}>Retry upload</button>}</p>}</section>
}

