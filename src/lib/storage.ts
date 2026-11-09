import type { Difficulty, GameMode } from '../game/engine';
import { getTheme } from '../themes/themes';
export type BackgroundMode = 'scene' | 'camera' | 'blurred' | 'photo' | 'solid';
export interface Settings {
  theme: string; background: BackgroundMode; scene: 'gym'|'arcade'|'sunset'|'city'|'space';
  blur: number; dim: number; crt: number; sound: boolean; haptics: boolean;
  reducedMotion: boolean; highContrast: boolean; difficulty: Difficulty; solid: string;
}
export const defaults: Settings = {
  theme:'neon', background:'scene', scene:'gym', blur:4, dim:35, crt:0, sound:true,
  haptics:true, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
  highContrast:false, difficulty:'easy', solid:'#10120f'
};
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('drop-flap-settings') || '{}');
    const result = {...defaults, ...saved};
    result.theme = getTheme(result.theme).id;
    if(!['scene','camera','blurred','photo','solid'].includes(result.background)) result.background = 'scene';
    if(!['gym','arcade','sunset','city','space'].includes(result.scene)) result.scene = 'gym';
    if(!['easy','normal','hard'].includes(result.difficulty)) result.difficulty = 'easy';
    for(const key of ['blur','dim','crt'] as const) result[key] = Math.max(0,Math.min(key==='blur'?16:100,Number(result[key])||0));
    for(const key of ['sound','haptics','reducedMotion','highContrast'] as const) if(typeof result[key] !== 'boolean') result[key]=defaults[key];
    if(!/^#[0-9a-f]{6}$/i.test(result.solid)) result.solid=defaults.solid;
    return result;
  } catch {return defaults;}
}
export function saveSettings(settings: Settings): boolean {
  try {localStorage.setItem('drop-flap-settings',JSON.stringify(settings));return true;}catch{return false;}
}
export interface WorkoutSet {id:string;date:number;reps:number;pipes:number;seconds:number;theme:string;difficulty:Difficulty;mode:GameMode;formChecked?:boolean;variant?:'standard'|'knees';formRejected?:number;}
let database: Promise<IDBDatabase> | undefined;
function db():Promise<IDBDatabase> {
  return database ??= new Promise((resolve,reject)=>{
    const request=indexedDB.open('drop-flap',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('sets',{keyPath:'id'});request.result.createObjectStore('assets');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error);};
  });
}
async function transact<T>(store:string,mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const database=await db();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(store,mode);const request=operation(transaction.objectStore(store));
    let result:T; request.onsuccess=()=>{result=request.result;};
    transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
  });
}
export async function loadHistory():Promise<WorkoutSet[]> {return (await transact('sets','readonly',s=>s.getAll()) as WorkoutSet[]).sort((a,b)=>b.date-a.date);}
export async function saveSet(set:WorkoutSet):Promise<void> {await transact('sets','readwrite',s=>s.put(set));}
export async function deleteHistory():Promise<void> {await transact('sets','readwrite',s=>s.clear());}
export async function loadPhoto():Promise<Blob|undefined> {return transact('assets','readonly',s=>s.get('background'));}
export async function savePhoto(photo:Blob):Promise<void> {await transact('assets','readwrite',s=>s.put(photo,'background'));}
export async function deletePhoto():Promise<void> {await transact('assets','readwrite',s=>s.delete('background'));}
