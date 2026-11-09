import type { BackgroundMode, Settings } from '../lib/storage'
import { themes, type Scene } from '../themes/themes'
import Icon from './Icon'

interface SettingsPanelProps {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  photoUrl: string
  pickPhoto: (file: File | undefined) => void
  removePhoto: () => void
  canInstall: boolean
  install: () => void
}

const backgrounds: { id: BackgroundMode; name: string; detail: string }[] = [
  { id: 'scene', name: 'Pixel scene', detail: 'Original retro scenery' },
  { id: 'camera', name: 'Live camera', detail: 'Your workout, in view' },
  { id: 'blurred', name: 'Blurred camera', detail: 'A softer live backdrop' },
  { id: 'photo', name: 'Your photo', detail: 'Pick an image below' },
  { id: 'solid', name: 'Solid color', detail: 'Keep your focus clear' },
]

const scenes: { id: Scene; name: string }[] = [
  { id: 'gym', name: 'Neon gym' },
  { id: 'arcade', name: 'Midnight arcade' },
  { id: 'sunset', name: 'Synth sunset' },
  { id: 'city', name: 'Pixel city' },
  { id: 'space', name: 'Star field' },
]

export default function SettingsPanel({ settings, updateSettings, photoUrl, pickPhoto, removePhoto, canInstall, install }: SettingsPanelProps) {
  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="section-head">
        <div>
          <h2 id="settings-title" className="panel-title">Your arcade.</h2>
          <p className="subtitle">Pick your look. Keep your rhythm.</p>
        </div>
        <span className="save-status">Local settings</span>
      </div>

      <section className="settings-section" aria-labelledby="themes-title">
        <div className="setting-heading"><h3 id="themes-title">Theme</h3><span>12 ways to play</span></div>
        <div className="theme-grid" role="group" aria-labelledby="themes-title">
          {themes.map((theme) => (
            <button
              className={`theme-option ${settings.theme === theme.id ? 'selected' : ''}`}
              key={theme.id}
              type="button"
              aria-pressed={settings.theme === theme.id}
              onClick={() => updateSettings({ theme: theme.id, scene: theme.scene })}
            >
              <span className="theme-swatch" aria-hidden="true" style={{ backgroundColor: theme.colors.background }}>
                <span style={{ backgroundColor: theme.colors.accent }} />
                <span style={{ backgroundColor: theme.colors.secondary }} />
                <span style={{ backgroundColor: theme.colors.pipe }} />
                <span className="theme-selected-mark">{settings.theme === theme.id && <Icon name="check" size={17} />}</span>
              </span>
              <span className="theme-name">{theme.name}</span>
              <span className="theme-description">{theme.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="background-title">
        <div className="setting-heading"><h3 id="background-title">Background</h3><span>Your view, your choice</span></div>
        <div className="background-grid" role="group" aria-labelledby="background-title">
          {backgrounds.map((background) => (
            <button
              className={`background-option ${settings.background === background.id ? 'selected' : ''}`}
              key={background.id}
              type="button"
              aria-pressed={settings.background === background.id}
              onClick={() => updateSettings({ background: background.id })}
            >
              <span className={`background-symbol background-symbol-${background.id}`} aria-hidden="true" />
              <strong>{background.name}</strong>
              <span>{background.detail}</span>
            </button>
          ))}
        </div>
        <div className="background-controls">
          {settings.background === 'scene' && (
            <label className="field">Pixel scene
              <select value={settings.scene} onChange={(event) => updateSettings({ scene: event.target.value as Scene })}>
                {scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
              </select>
            </label>
          )}
          {settings.background === 'solid' && (
            <label className="field color-field">Background color
              <span className="color-control"><input type="color" value={settings.solid} onChange={(event) => updateSettings({ solid: event.target.value })} /><span>{settings.solid.toUpperCase()}</span></span>
            </label>
          )}
          {settings.background === 'photo' && (
            <div className="photo-controls">
              {photoUrl && <img className="photo-preview" src={photoUrl} alt="Your saved game background" />}
              <label className="field photo-picker">{photoUrl ? 'Replace background photo' : 'Choose a background photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                  pickPhoto(event.target.files?.[0])
                  event.target.value = ''
                }} />
              </label>
              {photoUrl && <button type="button" className="button secondary small" onClick={removePhoto}>Remove photo</button>}
              <p className="section-note">PNG, JPEG, or WebP. Your image stays in this browser.</p>
            </div>
          )}
          {(settings.background === 'camera' || settings.background === 'blurred') && <p className="inline-note">Start a camera set to use this background. Practice uses a solid backdrop.</p>}
          {(settings.background === 'blurred' || settings.background === 'photo') && (
            <label className="range-field"><span className="range-label">{settings.background === 'photo' ? 'Photo blur' : 'Camera blur'} <output>{settings.blur}px</output></span>
              <input type="range" min="0" max="16" step="1" value={settings.blur} onChange={(event) => updateSettings({ blur: Number(event.target.value) })} />
            </label>
          )}
          {settings.background !== 'scene' && (
            <label className="range-field"><span className="range-label">Background dim <output>{settings.dim}%</output></span>
              <input type="range" min="0" max="100" step="5" value={settings.dim} onChange={(event) => updateSettings({ dim: Number(event.target.value) })} />
            </label>
          )}
          <label className="range-field"><span className="range-label">CRT scanlines <output>{settings.crt}%</output></span>
            <input type="range" min="0" max="100" step="5" value={settings.crt} onChange={(event) => updateSettings({ crt: Number(event.target.value) })} />
          </label>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="play-settings-title">
        <div className="setting-heading"><h3 id="play-settings-title">Play & comfort</h3><span>Find your pace</span></div>
        <label className="field difficulty-field">Difficulty
          <select value={settings.difficulty} onChange={(event) => updateSettings({ difficulty: event.target.value as Settings['difficulty'] })}>
            <option value="easy">Easy — wider gaps, slower pipes</option>
            <option value="normal">Normal — a steady challenge</option>
            <option value="hard">Hard — faster pipes, tighter gaps</option>
          </select>
        </label>
        <p className="section-note">Difficulty applies to the next set.</p>
        <div className="toggle-list">
          {([
            ['sound', 'Arcade sounds', 'Short chiptune cues for flaps and scores.'],
            ['haptics', 'Haptic feedback', 'A small buzz on supported devices.'],
            ['highContrast', 'High contrast', 'Stronger text and obstacle edges.'],
            ['reducedMotion', 'Reduced motion', 'Keep scenery and decorative effects still.'],
          ] as const).map(([key, label, detail]) => (
            <label className="toggle-row" key={key}>
              <span className="toggle-copy"><strong>{label}</strong><span>{detail}</span></span>
              <input className="switch-input" type="checkbox" checked={settings[key]} onChange={(event) => updateSettings({ [key]: event.target.checked })} />
              <span className="switch" aria-hidden="true" />
            </label>
          ))}
        </div>
      </section>

      <div className="settings-footer">
        <div className="privacy-note"><strong>Private by design.</strong><p>Video stays on your device. Workout history and photos are saved in this browser. Clearing browser data removes them.</p></div>
        <div className="install-note"><strong>Your pocket arcade.</strong>
          {canInstall ? <button type="button" className="button secondary small" onClick={install}>Install Drop & Flap</button> : <p>Use your browser’s Install app option. On iPhone: Share, then Add to Home Screen.</p>}
        </div>
      </div>
    </section>
  )
}
