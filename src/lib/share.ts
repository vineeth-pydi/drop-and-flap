import { drawMascot } from '../game/render';
import { getTheme } from '../themes/themes';
import type { WorkoutSet } from './storage';
export async function makeShareCard(set:WorkoutSet):Promise<Blob> {
  await document.fonts.ready;
  const theme=getTheme(set.theme);const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;
  const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  ctx.fillStyle=theme.colors.background;ctx.fillRect(0,0,1080,1080);
  ctx.strokeStyle=theme.colors.accent;ctx.lineWidth=8;ctx.strokeRect(36,36,1008,1008);
  ctx.fillStyle=theme.colors.text;ctx.textAlign='center';ctx.font='32px "Press Start 2P"';ctx.fillText('DROP & FLAP',540,130);
  ctx.fillStyle=theme.colors.accent;ctx.font='26px "Press Start 2P"';ctx.fillText('SET COMPLETE',540,215);
  drawMascot(ctx,540,330,4,theme,0);
  ctx.fillStyle=theme.colors.text;ctx.font='116px "Press Start 2P"';ctx.fillText(String(set.mode==='camera'?set.reps:set.pipes),540,585);
  ctx.font='27px "Press Start 2P"';ctx.fillText(set.mode==='camera'?'FULL REPS':'PIPES · PRACTICE',540,650);
  ctx.font='28px sans-serif';ctx.fillText(`${set.pipes} pipes cleared  /  ${Math.round(set.seconds)} seconds`,540,770);
  ctx.fillStyle=theme.colors.muted;ctx.font='24px sans-serif';ctx.fillText(`${theme.name} · ${set.difficulty} · ${new Date(set.date).toLocaleDateString()}`,540,850);
  ctx.font='26px sans-serif';ctx.fillText('Your reps. Their wings.',540,962);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not create image')),'image/png'));
}
export function downloadCard(blob:Blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='drop-and-flap-set.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
