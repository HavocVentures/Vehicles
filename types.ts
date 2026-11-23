export const tabs = ['Home', 'Registration', 'Maintenance', 'Servicing'] as const;
export type Section = typeof tabs[number];
export const categories = {payment:'Rego payment',expiry:'Confirmed rego expiry',renewal:'Renewal due',fault:'Fault',repair:'Repair completed',service:'Service completed',followup:'Follow-up',meter:'Meter reading'};
export type Entry = {kind:string;label:string;day:string;amount:string;reading:string;unit:string;nextDay:string;nextReading:string;target:string};
export type Fact = Entry & {id:string;source:string;by:string;at:string};
export type Evidence = {id:string;name:string;mime:string;status:string;suggestions:Entry[];transcript?:string};
export type Vehicle = {id:string;title:string;revision:number;details:Record<string,string>;state:string;nextAction:string;expiry:string;lastPayment:Fact|null;service:Fact|null;meters:Record<string,Fact>;held:string;owner:string;canRelease:boolean;open:Fact[];history:Fact[];evidence:Evidence[];files:{id:string;name:string}[];reasons:string[]};
export type Register = {vehicles:Vehicle[];directory:{name:string;email:string}[];limited?:boolean};
export type NewVehicle={title:string;plate:string;model:string;owner:string;use:string;audience:string};
export type Transport={
 list:()=>Promise<Register>; create:(id:string,vehicle:NewVehicle)=>Promise<void>; upload:(id:string,file:File)=>Promise<{id:string}>;
 action:(id:string,action:string,fields:Record<string,unknown>)=>Promise<{status?:string;suggestions?:Entry[];transcript?:string}>;
 file:(id:string)=>string;
};
export function blankEntry():Entry{return {kind:'followup',label:'',day:'',amount:'',reading:'',unit:'',nextDay:'',nextReading:'',target:''}}
export function showDate(day?:string){return day?new Date(day.slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'Unknown'}
export const stateNames:Record<string,string>={ready:'Ready',caution:'Use with caution',check:'Check required',grounded:'Do not use'};
export function money(value?:string){return value?new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(value)):''}

