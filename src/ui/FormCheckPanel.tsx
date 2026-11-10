import { useCallback, useEffect, useRef, useState } from 'react'
import { assessPushupForm, FormRepCounter, type FormAssessment, type FormVariant } from '../game/form'
import { ArcadeAudio, haptic, keepAwake, releaseAwake } from '../lib/audio'
import { getTheme } from '../themes/themes'
import { saveSet, type Settings, type WorkoutSet } from '../lib/storage'
import { createCameraStream, MediaPipePoseSource } from '../pose/MediaPipePoseSource'
import type { PoseFrame, PoseLandmark, PoseSource } from '../pose/types'
import Icon from './Icon'
import './form-check.css'

export type FormPoseSourceFactory = (onError: (error: Error) => void) => PoseSource

interface FormCheckPanelProps {
  settings: Settings
  onSaved: (set: WorkoutSet) => void
  onNotice: (message: string) => void
  onActiveChange: (active: boolean) => void
  poseSourceFactory?: FormPoseSourceFactory
}

type Stage = 'intro' | 'loading' | 'ready' | 'countdown' | 'active' | 'paused' | 'result' | 'error'
type SaveStatus = 'saving' | 'saved' | 'failed'
interface Runtime {
  stage: Stage
  variant: FormVariant
  assessment: FormAssessment | null
  lastTimestamp: number
  lastFrameAt: number
  countdownAt: number
  countdownReturn: 'ready' | 'paused'
  activeAt: number | null
  activeMs: number
  hasStarted: boolean
  finished: boolean
  saving: boolean
  saved: boolean
  theme: string
  difficulty: Settings['difficulty']
}

const LOST_TRACKING_MS = 500
const COUNTDOWN_MS = 8000

function timeLabel(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function FitGuide() {
  return <svg className="form-fit-guide" viewBox="0 0 640 480" aria-hidden="true">
    <path className="form-guide-corners" d="M34 85V45H90M550 45H606V85M606 395V435H550M90 435H34V395" />
    <g className="form-guide-body">
      <circle cx="110" cy="159" r="25" />
      <path d="m133 169 192 33 188 35 67 9M133 169 118 257 101 352M325 202 432 223 513 237M79 355H131M557 249H601" />
      {[ [133,169], [118,257], [101,352], [325,202], [432,223], [513,237] ].map(([x,y], index) => <circle key={index} cx={x} cy={y} r="6" />)}
    </g>
    <path className="form-guide-floor" d="M63 365H602" />
  </svg>
}

function JointOverlay({ landmarks, assessment }: { landmarks: PoseLandmark[]; assessment: FormAssessment | null }) {
  if (!assessment?.side) return null
  const indices = assessment.side === 'left' ? [11, 13, 15, 23, 25, 27] : [12, 14, 16, 24, 26, 28]
  const points = indices.map((index) => landmarks[index])
  const visible = (point: PoseLandmark | undefined): point is PoseLandmark => !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && (point.visibility ?? 0) >= .6
  const links = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5]]
  return <svg className={`form-joints ${assessment.trackable && assessment.alignment === 'aligned' ? 'aligned' : 'adjust'}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
    {links.map(([from,to]) => visible(points[from]) && visible(points[to]) ? <line key={`${from}-${to}`} x1={points[from].x * 1000} y1={points[from].y * 1000} x2={points[to].x * 1000} y2={points[to].y * 1000} /> : null)}
    {points.map((point,index) => visible(point) ? <circle key={index} cx={point.x * 1000} cy={point.y * 1000} r="9" /> : null)}
  </svg>
}

export default function FormCheckPanel({ settings, onSaved, onNotice, onActiveChange, poseSourceFactory }: FormCheckPanelProps) {
  const [stage, setStage] = useState<Stage>('intro')
  const [variant, setVariant] = useState<FormVariant>('standard')
  const [assessment, setAssessment] = useState<FormAssessment | null>(null)
  const [landmarks, setLandmarks] = useState<PoseLandmark[]>([])
  const [aspectRatio, setAspectRatio] = useState(4 / 3)
  const [counts, setCounts] = useState({ reps: 0, rejected: 0, feedback: 'Start with straight arms at the top.' })
  const [seconds, setSeconds] = useState(0)
  const [countdown, setCountdown] = useState(COUNTDOWN_MS / 1000)
  const [fresh, setFresh] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<WorkoutSet | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saving')
  const [counter] = useState(() => new FormRepCounter())
  const [audio] = useState(() => new ArcadeAudio())
  const video = useRef<HTMLVideoElement>(null)
  const source = useRef<PoseSource | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const cameraSession = useRef(0)
  const mounted = useRef(false)
  const latest = useRef({ settings, onSaved, onNotice, onActiveChange, poseSourceFactory })
  const runtime = useRef<Runtime>({ stage: 'intro', variant: 'standard', assessment: null, lastTimestamp: -Infinity, lastFrameAt: -Infinity, countdownAt: 0, countdownReturn: 'ready', activeAt: null, activeMs: 0, hasStarted: false, finished: false, saving: false, saved: false, theme: settings.theme, difficulty: settings.difficulty })

  useEffect(() => { latest.current = { settings, onSaved, onNotice, onActiveChange, poseSourceFactory } }, [settings, onSaved, onNotice, onActiveChange, poseSourceFactory])

  const changeStage = useCallback((next: Stage) => {
    runtime.current.stage = next
    if (mounted.current) {
      latest.current.onActiveChange(next === 'countdown' || (runtime.current.hasStarted && next !== 'result' && next !== 'intro'))
      setStage(next)
    }
  }, [])

  const releaseCamera = useCallback(() => {
    cameraSession.current += 1
    source.current?.stop()
    source.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    runtime.current.assessment = null
    runtime.current.lastFrameAt = -Infinity
  }, [])

  const pause = useCallback((reason: string) => {
    const current = runtime.current
    if (current.stage !== 'active' && current.stage !== 'countdown') return
    if (current.activeAt !== null) current.activeMs += performance.now() - current.activeAt
    current.activeAt = null
    counter.discardPartial()
    changeStage(current.stage === 'countdown' ? current.countdownReturn : 'paused')
    setMessage(reason)
    void releaseAwake()
  }, [changeStage, counter])

  useEffect(() => {
    mounted.current = true
    const tick = window.setInterval(() => {
      const current = runtime.current
      const now = performance.now()
      const hasFreshPose = now - current.lastFrameAt < LOST_TRACKING_MS && current.assessment !== null
      setFresh(hasFreshPose)
      if (current.stage === 'countdown') {
        if (document.hidden) {
          pause('Preparation paused while this tab was away. Tap Start or Resume when you return.')
        } else {
          const remaining = COUNTDOWN_MS - (now - current.countdownAt)
          setCountdown(Math.max(1, Math.ceil(remaining / 1000)))
          if (remaining <= 0) {
            current.hasStarted = true
            current.activeAt = now
            counter.discardPartial()
            changeStage('active')
            setMessage('')
          }
        }
      }
      // Losing the body must not send the user back to the phone. Reset the
      // unfinished movement, keep the set running, and reacquire automatically.
      if (current.stage === 'active' && !hasFreshPose) counter.discardPartial()
      if (current.stage === 'active' || current.stage === 'paused') setSeconds((current.activeMs + (current.activeAt === null ? 0 : now - current.activeAt)) / 1000)
    }, 100)
    const visibility = () => { if (document.hidden) pause('Paused while this tab was away. Tap Resume first, then get into position.') }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', visibility)
      counter.discardPartial()
      releaseCamera()
      latest.current.onActiveChange(false)
      void releaseAwake()
    }
  }, [changeStage, counter, pause, releaseCamera])

  const handleFrame = useCallback((frame: PoseFrame | null, session: number) => {
    if (!mounted.current || session !== cameraSession.current) return
    const current = runtime.current
    if (!frame) {
      current.assessment = null
      counter.discardPartial()
      setAssessment(null)
      setLandmarks([])
      return
    }
    if (!Number.isFinite(frame.timestamp) || frame.timestamp <= current.lastTimestamp) return
    current.lastTimestamp = frame.timestamp
    const frameAge = performance.now() - frame.timestamp
    if (frameAge > LOST_TRACKING_MS || frameAge < -50) {
      current.assessment = null
      counter.discardPartial()
      setAssessment(null)
      setLandmarks([])
      return
    }
    const ratio = video.current && video.current.videoWidth > 0 && video.current.videoHeight > 0 ? video.current.videoWidth / video.current.videoHeight : 4 / 3
    const next = assessPushupForm(frame.landmarks, ratio, current.variant)
    current.assessment = next
    current.lastFrameAt = frame.timestamp
    setFresh(true)
    setAspectRatio(ratio)
    setAssessment(next)
    setLandmarks(frame.landmarks)
    if (document.hidden) return
    if (current.stage === 'active') {
      const counted = counter.update(next, frame.timestamp)
      setCounts({ reps: counter.count, rejected: counter.rejected, feedback: counter.lastFeedback })
      if (counted) {
        haptic(latest.current.settings.haptics)
        try { audio.play('score', getTheme(latest.current.settings.theme), latest.current.settings.sound) } catch { /* Audio support does not affect form checks. */ }
      }
    }
  }, [audio, counter])

  const startCamera = async () => {
    if (runtime.current.stage === 'loading') return
    try { audio.unlock() } catch { /* A camera set still works without Web Audio. */ }
    releaseCamera()
    const session = cameraSession.current
    runtime.current.lastTimestamp = -Infinity
    setError('')
    setAssessment(null)
    setLandmarks([])
    setMessage('')
    changeStage('loading')
    const onError = (failure: Error) => {
      if (!mounted.current || session !== cameraSession.current) return
      pause('Camera tracking stopped.')
      releaseCamera()
      setAssessment(null)
      setLandmarks([])
      setError(failure.message.replace(/,?\s*or use keyboard mode\.?/gi, '.').replace(/,?\s*or switch to keyboard mode\.?/gi, '.'))
      changeStage('error')
    }
    try {
      const tracker = latest.current.poseSourceFactory?.(onError) ?? new MediaPipePoseSource({ mode: 'form', onError })
      source.current = tracker
      const camera = await createCameraStream()
      if (!mounted.current || session !== cameraSession.current) {
        camera.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = camera
      if (!video.current) throw new Error('The camera preview could not open. Please retry.')
      video.current.srcObject = camera
      await tracker.start(video.current, (frame) => handleFrame(frame, session))
      if (!mounted.current || session !== cameraSession.current) return
      changeStage(runtime.current.hasStarted ? 'paused' : 'ready')
      setMessage(runtime.current.hasStarted ? 'Camera reconnected. Tap Resume first, then get into position.' : '')
    } catch (failure) {
      if (!mounted.current || session !== cameraSession.current) return
      releaseCamera()
      setError(failure instanceof Error ? failure.message.replace(/,?\s*or use keyboard mode\.?/gi, '.').replace(/,?\s*or switch to keyboard mode\.?/gi, '.') : 'Camera access failed. Check browser permissions, then retry.')
      changeStage('error')
    }
  }

  const beginCountdown = () => {
    const current = runtime.current
    if (!['ready', 'paused'].includes(current.stage) || !source.current || !stream.current) return
    current.countdownReturn = current.hasStarted ? 'paused' : 'ready'
    if (!current.hasStarted) {
      counter.reset()
      current.activeMs = 0
      current.finished = false
      current.saved = false
      current.theme = latest.current.settings.theme
      current.difficulty = latest.current.settings.difficulty
      setCounts({ reps: 0, rejected: 0, feedback: counter.lastFeedback })
      setSeconds(0)
    }
    counter.discardPartial()
    current.countdownAt = performance.now()
    setCountdown(COUNTDOWN_MS / 1000)
    setMessage('Get into position. Posture checks begin after the countdown. Need longer? The set will wait for you.')
    changeStage('countdown')
    void keepAwake()
  }

  const persistSummary = async (set: WorkoutSet) => {
    const current = runtime.current
    if (current.saving || current.saved) return
    current.saving = true
    if (mounted.current) setSaveStatus('saving')
    try {
      await saveSet(set)
      current.saved = true
      latest.current.onSaved(set)
      if (mounted.current) setSaveStatus('saved')
    } catch {
      if (mounted.current) setSaveStatus('failed')
      latest.current.onNotice('This form set could not be saved in this browser. Keep this summary open and retry saving.')
    } finally { current.saving = false }
  }

  const finishSet = () => {
    const current = runtime.current
    if (!current.hasStarted || current.finished) return
    current.finished = true
    if (current.activeAt !== null) current.activeMs += performance.now() - current.activeAt
    current.activeAt = null
    counter.discardPartial()
    const result: WorkoutSet = { id: crypto.randomUUID(), date: Date.now(), reps: counter.count, pipes: 0, seconds: Math.round(current.activeMs / 1000), theme: current.theme, difficulty: current.difficulty, mode: 'camera', formChecked: true, variant: current.variant, formRejected: counter.rejected }
    setSummary(result)
    setAssessment(null)
    setLandmarks([])
    releaseCamera()
    void releaseAwake()
    changeStage('result')
    void persistSummary(result)
  }

  const stopBeforeSet = () => {
    releaseCamera()
    counter.discardPartial()
    setAssessment(null)
    setLandmarks([])
    setError('')
    setMessage('')
    void releaseAwake()
    changeStage('intro')
  }

  const resetSet = () => {
    if (runtime.current.saving) return
    counter.reset()
    const current = runtime.current
    current.hasStarted = false
    current.finished = false
    current.saved = false
    current.activeAt = null
    current.activeMs = 0
    current.assessment = null
    setSummary(null)
    setAssessment(null)
    setLandmarks([])
    setCounts({ reps: 0, rejected: 0, feedback: counter.lastFeedback })
    setSeconds(0)
    setError('')
    setMessage('')
    changeStage('intro')
  }

  const changeVariant = (next: FormVariant) => {
    runtime.current.variant = next
    runtime.current.assessment = null
    counter.reset()
    setAssessment(null)
    setVariant(next)
  }

  const cameraOn = ['ready', 'countdown', 'active', 'paused'].includes(stage)
  const liveAssessment = fresh ? assessment : null
  const lockedVariant = ['loading', 'countdown', 'active', 'paused'].includes(stage) || runtime.current.hasStarted
  const alignmentLabel = !liveAssessment?.trackable ? 'Not visible' : ({ aligned: 'Aligned', 'hips-raised': 'Hips raised', 'hips-sagging': 'Hips low', unknown: 'Not visible' })[liveAssessment.alignment]
  const visibleJoints = variant === 'knees' ? 'shoulder, elbow, wrist, hip, and knee' : 'shoulder, elbow, wrist, hip, knee, and ankle'
  const cue = message || (cameraOn ? liveAssessment?.cue || (stage === 'active' ? `Set is running. Show your ${visibleJoints} from the side. Tracking will pick up automatically; start with straight arms at the top.` : 'Tap Start form set first. You have 8 seconds to get into position, and more time if you need it.') : 'Set the camera beside you, with your whole body in view.')

  return <section className="panel form-panel" data-stage={stage} aria-labelledby="form-title">
    <div className="section-head form-heading"><div><h2 className="panel-title" id="form-title">Check your form.</h2><p className="subtitle">Side-view cues. Every full movement gets a closer look.</p></div><span className="form-local"><Icon name="shield" size={16} /> On your device</span></div>
    <p className="form-experimental">Experimental form cues. Side-view estimates; not a safety assessment.</p>
    {stage === 'result' && summary ? <div className="form-result">
      <Icon name="check" size={36} /><h3>Set complete.</h3><p>{summary.variant === 'knees' ? 'Knee push-ups' : 'Standard push-ups'} · {timeLabel(summary.seconds)} active time</p>
      <div className="form-result-count"><strong>{summary.reps}</strong><span>reps meeting checks</span></div>
      <div className="form-result-detail"><span><strong>{summary.formRejected ?? 0}</strong> full attempts not meeting checks</span><span>Partial or hidden movements are not counted.</span></div>
      <p className="form-save-status" role="status">{saveStatus === 'saved' ? 'Saved to your workout history.' : saveStatus === 'failed' ? 'Not saved yet. Retry to keep this set.' : 'Saving your set…'}</p>
      <div className="form-actions">{saveStatus === 'failed' && <button className="button primary" type="button" onClick={() => void persistSummary(summary)}>Retry saving</button>}<button className={`button ${saveStatus === 'failed' ? 'secondary' : 'primary'}`} type="button" disabled={saveStatus === 'saving'} onClick={resetSet}>New form set <Icon name="arrow" /></button></div>
    </div> : <div className="form-layout">
      <div className="form-instructions">
        <h3>A different camera angle.</h3><p>Form checks need a whole-body side view. The arcade’s front-facing nose tracker cannot check your form.</p>
        <ol className="form-setup-steps"><li>Prop your phone beside you. Keep it steady and leave room for your whole body.</li><li>Start the camera, then tap Start form set. You do not need to be in position yet.</li><li>Use the 8-second countdown to get into position. Straighten your arms at the top. Posture checks begin afterward and wait if you need longer.</li></ol>
        <fieldset className="form-variants" disabled={lockedVariant}><legend>Push-up variation</legend><label><input type="radio" name="form-variant" value="standard" checked={variant === 'standard'} onChange={() => changeVariant('standard')} /><span>Standard<small>Support through your feet</small></span></label><label><input type="radio" name="form-variant" value="knees" checked={variant === 'knees'} onChange={() => changeVariant('knees')} /><span>Knees<small>Support through your knees</small></span></label></fieldset>
        <div className="form-count-rule"><strong>What gets counted?</strong><p>A visible top–bottom–top cycle with enough elbow bend and body alignment. Pause or tracking loss resets an unfinished movement.</p></div>
        {error && <div className="form-error" role="alert"><strong>Camera unavailable</strong><p>{error}</p><p>Form checks require a camera. Change its browser permission or close another app using it, then retry.</p></div>}
        <div className="form-actions">
          {(stage === 'intro' || stage === 'error') && <button className="button primary" type="button" onClick={() => void startCamera()}><Icon name="camera" />{stage === 'error' ? 'Retry camera' : 'Start camera'}</button>}
          {stage === 'loading' && <button className="button secondary" type="button" onClick={stopBeforeSet}>Cancel camera setup</button>}
          {(stage === 'ready' || stage === 'paused') && <button className="button primary" type="button" onClick={beginCountdown}><Icon name="play" />{stage === 'paused' ? 'Resume form set' : 'Start form set'}</button>}
          {stage === 'active' && <button className="button secondary" type="button" onClick={() => pause('Set paused. Tap Resume first, then use the countdown to get into position.')}><Icon name="pause" />Pause</button>}
          {stage === 'countdown' && <button className="button secondary" type="button" onClick={() => pause('Countdown cancelled. Tap Start or Resume whenever you are ready.')}>Cancel countdown</button>}
          {stage === 'ready' && <button className="text-button" type="button" onClick={stopBeforeSet}>Stop camera</button>}
          {runtime.current.hasStarted && <button className="button secondary" type="button" onClick={finishSet}>End form set</button>}
        </div>
        {(stage === 'ready' || stage === 'paused') && <p className="form-start-note">Tap first, get into position afterward. The 8-second countdown runs even while you are outside the frame.</p>}
        <p className="form-private-note"><Icon name="shield" size={15} />No video or joint coordinates are saved. History stores counts and set details.</p>
      </div>
      <div className="form-monitor">
        <div className="form-camera-top"><span>{stage === 'active' ? 'FORM SET LIVE' : stage === 'countdown' ? 'GET INTO POSITION' : stage === 'paused' ? 'SET PAUSED' : stage === 'loading' ? 'OPENING CAMERA' : cameraOn ? 'READY TO START' : 'SIDE-VIEW SETUP'}</span><span>{timeLabel(seconds)}</span></div>
        <div className={`form-camera-frame ${cameraOn ? 'camera-on' : ''}`} style={{ aspectRatio }}>
          <video ref={video} className="form-video" autoPlay muted playsInline aria-label="Live side-view camera. Video stays on this device." />
          {(!cameraOn || !liveAssessment?.trackable) && <FitGuide />}
          {cameraOn && <JointOverlay landmarks={landmarks} assessment={liveAssessment} />}
          {stage === 'loading' && <div className="form-camera-overlay" role="status"><Icon name="camera" size={30} /><strong>Opening camera…</strong><span>Loading the pose model on your device.</span></div>}
          {stage === 'countdown' && <div className="form-camera-overlay form-countdown" role="status"><strong>{countdown}</strong><span>Get into position.<br />Posture checks start after the countdown.</span></div>}
          {stage === 'paused' && <span className="form-paused-label">PAUSED</span>}
          <span className="form-camera-caption">{cameraOn ? liveAssessment?.trackable ? `${liveAssessment.side === 'left' ? 'Left' : 'Right'} side tracked` : 'Looking for your side view' : 'Side-view framing guide'}</span>
        </div>
        <div className="form-cue" role="status"><Icon name={liveAssessment?.trackable && liveAssessment.alignment === 'aligned' ? 'check' : 'camera'} size={20} /><p>{cue}</p></div>
        <div className="form-measures"><div><span>ELBOW ANGLE</span><strong>{liveAssessment?.trackable && liveAssessment.elbowAngle !== null ? `${Math.round(liveAssessment.elbowAngle)}°` : '—'}</strong></div><div><span>BODY LINE</span><strong>{alignmentLabel}</strong></div></div>
        <div className="form-rep-counts"><div><output aria-label="Reps meeting checks" aria-live="polite">{counts.reps}</output><span>reps meeting checks</span></div><div><output aria-label="Full attempts not meeting checks" aria-live="polite">{counts.rejected}</output><span>full attempts not meeting checks</span></div></div>
        {runtime.current.hasStarted && <p className="form-last-feedback" aria-live="polite">{counts.feedback}</p>}
      </div>
    </div>}
  </section>
}
