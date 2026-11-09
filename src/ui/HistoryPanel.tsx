import type { WorkoutSet } from '../lib/storage'
import { getTheme } from '../themes/themes'
import Icon, { PixelBird } from './Icon'

interface HistoryPanelProps {
  history: WorkoutSet[]
  onPlay: () => void
  onClear: () => void
}

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function HistoryPanel({ history, onPlay, onClear }: HistoryPanelProps) {
  const cameraSets = history.filter((set) => set.mode === 'camera')
  const totalReps = cameraSets.reduce((sum, set) => sum + set.reps, 0)
  const bestSet = cameraSets.reduce((best, set) => Math.max(best, set.reps), 0)
  return (
    <section className="panel history-panel" aria-labelledby="history-title">
      <div className="section-head">
        <div><h2 className="panel-title" id="history-title">Your progress.</h2><p className="subtitle">Small sets. Stronger habits.</p></div>
        {history.length > 0 && <button className="button ghost small" type="button" onClick={onClear}>Clear history</button>}
      </div>
      <div className="history-summary" aria-label="Camera workout totals">
        <div className="stat-box"><span className="stat-label">TOTAL REPS</span><strong className="stat-value">{totalReps}</strong><span>Camera sets only</span></div>
        <div className="stat-box"><span className="stat-label">BEST SET</span><strong className="stat-value">{bestSet}</strong><span>Completed reps</span></div>
        <div className="stat-box"><span className="stat-label">WORKOUT SETS</span><strong className="stat-value">{cameraSets.length}</strong><span>Camera sets only</span></div>
      </div>
      {history.length === 0 ? (
        <div className="empty-state">
          <PixelBird className="empty-pixel-art" size={78} />
          <h3>Your first rep starts here.</h3>
          <p>Finish a set to save your reps, score, and time. Practice rounds appear separately.</p>
          <button className="button primary" type="button" onClick={onPlay}>Start a set <Icon name="arrow" /></button>
        </div>
      ) : (
        <>
          <div className="setting-heading history-list-heading"><h3>Recent sets</h3><span>{history.length} saved {history.length === 1 ? 'round' : 'rounds'}</span></div>
          <ol className="history-list">
            {history.map((set) => (
              <li className="history-row" key={set.id}>
                <span className={`record-mode ${set.mode}`} aria-label={set.formChecked ? 'Form check set' : set.mode === 'camera' ? 'Camera workout' : 'Practice round'}>{set.formChecked ? 'FORM' : set.mode === 'camera' ? 'SET' : 'PRACTICE'}</span>
                <div className="history-detail"><time className="history-date" dateTime={new Date(set.date).toISOString()}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(set.date)}<span>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(set.date)}</span></time><span className="history-meta">{getTheme(set.theme).name} · {set.formChecked ? (set.variant==='knees'?'Knee pushups':'Standard pushups') + ' · ' + (set.formRejected||0) + ' full attempts outside checks' : set.difficulty.charAt(0).toUpperCase() + set.difficulty.slice(1)}</span></div>
                <div className="history-values">
                  <div className="history-value"><strong>{set.mode === 'camera' ? set.reps : '—'}</strong><span>REPS</span></div>
                  <div className="history-value"><strong>{set.pipes}</strong><span>PIPES</span></div>
                  <div className="history-value"><strong>{duration(set.seconds)}</strong><span>TIME</span></div>
                </div>
              </li>
            ))}
          </ol>
          <p className="section-note">Practice scores count pipes only. Only camera workouts contribute to your rep totals.</p>
        </>
      )}
      <p className="history-privacy">Saved locally in this browser. Clearing browser data removes your history.</p>
    </section>
  )
}
