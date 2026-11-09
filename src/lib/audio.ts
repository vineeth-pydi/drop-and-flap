import type { Theme } from '../themes/themes';
export class ArcadeAudio {
  private context:AudioContext|undefined;
  unlock(){this.context??=new AudioContext();void this.context.resume();}
  play(kind:'flap'|'score'|'crash',theme:Theme,enabled:boolean){
    if(!enabled || !this.context || this.context.state!=='running')return;
    const ctx=this.context; const oscillator=ctx.createOscillator();const gain=ctx.createGain();
    oscillator.type='square';oscillator.frequency.setValueAtTime(theme.sound[kind],ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind==='crash'?45:theme.sound[kind]*1.5,ctx.currentTime+.13);
    gain.gain.setValueAtTime(.045,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.16);
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.17);
  }
}
export function haptic(enabled:boolean,kind:'rep'|'crash'='rep'){if(enabled && 'vibrate' in navigator) navigator.vibrate(kind==='rep'?25:[40,40,60]);}
let wakeLock:WakeLockSentinel|undefined;
export async function keepAwake(){try{if('wakeLock' in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch{/* Browser may reject in low-power mode. */}}
export async function releaseAwake(){await wakeLock?.release().catch(()=>undefined);wakeLock=undefined;}
