import type { GameMode } from '../game/engine';
import type { WorkoutSet } from '../lib/storage';
import type { Screen, SetupPhase } from '../App';
import Icon from './Icon';
const timeLabel=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
interface Props {
 screen:Screen;setupPhase:SetupPhase;mode:GameMode;stats:{reps:number;pipes:number;seconds:number;depth:number};history:WorkoutSet[];result:WorkoutSet|null;pose:boolean;busy:boolean;error:string;pauseReason:string;
 beginCamera:()=>void;startPractice:()=>void;captureTop:()=>void;goHome:()=>void;pause:()=>void;resume:()=>void;finish:()=>void;share:(download:boolean)=>void;
}
export default function WorkoutPanel(p:Props){
 const workouts=p.history.filter(s=>s.mode==='camera');const best=Math.max(0,...workouts.map(s=>s.reps));const total=workouts.reduce((sum,s)=>sum+s.reps,0);
 return <section className="intro">
 {p.screen==='home'?<>
  <h1>Your reps.<br/><span>Their wings.</span></h1>
  <p className="intro-copy">Drop to the floor. Fly through the gaps.<br/>A little arcade. One more pushup.</p>
  <div className="instructions"><div><span className="step-number">1</span><p>Prop your phone on the floor.<small>Front camera facing you. Plenty of light.</small></p></div><div><span className="step-number">2</span><p>Find your range.<small>Hold the top, then lower for calibration.</small></p></div><div><span className="step-number">3</span><p>Make every rep a flight.<small>Down moves down. Up moves up.</small></p></div></div>
  <button className="button primary start-button" onClick={p.beginCamera}><Icon name="camera"/>START A SET<Icon name="arrow"/></button>
  <button className="practice-link" onClick={p.startPractice}>Try keyboard / tap practice <Icon name="arrow" size={16}/></button>
  <p className="privacy-line"><Icon name="shield" size={16}/> Camera stays here. No uploads. No account.</p>
  <div className="personal-stats"><div><strong>{best||'—'}</strong><span>BEST FULL REPS</span></div><div><strong>{total}</strong><span>TOTAL FULL REPS</span></div><div><strong>{workouts.length}</strong><span>SETS SAVED</span></div></div>
 </>:p.screen==='setup'?<>
  <h1 className="session-heading">Find your<br/><span>flight range.</span></h1>
  <p className="intro-copy">Keep your face and both shoulders in frame. Place your phone on a stable surface, facing you.</p>
  <div className="setup-instruction" role={p.setupPhase==="error"?"alert":"status"}><strong>{p.setupPhase==='loading'?'Loading your camera…':p.setupPhase==='top'?'Hold the top position':p.setupPhase==='bottom'?'Lower slowly and hold':p.setupPhase==='error'?'Let’s adjust the setup':'Get into your top position'}</strong><p>{p.setupPhase==='loading'?'The tracker runs locally. The first start can take a few seconds.':p.setupPhase==='top'?'Keep your arms extended comfortably. Stay still until the countdown finishes.':p.setupPhase==='bottom'?'Lower to a comfortable pushup depth. Keep the phone still.':p.setupPhase==='error'?p.error:'When you’re ready, capture your range. We’ll guide you through both positions.'}</p></div>
  {p.setupPhase==='position'&&<button className="button primary" disabled={!p.pose} onClick={p.captureTop}>I’M IN POSITION<Icon name="arrow"/></button>}
  {p.setupPhase==='error'&&<><button className="button primary" onClick={p.beginCamera}>RETRY CAMERA</button><button className="button secondary" onClick={p.startPractice}>PLAY PRACTICE</button></>}
  <p className="tracking-status">{p.pose?'Face and shoulders found.':p.setupPhase==='loading'?'Requesting camera permission…':'Waiting for a clear view of your face and shoulders.'}</p>
  <button className="text-button" onClick={p.goHome}>Cancel setup</button>
 </>:p.screen==='complete'&&p.result?<>
  <div className="completion-label"><Icon name="check"/> SET COMPLETE</div>
  <h1 className="session-heading">Set<br/><span>complete.</span></h1>
  <p className="intro-copy">{p.result.mode==='practice'?'Practice flight logged. Ready to put your reps in control?':'Good work. Take a breath before your next set.'}</p>
  <div className="result-score"><strong>{p.result.mode==='camera'?p.result.reps:p.result.pipes}</strong><span>{p.result.mode==='camera'?'FULL REPS':'PIPES · PRACTICE'}</span></div>
  <div className="result-details"><div><strong>{p.result.pipes}</strong><span>PIPES CLEARED</span></div><div><strong>{timeLabel(p.result.seconds)}</strong><span>SET TIME</span></div></div>
  <div className="share-actions"><button className="button secondary" disabled={p.busy} onClick={()=>p.share(true)}><Icon name="download"/>SAVE IMAGE</button><button className="button secondary" disabled={p.busy} onClick={()=>p.share(false)}><Icon name="share"/>SHARE</button></div>
  <button className="button primary" onClick={p.result.mode==='camera'?p.beginCamera:p.startPractice}>DO ANOTHER SET<Icon name="arrow"/></button>
  <button className="text-button" onClick={p.goHome}>Back to play</button>
 </>:<>
  <h1 className="session-heading">{p.screen==='paused'?'Take a':'Keep it'}<br/><span>{p.screen==='paused'?'breath.':'moving.'}</span></h1>
  <p className="intro-copy">{p.screen==='paused'?p.pauseReason:p.screen==='countdown'&&p.mode==='camera'?'Return to the top position. Your flight begins after the countdown.':p.mode==='camera'?'Your movement controls the bird. Finish a full down-and-up cycle to count a rep.':'Press Space or ↑ to flap. On touch screens, tap the game or the flap button.'}</p>
  <div className="live-stats"><div><strong>{p.mode==='camera'?p.stats.reps:'—'}</strong><span>FULL REPS</span></div><div><strong>{p.stats.pipes}</strong><span>PIPES CLEARED</span></div><div><strong>{timeLabel(p.stats.seconds)}</strong><span>SET TIME</span></div></div>
  {p.mode==='camera'&&<div className="depth-meter"><div className="depth-label"><span>TOP</span><span>BOTTOM</span></div><div className="depth-track"><span style={{left:`${p.stats.depth*100}%`}}/></div><p>Complete the range. Return to the top.</p></div>}
  {p.screen==='paused'?<button className="button primary" onClick={p.resume}>RESUME SET<Icon name="play"/></button>:p.screen==='playing'?<button className="button secondary" onClick={p.pause}><Icon name="pause"/>PAUSE SET</button>:<p className="tracking-status">{p.mode==='camera'&&!p.pose?'Return to the frame to begin.':'Flight starts in a moment.'}</p>}
  <button className="text-button" onClick={p.finish}>End this set</button><p className="session-note">Stop when you need to rest. The game can wait.</p>
 </>}
 </section>;
}
