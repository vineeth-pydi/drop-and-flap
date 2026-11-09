export type Scene = 'gym' | 'arcade' | 'sunset' | 'city' | 'space'

export interface Theme {
  id: string
  name: string
  description: string
  colors: {
    background: string
    panel: string
    text: string
    muted: string
    accent: string
    secondary: string
    border: string
    pipe: string
    sky: string
  }
  font: string
  scene: Scene
  sound: { flap: number; score: number; crash: number }
  character: string
}

const pixelFont = '"Press Start 2P", "Courier New", monospace'
const terminalFont = '"VT323", "Courier New", monospace'
const computerFont = '"Courier New", Courier, monospace'

export const themes: Theme[] = [
  {
    id: 'neon', name: 'Neon Gym', description: 'Lime power. Midnight training.',
    colors: { background: '#080C14', panel: '#111B29', text: '#F1F6E9', muted: '#9AAABB', accent: '#CCFF5F', secondary: '#FF71BA', border: '#2B3B4E', pipe: '#537342', sky: '#0C1624' },
    font: pixelFont, scene: 'gym', sound: { flap: 340, score: 880, crash: 80 }, character: 'Sweatband bird',
  },
  {
    id: 'arcade', name: 'Arcade Cabinet', description: 'Bright cabinets. Big high scores.',
    colors: { background: '#090A0F', panel: '#151820', text: '#FFF8DF', muted: '#B5BDCC', accent: '#FFCB50', secondary: '#64E4F5', border: '#464B5B', pipe: '#AD4155', sky: '#101622' },
    font: pixelFont, scene: 'arcade', sound: { flap: 420, score: 1047, crash: 110 }, character: 'Arcade athlete',
  },
  {
    id: 'gameboy', name: 'Game Boy', description: 'Four shades. One more round.',
    colors: { background: '#182B15', panel: '#253F21', text: '#DCE9AD', muted: '#A6BC81', accent: '#DCE9AD', secondary: '#AACB74', border: '#6C8750', pipe: '#83A35B', sky: '#314E2A' },
    font: pixelFont, scene: 'city', sound: { flap: 294, score: 784, crash: 98 }, character: 'Pocket athlete',
  },
  {
    id: 'synthwave', name: 'Synthwave Neon', description: 'Sunset grids. Endless energy.',
    colors: { background: '#160E29', panel: '#24153A', text: '#FFF2FD', muted: '#C4A8D4', accent: '#FF82C9', secondary: '#68E5FF', border: '#604279', pipe: '#6851A8', sky: '#28103D' },
    font: pixelFont, scene: 'sunset', sound: { flap: 392, score: 988, crash: 87 }, character: 'Sunset runner',
  },
  {
    id: 'phosphor', name: 'Green Phosphor', description: 'A terminal for your next personal best.',
    colors: { background: '#06140A', panel: '#0B2111', text: '#BDFCC4', muted: '#8EC695', accent: '#88FF9A', secondary: '#D0FFD6', border: '#315D39', pipe: '#357348', sky: '#0C2313' },
    font: terminalFont, scene: 'space', sound: { flap: 523, score: 1319, crash: 65 }, character: 'Phosphor pilot',
  },
  {
    id: 'amber', name: 'Amber Terminal', description: 'Warm pixels. Focused reps.',
    colors: { background: '#191007', panel: '#2A1D10', text: '#FFE0AB', muted: '#D0AF7A', accent: '#FFC066', secondary: '#FFE6B8', border: '#664824', pipe: '#8C602D', sky: '#2C1D0B' },
    font: terminalFont, scene: 'space', sound: { flap: 440, score: 1175, crash: 73 }, character: 'Amber pilot',
  },
  {
    id: 'console', name: '8-Bit Console', description: 'Crisp colors. Weekend cartridge energy.',
    colors: { background: '#1B232D', panel: '#303944', text: '#F4F3EB', muted: '#B3BDC5', accent: '#F37172', secondary: '#9FD4F7', border: '#66717D', pipe: '#707B85', sky: '#2B465F' },
    font: pixelFont, scene: 'city', sound: { flap: 349, score: 932, crash: 104 }, character: 'Cartridge champion',
  },
  {
    id: 'vaporwave', name: 'Vaporwave', description: 'Pastel skies. Fresh-air flaps.',
    colors: { background: '#24162F', panel: '#38263F', text: '#FFF2F8', muted: '#D6B7D8', accent: '#F7A8DB', secondary: '#92EADD', border: '#735777', pipe: '#9E689F', sky: '#49335C' },
    font: terminalFont, scene: 'sunset', sound: { flap: 330, score: 831, crash: 82 }, character: 'Pastel flapper',
  },
  {
    id: 'computer', name: 'Home Computer', description: 'Cobalt keys. A familiar glow.',
    colors: { background: '#10275B', panel: '#1D3970', text: '#F6F1DA', muted: '#BBC7E8', accent: '#F2D78B', secondary: '#B2D5FF', border: '#5777AB', pipe: '#617EB1', sky: '#294D86' },
    font: computerFont, scene: 'city', sound: { flap: 494, score: 1109, crash: 123 }, character: 'Keyboard bird',
  },
  {
    id: 'vhs', name: 'VHS Tape', description: 'Tape grain. Late-night momentum.',
    colors: { background: '#151B1D', panel: '#253134', text: '#F4F2E8', muted: '#C2B6AC', accent: '#F0A16E', secondary: '#79CAC5', border: '#53666A', pipe: '#597673', sky: '#222F32' },
    font: terminalFont, scene: 'arcade', sound: { flap: 311, score: 740, crash: 92 }, character: 'Track-suit bird',
  },
  {
    id: 'woodgrain', name: 'Woodgrain Console', description: 'Warm walnut. Old-school effort.',
    colors: { background: '#24170F', panel: '#38261A', text: '#FFF0D5', muted: '#D0B497', accent: '#EEC07A', secondary: '#ABDBBD', border: '#77533B', pipe: '#8D633C', sky: '#3E2B1D' },
    font: computerFont, scene: 'gym', sound: { flap: 262, score: 659, crash: 70 }, character: 'Vintage lifter',
  },
  {
    id: 'mac', name: 'One-Bit Mac', description: 'Monochrome pixels. A clean start.',
    colors: { background: '#171717', panel: '#272727', text: '#FAFAFA', muted: '#BEBEBE', accent: '#FFFFFF', secondary: '#C9C9C9', border: '#8F8F8F', pipe: '#B0B0B0', sky: '#353535' },
    font: computerFont, scene: 'city', sound: { flap: 587, score: 1397, crash: 147 }, character: 'Monochrome mover',
  },
]

export function getTheme(id: string): Theme {
  return themes.find((theme) => theme.id === id) ?? themes[0]
}
