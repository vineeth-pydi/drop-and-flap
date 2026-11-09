import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createGame, startGame, updateGame, flap, pauseGame, resumeGame, type GameMode } from './game/engine';
import { RepCounter, normalizePoseRatio, validateCalibration } from './game/reps';
import { renderGame } from './game/render';
import { getTheme } from './themes/themes';
import { loadSettings, saveSettings, loadHistory, saveSet, loadPhoto, savePhoto, deletePhoto, deleteHistory, type Settings, type WorkoutSet } from './lib/storage';
import { ArcadeAudio, haptic, keepAwake, releaseAwake } from './lib/audio';
import { makeShareCard, downloadCard } from './lib/share';
import type { PoseFrame, PoseSource } from './pose/types';
import { PoseRatioSmoother, summarizeCalibrationHold } from './pose/signal';
import Icon, { PixelBird } from './ui/Icon';
import SettingsPanel from './ui/SettingsPanel';
import HistoryPanel from './ui/HistoryPanel';
import WorkoutPanel from './ui/WorkoutPanel';
import FormCheckPanel from './ui/FormCheckPanel';
export type Screen = 'home'|'setup'|'countdown'|'playing'|'paused'|'complete';
export type SetupPhase = 'loading'|'position'|'top'|'bottom'|'error';
type Tab = 'workout'|'form'|'history'|'settings';
export const timeLabel=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export default function App({formPoseSourceFactory}:{formPoseSourceFactory?:(onError:(error:Error)=>void)=>PoseSource}={}){
 const [settings,setSettings]=useState<Settings>(loadSettings);
 const [tab,setTab]=useState<Tab>('workout');const [formActive,setFormActive]=useState(false);const [screen,setScreen]=useState<Screen>('home');
 const [setupPhase,setSetupPhase]=useState<SetupPhase>('position');const [countdown,setCountdown]=useState(3);
 const [mode,setMode]=useState<GameMode>('practice');const [history,setHistory]=useState<WorkoutSet[]>([]);
 const [result,setResult]=useState<WorkoutSet|null>(null);const [photoUrl,setPhotoUrl]=useState('');
 const [notice,setNotice]=useState('');const [error,setError]=useState('');const [pauseReason,setPauseReason]=useState('');
 const [stats,setStats]=useState({reps:0,pipes:0,seconds:0,depth:0});const [pose,setPose]=useState<PoseFrame|null>(null);
 const [busy,setBusy]=useState(false);const [offline,setOffline]=useState(!navigator.onLine);const [canInstall,setCanInstall]=useState(false);
 const installPrompt=useRef<(Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>})|null>(null);
 const canvas=useRef<HTMLCanvasElement>(null);const video=useRef<HTMLVideoElement>(null);
 const game=useRef(createGame(settings.difficulty));const counter=useRef(new RepCounter());
 const source=useRef<PoseSource|null>(null);const stream=useRef<MediaStream|null>(null);
 const cameraAttempt=useRef(0);const ratioSmoother=useRef(new PoseRatioSmoother());const countedPoseAt=useRef(-1);
 const audio=useRef(new ArcadeAudio());const poseRef=useRef<PoseFrame|null>(null);const lastGood=useRef(0);
 const ratios=useRef<{value:number;at:number}[]>([]);const calibration=useRef<{top:number;bottom:number}|null>(null);
 const capture=useRef<{phase:'top'|'bottom';started:number}|null>(null);const countdownAt=useRef(0);
 const input=useRef<number|undefined>(undefined);const saved=useRef(false);
 const runtime=useRef({screen,settings,mode,setupPhase});runtime.current={screen,settings,mode,setupPhase};
 const theme=getTheme(settings.theme);const active=formActive||['setup','countdown','playing','paused'].includes(screen);
 const updateSettings=(patch:Partial<Settings>)=>{if(patch.sound)audio.current.unlock();setSettings(s=>({...s,...patch}));};
 useEffect(()=>{if(!saveSettings(settings))setNotice('Settings could not be saved. Browser storage may be full.');},[settings]);
 useEffect(()=>{
  void loadHistory().then(setHistory).catch(()=>setNotice('History storage is unavailable. Sets can still be played.'));
  void loadPhoto().then(p=>{if(p)setPhotoUrl(URL.createObjectURL(p));}).catch(()=>undefined);
  const online=()=>setOffline(!navigator.onLine);window.addEventListener('online',online);window.addEventListener('offline',online);
  const install=(event:Event)=>{event.preventDefault();installPrompt.current=event as typeof installPrompt.current;setCanInstall(true);};
  window.addEventListener('beforeinstallprompt',install);
  return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',online);window.removeEventListener('beforeinstallprompt',install);};
 },[]);
 useEffect(()=>()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);},[photoUrl]);
 const stopCamera=useCallback(()=>{cameraAttempt.current+=1;source.current?.stop();source.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;poseRef.current=null;lastGood.current=0;ratios.current=[];ratioSmoother.current.reset();countedPoseAt.current=-1;setPose(null);},[]);
 useEffect(()=>()=>{cameraAttempt.current+=1;source.current?.stop();stream.current?.getTracks().forEach(t=>t.stop());void releaseAwake();},[]);
 const finish=useCallback(()=>{
  if(saved.current)return;saved.current=true;game.current.status='crashed';
  const r:WorkoutSet={id:crypto.randomUUID(),date:Date.now(),reps:counter.current.count,pipes:game.current.score,seconds:Math.round(game.current.elapsed),theme:runtime.current.settings.theme,difficulty:runtime.current.settings.difficulty,mode:runtime.current.mode};
  setResult(r);setScreen('complete');stopCamera();void releaseAwake();
  void saveSet(r).then(()=>setHistory(h=>[r,...h])).catch(()=>setNotice('This set could not be saved. You can still save its image.'));
 },[stopCamera]);
 const practiceFlap=useCallback(()=>{if(runtime.current.screen!=='playing'||runtime.current.mode!=='practice')return;flap(game.current);audio.current.play('flap',getTheme(runtime.current.settings.theme),runtime.current.settings.sound);},[]);
 const pause=useCallback((reason='Take a breath. Resume when you’re ready.')=>{if(runtime.current.screen!=='playing')return;pauseGame(game.current);counter.current.discardPartial();countedPoseAt.current=-1;setPauseReason(reason);setScreen('paused');void releaseAwake();},[]);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes((e.target as HTMLElement)?.tagName))return;if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();practiceFlap();}if(e.code==='Escape')pause();};
  const visibility=()=>{if(document.hidden)pause('The app was put in the background. Resume when you’re ready.');};
  window.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);
  return()=>{window.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);};
 },[practiceFlap,pause]);
 useEffect(()=>{
  let frameId=0,previous=performance.now(),lastUi=0;
  const loop=(now:number)=>{
   const dt=Math.min(.05,(now-previous)/1000);previous=now;const r=runtime.current;
   const tracked=poseRef.current;const fresh=tracked&&now-lastGood.current<500;
   const distanceOk=tracked&&tracked.shoulderWidth>.075&&tracked.shoulderWidth<.72;
   if(r.screen==='setup'&&capture.current){
    const c=capture.current;const duration=c.phase==='top'?3:4;
    if(!fresh||!distanceOk){c.started=now;ratios.current=[];}
    const remaining=Math.max(1,Math.ceil(duration-(now-c.started)/1000));setCountdown(previous=>previous===remaining?previous:remaining);
    if(now-c.started>=duration*1000){
     const samples=ratios.current.filter(v=>now-v.at<1000).map(v=>v.value);
     const hold=summarizeCalibrationHold(samples);
     if(hold){
      if(!hold.stable){capture.current=null;setSetupPhase('error');setError('The position was still moving. Keep the phone fixed and hold each position still for the final second, then retry.');}
      else{const value=hold.value;
      if(c.phase==='top'){calibration.current={top:value,bottom:value};capture.current={phase:'bottom',started:now};setSetupPhase('bottom');ratios.current=[];}
      else{const top=calibration.current!.top;const checked=validateCalibration(top,value);
       if(checked.valid){calibration.current={top,bottom:value};capture.current=null;game.current=createGame(r.settings.difficulty);counter.current.reset();countdownAt.current=now;setCountdown(3);setScreen('countdown');}
       else{capture.current=null;setSetupPhase('error');setError('The two positions were too similar. Keep the phone still and try a deeper, comfortable movement.');}
      }}
     }else{c.started=now;}
    }
   }
   if(r.screen==='countdown'){
    const remaining=3-(now-countdownAt.current)/1000;setCountdown(previous=>previous===Math.max(1,Math.ceil(remaining))?previous:Math.max(1,Math.ceil(remaining)));
    if(r.mode==='camera'&&(!fresh||!distanceOk))countdownAt.current=now;
    if(remaining<=0&&(r.mode==='practice'||(fresh&&distanceOk))){startGame(game.current);setScreen('playing');canvas.current?.focus();void keepAwake();}
   }
   if(r.screen==='playing'){
    if(r.mode==='camera'){
     if(!fresh||!distanceOk)pause(!tracked?'Step back into view. Keep your face and both shoulders visible.':!distanceOk?(tracked.shoulderWidth<.075?'Move closer so your face and shoulders are visible.':'Move back so both shoulders fit in the frame.'):'Tracking was lost. Check the light and return to the frame.');
     else if(calibration.current){const progress=normalizePoseRatio(tracked!.ratio,calibration.current.top,calibration.current.bottom);
      if(progress!==null){input.current=progress;if(tracked!.timestamp!==countedPoseAt.current){countedPoseAt.current=tracked!.timestamp;if(counter.current.update(progress,tracked!.timestamp)){audio.current.play('flap',getTheme(r.settings.theme),r.settings.sound);haptic(r.settings.haptics);}}}
     }
    }
    if(game.current.status==='playing'){
     const score=game.current.score;const updated=updateGame(game.current,dt,r.mode==='camera'?input.current:undefined);
     if(game.current.score>score)audio.current.play('score',getTheme(r.settings.theme),r.settings.sound);
     if(updated.status==='crashed'){audio.current.play('crash',getTheme(r.settings.theme),r.settings.sound);haptic(r.settings.haptics,'crash');finish();}
    }
   }
   if(now-lastUi>90){lastUi=now;setStats({reps:counter.current.count,pipes:game.current.score,seconds:game.current.elapsed,depth:input.current||0});setPose(poseRef.current);}
   const ctx=canvas.current?.getContext('2d');
   if(ctx)renderGame(ctx,game.current,getTheme(r.settings.theme),{scene:r.settings.scene,reducedMotion:r.settings.reducedMotion,transparent:r.settings.background!=='scene',preview:r.screen==='home',time:now/1000,highContrast:r.settings.highContrast});
   frameId=requestAnimationFrame(loop);
  };
  frameId=requestAnimationFrame(loop);return()=>cancelAnimationFrame(frameId);
 },[finish,pause]);
 async function beginCamera(){
  stopCamera();const attempt=cameraAttempt.current;const isCurrent=()=>attempt===cameraAttempt.current;
  setTab('workout');setMode('camera');setScreen('setup');setSetupPhase('loading');setError('');setNotice('');saved.current=false;
  calibration.current=null;capture.current=null;input.current=undefined;ratios.current=[];counter.current.reset();
  game.current=createGame(settings.difficulty);audio.current.unlock();
  let cameraStream:MediaStream|null=null;let tracker:PoseSource|null=null;
  const disposeAttempt=()=>{tracker?.stop();cameraStream?.getTracks().forEach(t=>t.stop());if(source.current===tracker)source.current=null;if(stream.current===cameraStream)stream.current=null;if(video.current?.srcObject===cameraStream)video.current.srcObject=null;};
  try{
   const {MediaPipePoseSource,createCameraStream}=await import('./pose/MediaPipePoseSource');
   if(!isCurrent())return;
   cameraStream=await createCameraStream();
   if(!isCurrent()){disposeAttempt();return;}
   const cameraVideo=video.current;if(!cameraVideo)throw new Error('The camera preview is unavailable. Return to Play and retry.');
   stream.current=cameraStream;cameraVideo.srcObject=cameraStream;
   const activeTracker=new MediaPipePoseSource({onError:(failure)=>{
    if(!isCurrent()||source.current!==activeTracker)return;
    const failedScreen=runtime.current.screen;capture.current=null;counter.current.discardPartial();
    if(failedScreen==='playing'||failedScreen==='paused'){pauseGame(game.current);setPauseReason(failure.message);setScreen('paused');}
    else setScreen('setup');
    stopCamera();void releaseAwake();setError(failure.message);setSetupPhase('error');
   }});tracker=activeTracker;source.current=activeTracker;
   await activeTracker.start(cameraVideo,frame=>{
    if(!isCurrent()||source.current!==activeTracker)return;
    if(frame){const value=ratioSmoother.current.update(frame.ratio,frame.timestamp);if(value===null){poseRef.current=null;return;}const now=performance.now();lastGood.current=frame.timestamp;ratios.current.push({value,at:now});ratios.current=ratios.current.filter(v=>now-v.at<1500);poseRef.current={...frame,ratio:value};}
    else if(performance.now()-lastGood.current>=500){ratioSmoother.current.reset();poseRef.current=null;}
   });
   if(!isCurrent()){disposeAttempt();return;}
   setSetupPhase('position');
  }catch(e){disposeAttempt();if(!isCurrent())return;stopCamera();capture.current=null;setError(e instanceof Error?e.message:'Camera could not start. Check browser permission.');setSetupPhase('error');}
 }
 function startPractice(){stopCamera();audio.current.unlock();setTab('workout');setMode('practice');game.current=createGame(settings.difficulty);counter.current.reset();saved.current=false;input.current=undefined;setResult(null);setError('');setScreen('countdown');countdownAt.current=performance.now();setCountdown(3);}
 function goHome(){stopCamera();capture.current=null;saved.current=true;setScreen('home');game.current=createGame(settings.difficulty);void releaseAwake();}
 function resume(){const tracked=poseRef.current;if(mode==='camera'&&(!tracked||performance.now()-lastGood.current>500||tracked.shoulderWidth<=.075||tracked.shoulderWidth>=.72)){setPauseReason('Tracking is not ready. Bring your face and both shoulders into view, or end this set.');return;}counter.current.discardPartial();countedPoseAt.current=-1;resumeGame(game.current);setScreen('playing');void keepAwake();}
 async function share(download=false){
  if(!result)return;setBusy(true);
  try{const blob=await makeShareCard(result);const file=new File([blob],'drop-and-flap-set.png',{type:'image/png'});
   if(!download&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Drop & Flap',text:'Your reps. Their wings.'});
   else{downloadCard(blob);setNotice(download?'Set image saved.':'Sharing is unavailable here. Your set image was downloaded.');}
  }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setNotice('Could not create the share image. Please try again.');}finally{setBusy(false);}
 }
 async function pickPhoto(file:File|undefined){
  if(!file)return;if(!file.type.startsWith('image/')||file.size>12*1024*1024){setNotice('Choose an image smaller than 12 MB.');return;}
  try{const bitmap=await createImageBitmap(file);bitmap.close();await savePhoto(file);setPhotoUrl(URL.createObjectURL(file));updateSettings({background:'photo'});setNotice('Your photo is saved on this device.');}catch{setNotice('This photo could not be opened or saved. Try a JPEG or PNG.');}
 }
 const css={ '--bg':theme.colors.background,'--panel':theme.colors.panel,'--text':theme.colors.text,'--muted':theme.colors.muted,'--accent':theme.colors.accent,'--secondary':theme.colors.secondary,'--border':theme.colors.border,'--pixel-font':theme.font } as CSSProperties;
 const cameraBackground=settings.background==='camera'||settings.background==='blurred';const showVideo=screen==='setup'||(cameraBackground&&mode==='camera'&&active);const videoWidth=video.current?.videoWidth||640;const videoHeight=video.current?.videoHeight||480;
 return <div className={`app theme-${theme.id}${settings.highContrast?' high-contrast':''}${settings.reducedMotion?' reduced-motion':''}`} style={css}>
  <header className="header"><button className="brand" onClick={()=>{if(!active){goHome();setTab('workout');}}} disabled={active} aria-label="Drop and Flap home"><PixelBird/><span>DROP <span className="brand-amp">&</span> FLAP</span></button><span className="local-tag"><Icon name="shield" size={14}/> ON YOUR DEVICE</span><button className="icon-button" onClick={()=>{audio.current.unlock();updateSettings({sound:!settings.sound});}} aria-label={settings.sound?'Mute sound':'Enable sound'} title={settings.sound?'Mute sound':'Enable sound'}><Icon name={settings.sound?'sound':'mute'}/></button></header>
  <nav className="tabs" aria-label="Main navigation">{(['workout','form','history','settings'] as Tab[]).map(t=><button key={t} className={tab===t?'selected':''} aria-current={tab===t?'page':undefined} onClick={()=>{if(!active)setTab(t);}} disabled={active&&tab!==t}><Icon name={t==='workout'?'bolt':t==='form'?'check':t}/>{t==='workout'?'PLAY':t.toUpperCase()}</button>)}<span className="version">V1.1 <span className="status-dot"/> {offline?'OFFLINE':'READY'}</span></nav>
  {notice&&<div className="notice" role="status"><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')} aria-label="Dismiss message"><Icon name="close" size={16}/></button></div>}
  <main>
  {tab==='form'&&<FormCheckPanel poseSourceFactory={formPoseSourceFactory} settings={settings} onActiveChange={setFormActive} onSaved={savedSet=>setHistory(h=>[savedSet,...h.filter(s=>s.id!==savedSet.id)])} onNotice={setNotice}/>}
  {tab==='workout'&&<div className={`workout-layout ${active?'in-session':''}`}>
   <WorkoutPanel screen={screen} setupPhase={setupPhase} mode={mode} stats={stats} history={history} result={result} pose={!!pose} busy={busy} error={error} pauseReason={pauseReason} beginCamera={()=>void beginCamera()} startPractice={startPractice} captureTop={()=>{capture.current={phase:'top',started:performance.now()};ratios.current=[];setSetupPhase('top');setCountdown(3);}} goHome={goHome} pause={()=>pause()} resume={resume} finish={finish} share={download=>void share(download)}/>
   <section className="cabinet" aria-label="Game cabinet">
    <div className="cabinet-top"><span>{theme.name.toUpperCase()}</span><button onClick={()=>{if(!active)setTab('settings');}} disabled={active} aria-label="Choose theme"><Icon name="settings" size={16}/></button></div>
    <div className="game-scoreboard"><span><small>{mode==='camera'&&active?'REPS':'PIPES'}</small>{mode==='camera'&&active?stats.reps:screen==='home'?'00':stats.pipes.toString().padStart(2,'0')}</span><span className="game-state-label">{screen==='home'?'READY TO FLY':screen==='complete'?'SET COMPLETE':screen==='setup'?'CALIBRATING':mode==='practice'?'PRACTICE':'PUSHUP MODE'}</span><span><small>TIME</small>{screen==='home'?'0:00':timeLabel(stats.seconds)}</span></div>
    <div className={`game-screen ${settings.crt&&!settings.reducedMotion?'crt-motion':''}`} style={{'--crt-opacity':settings.crt/100*.4} as CSSProperties}>
     <div className="background-layer" style={{backgroundColor:settings.solid}}/>
     {settings.background==='photo'&&photoUrl&&<img className="background-media" src={photoUrl} alt="" style={{filter:`blur(${settings.blur}px) brightness(${1-settings.dim/100})`}}/>}
     <video ref={video} className={`background-media camera-video ${showVideo?'shown':''}`} muted autoPlay playsInline style={{objectFit:screen==='setup'?'contain':undefined,filter:screen==='setup'?'none':`blur(${settings.background==='blurred'?settings.blur:0}px) brightness(${1-settings.dim/100})`}}/>
     <canvas ref={canvas} tabIndex={0} width={480} height={640} className={screen==='setup'?'setup-canvas':''} aria-label="Pixel bird game. Use Space, up arrow, or the flap button in practice mode." onPointerDown={practiceFlap}/>
     {screen==='setup'&&pose&&<svg className="pose-overlay" viewBox={`0 0 ${videoWidth} ${videoHeight}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><line x1={(1-pose.leftShoulder.x)*videoWidth} y1={pose.leftShoulder.y*videoHeight} x2={(1-pose.rightShoulder.x)*videoWidth} y2={pose.rightShoulder.y*videoHeight}/><circle cx={(1-pose.nose.x)*videoWidth} cy={pose.nose.y*videoHeight} r={12}/>{[[11,13],[13,15],[12,14],[14,16]].map(([a,b])=>pose.landmarks[a]&&pose.landmarks[b]?<line key={a} x1={(1-pose.landmarks[a].x)*videoWidth} y1={pose.landmarks[a].y*videoHeight} x2={(1-pose.landmarks[b].x)*videoWidth} y2={pose.landmarks[b].y*videoHeight}/>:null)}</svg>}
     <div className="scanlines" aria-hidden="true"/>
     {screen==='home'&&<div className="preview-overlay"><div className="preview-title">ONE MORE<br/><span>REP.</span></div><span className="preview-hint">YOUR BODY IS THE CONTROLLER</span></div>}
     {(screen==='countdown'||(screen==='setup'&&(setupPhase==='top'||setupPhase==='bottom')))&&<div className="countdown-overlay" role="status"><strong>{countdown}</strong><span>{screen==='countdown'?(mode==='camera'?'RETURN TO THE TOP':'GET READY'):setupPhase==='top'?'HOLD THE TOP':'HOLD THE BOTTOM'}</span></div>}
     {screen==='paused'&&<div className="game-overlay"><Icon name="pause" size={42}/><strong>PAUSED</strong><span>Rest. Reset. Fly again.</span></div>}
     {screen==='complete'&&<div className="game-overlay crash-overlay"><strong>CRASH!</strong><span>Every flight counts.</span></div>}
     {screen==='setup'&&!pose&&<div className="camera-guide"><Icon name="camera" size={36}/><span>{setupPhase==='error'?'CAMERA UNAVAILABLE':'FACE + SHOULDERS IN FRAME'}</span></div>}
    </div>
    <div className="cabinet-bottom"><span className="status-dot"/><span>{screen==='home'?'DOWN / UP / FLY':mode==='practice'?'SPACE / UP / TAP TO FLAP':'FULL RANGE. FULL REPS.'}</span><PixelBird/></div>
    {screen==='playing'&&mode==='practice'&&<button className="button primary flap-button" onClick={practiceFlap}>FLAP<Icon name="arrow"/></button>}
    <p className="cabinet-caption">{screen==='home'?'A preview of your next flight. Zero reps required.':`${settings.difficulty.toUpperCase()} · ${mode==='practice'?'KEYBOARD / TOUCH':'ON-DEVICE CAMERA'}`}</p>
   </section>
  </div>}
  {tab==='history'&&<HistoryPanel history={history} onPlay={()=>{goHome();setTab('workout');}} onClear={()=>{if(window.confirm('Delete all saved sets from this device? This cannot be undone.'))void deleteHistory().then(()=>setHistory([])).catch(()=>setNotice('History could not be deleted.'));}}/>}
  {tab==='settings'&&<SettingsPanel settings={settings} updateSettings={updateSettings} photoUrl={photoUrl} pickPhoto={file=>void pickPhoto(file)} removePhoto={()=>void deletePhoto().then(()=>{setPhotoUrl('');updateSettings({background:'scene'});}).catch(()=>setNotice('Photo could not be removed.'))} canInstall={canInstall} install={()=>{void installPrompt.current?.prompt().then(()=>installPrompt.current?.userChoice).then(()=>setCanInstall(false));}}/>}
  </main><footer><span>ONE MORE REP. ONE MORE FLIGHT.</span><span>BUILT FOR YOUR NEXT PERSONAL BEST.</span></footer>
 </div>;
}
