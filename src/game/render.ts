import { GROUND_Y, PIPE_WIDTH, WORLD_HEIGHT, WORLD_WIDTH, type GameState } from './engine'
import type { Scene, Theme } from '../themes/themes'

export type { Scene } from '../themes/themes'

const WIDTH = WORLD_WIDTH
const HEIGHT = WORLD_HEIGHT
const GROUND = GROUND_Y
const PREVIEW_PIPES = [
  { x: 260, gapY: 330, gapSize: 180 },
  { x: 450, gapY: 400, gapSize: 200 },
]

export type RenderOptions = {
  scene: Scene
  reducedMotion: boolean
  transparent: boolean
  preview?: boolean
  time?: number
  highContrast?: boolean
}

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
}

function line(ctx: CanvasRenderingContext2D, color: string, x1: number, y1: number, x2: number, y2: number, width = 1) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5)
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5)
  ctx.stroke()
}

function tint(hex: string, amount: number): string {
  const color = hex.replace('#', '')
  const destination = amount < 0 ? 0 : 255
  const ratio = Math.abs(amount)
  const rgb = [0, 2, 4].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - ratio) + destination * ratio))
  return `rgb(${rgb.join(',')})`
}

function alpha(ctx: CanvasRenderingContext2D, opacity: number, draw: () => void) {
  ctx.save()
  ctx.globalAlpha = opacity
  draw()
  ctx.restore()
}

function stars(ctx: CanvasRenderingContext2D, theme: Theme, time: number, dense = false) {
  const count = dense ? 54 : 18
  for (let i = 0; i < count; i++) {
    const x = ((i * 131 + 39 - time * 1.8) % WIDTH + WIDTH) % WIDTH
    const y = 31 + ((i * 79 + 11) % 305)
    alpha(ctx, i % 3 === 0 ? 0.52 : 0.24, () => {
      rect(ctx, i % 4 === 0 ? theme.colors.secondary : theme.colors.text, x, y, i % 5 === 0 ? 3 : 2, 2)
      if (i % 11 === 0) rect(ctx, theme.colors.text, x + 1, y - 2, 1, 6)
    })
  }
}

function skyline(ctx: CanvasRenderingContext2D, theme: Theme, time: number, baseY: number, scale: number, windows: boolean) {
  const shift = (time * (scale < 1 ? 2.4 : 4.5)) % 560
  const heights = [66, 110, 88, 155, 84, 120, 69, 141, 95, 62, 126, 91]
  for (let cycle = -1; cycle < 2; cycle++) {
    for (let i = 0; i < heights.length; i++) {
      const x = (i * 47 + cycle * 564 - shift)
      const height = heights[i] * scale
      const width = 29 + (i % 3) * 6
      rect(ctx, tint(theme.colors.sky, scale < 1 ? 0.1 : -0.23), x, baseY - height, width, height)
      if (i % 4 === 0) rect(ctx, tint(theme.colors.sky, -0.16), x + 12, baseY - height - 10, 4, 10)
      if (windows) {
        alpha(ctx, 0.22, () => {
          for (let row = 0; row < Math.floor(height / 18) - 1; row++) {
            for (let col = 0; col < 3; col++) {
              if ((row + col + i) % 3 !== 0) rect(ctx, theme.colors.secondary, x + 6 + col * 8, baseY - height + 11 + row * 17, 3, 4)
            }
          }
        })
      }
    }
  }
}

function grid(ctx: CanvasRenderingContext2D, theme: Theme, horizon: number, time: number, opacity = 0.17) {
  rect(ctx, tint(theme.colors.background, -0.08), 0, horizon, WIDTH, GROUND - horizon)
  alpha(ctx, opacity, () => {
    for (let endpoint = -480; endpoint <= 960; endpoint += 96) {
      line(ctx, theme.colors.secondary, WIDTH / 2, horizon, endpoint, GROUND)
    }
    const span = GROUND - horizon
    const drift = (time * 0.085) % 1
    for (let i = 0; i < 10; i++) {
      const depth = (i + drift) / 10
      const y = horizon + depth * depth * span
      line(ctx, theme.colors.secondary, 0, y, WIDTH, y)
    }
  })
  alpha(ctx, 0.45, () => rect(ctx, theme.colors.secondary, 0, horizon, WIDTH, 2))
}

function dumbbell(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, scale = 1) {
  const dark = tint(theme.colors.secondary, -0.58)
  rect(ctx, dark, x + 6 * scale, y + 7 * scale, 28 * scale, 4 * scale)
  for (const position of [0, 28]) {
    rect(ctx, dark, x + position * scale, y + 3 * scale, 12 * scale, 12 * scale)
    rect(ctx, tint(theme.colors.secondary, -0.34), x + (position + 2) * scale, y, 8 * scale, 18 * scale)
    rect(ctx, tint(theme.colors.secondary, -0.14), x + (position + 3) * scale, y + 2 * scale, 2 * scale, 14 * scale)
  }
}

function gym(ctx: CanvasRenderingContext2D, theme: Theme, time: number) {
  const c = theme.colors
  rect(ctx, c.sky, 0, 0, WIDTH, GROUND)
  // Broad architectural shapes keep the obstacle path easy to read.
  const glow = ctx.createLinearGradient(0, 0, 0, 430)
  glow.addColorStop(0, tint(c.sky, -0.25))
  glow.addColorStop(1, tint(c.sky, 0.025))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, 430)
  const offset = time * 2 % 256
  for (let i = -1; i < 3; i++) {
    const x = 27 + i * 256 - offset
    rect(ctx, tint(c.border, -0.6), x - 4, 78, 214, 238)
    rect(ctx, tint(c.sky, -0.22), x, 82, 206, 230)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, 82, 206, 230)
    ctx.clip()
    skyline(ctx, theme, time, 312, 0.77, true)
    alpha(ctx, 0.12, () => rect(ctx, c.secondary, x + 4, 88, 198, 4))
    ctx.restore()
    for (let j = 1; j < 4; j++) rect(ctx, tint(c.border, -0.52), x + j * 51, 82, 4, 230)
    rect(ctx, tint(c.border, -0.52), x, 197, 206, 5)
  }
  alpha(ctx, 0.12, () => {
    rect(ctx, c.secondary, 0, 48, WIDTH, 3)
    rect(ctx, c.secondary, 0, 52, WIDTH, 1)
  })
  rect(ctx, tint(c.sky, -0.28), 0, 319, WIDTH, 81)
  rect(ctx, tint(c.border, -0.4), 0, 331, WIDTH, 3)
  // Low silhouettes: weight rack, bench, and plates.
  const rackX = 344 - (time * 4 % 510)
  alpha(ctx, 0.58, () => {
    rect(ctx, tint(c.border, -0.3), rackX, 339, 108, 5)
    rect(ctx, tint(c.border, -0.3), rackX, 378, 108, 5)
    rect(ctx, tint(c.border, -0.3), rackX + 5, 343, 5, 56)
    rect(ctx, tint(c.border, -0.3), rackX + 98, 343, 5, 56)
    for (let i = 0; i < 3; i++) dumbbell(ctx, theme, rackX + 10 + i * 29, 356, 0.65)
    rect(ctx, tint(c.pipe, -0.43), 37, 371, 79, 8)
    rect(ctx, tint(c.border, -0.38), 48, 379, 5, 20)
    rect(ctx, tint(c.border, -0.38), 100, 379, 5, 20)
  })
  grid(ctx, theme, 400, time, 0.11)
}

function sunset(ctx: CanvasRenderingContext2D, theme: Theme, time: number) {
  const c = theme.colors
  const gradient = ctx.createLinearGradient(0, 0, 0, 410)
  gradient.addColorStop(0, tint(c.sky, -0.3))
  gradient.addColorStop(0.6, c.sky)
  gradient.addColorStop(1, tint(c.accent, -0.52))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, GROUND)
  stars(ctx, theme, time)
  // A stepped pixel sun, with dark gaps instead of a smooth circle.
  const sunX = 294
  const sunY = 198
  const widths = [42, 64, 82, 94, 104, 108, 108, 104, 94, 82, 64, 42]
  for (let row = 0; row < widths.length; row++) {
    const width = widths[row]
    const stripe = row > 5 ? 6 : 9
    rect(ctx, row < 5 ? tint(c.accent, 0.27) : c.accent, sunX - width / 2, sunY + row * 10, width, stripe)
  }
  skyline(ctx, theme, time * 0.6, 401, 0.76, false)
  alpha(ctx, 0.7, () => {
    const mountain = tint(c.sky, -0.36)
    for (let i = 0; i < 29; i++) {
      const h = 22 + Math.abs(Math.sin(i * 0.27)) * 60
      rect(ctx, mountain, i * 18, 407 - h, 20, h)
    }
  })
  grid(ctx, theme, 406, time, 0.2)
}

function city(ctx: CanvasRenderingContext2D, theme: Theme, time: number) {
  const c = theme.colors
  const gradient = ctx.createLinearGradient(0, 0, 0, GROUND)
  gradient.addColorStop(0, tint(c.sky, -0.18))
  gradient.addColorStop(1, tint(c.sky, 0.15))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, GROUND)
  alpha(ctx, 0.32, () => {
    rect(ctx, c.text, 345, 88, 34, 30)
    rect(ctx, c.text, 339, 94, 46, 18)
    rect(ctx, c.sky, 336, 85, 20, 26)
  })
  stars(ctx, theme, time)
  skyline(ctx, theme, time, 363, 0.67, true)
  skyline(ctx, theme, time, 418, 1.15, true)
  rect(ctx, tint(c.sky, -0.37), 0, 419, WIDTH, GROUND - 419)
  alpha(ctx, 0.11, () => {
    for (let i = -1; i < 12; i++) rect(ctx, c.secondary, i * 64 - time * 9 % 64, 485, 28, 3)
  })
  grid(ctx, theme, 420, time, theme.id === 'gameboy' ? 0.08 : 0.13)
}

function arcade(ctx: CanvasRenderingContext2D, theme: Theme, time: number) {
  const c = theme.colors
  rect(ctx, c.sky, 0, 0, WIDTH, GROUND)
  alpha(ctx, 0.15, () => {
    for (let i = 0; i < 5; i++) {
      rect(ctx, c.secondary, 34 + i * 107, 30, 3, 292)
      rect(ctx, c.accent, 37 + i * 107, 31, 1, 290)
    }
  })
  const shift = time * 4 % 154
  for (let i = -1; i < 4; i++) {
    const x = i * 154 + 20 - shift
    const cabinet = tint(c.panel, 0.025)
    rect(ctx, cabinet, x + 6, 177, 106, 220)
    rect(ctx, cabinet, x, 215, 118, 159)
    rect(ctx, tint(c.border, -0.18), x + 10, 181, 99, 22)
    alpha(ctx, 0.56, () => rect(ctx, i % 2 ? c.secondary : c.accent, x + 19, 188, 78, 6))
    rect(ctx, tint(c.background, -0.15), x + 17, 216, 86, 101)
    rect(ctx, tint(c.secondary, -0.75), x + 24, 224, 72, 82)
    alpha(ctx, 0.23, () => {
      for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
        rect(ctx, row % 2 ? c.accent : c.secondary, x + 31 + col * 12, 235 + row * 15, 7, 6)
      }
    })
    rect(ctx, tint(c.border, -0.3), x + 10, 325, 99, 11)
    rect(ctx, tint(c.secondary, -0.42), x + 37, 318, 4, 12)
    rect(ctx, c.secondary, x + 34, 316, 10, 4)
    rect(ctx, tint(c.accent, -0.25), x + 76, 324, 8, 4)
    rect(ctx, tint(c.background, -0.1), x + 47, 357, 22, 7)
  }
  grid(ctx, theme, 400, time, 0.15)
}

function space(ctx: CanvasRenderingContext2D, theme: Theme, time: number) {
  const c = theme.colors
  rect(ctx, tint(c.background, -0.08), 0, 0, WIDTH, GROUND)
  stars(ctx, theme, time, true)
  alpha(ctx, 0.12, () => {
    for (let i = 0; i < 14; i++) {
      const width = 90 - Math.abs(i - 7) * 7
      rect(ctx, c.secondary, 341 - width / 2, 100 + i * 7, width, 7)
    }
    rect(ctx, c.accent, 277, 141, 130, 3)
    rect(ctx, c.accent, 267, 145, 143, 2)
  })
  alpha(ctx, 0.28, () => {
    line(ctx, c.secondary, 23, 389, 60, 372)
    line(ctx, c.secondary, 60, 372, 98, 397)
    line(ctx, c.secondary, 98, 397, 180, 376)
    line(ctx, c.secondary, 180, 376, 264, 398)
    line(ctx, c.secondary, 264, 398, 354, 373)
    line(ctx, c.secondary, 354, 373, 430, 400)
    line(ctx, c.secondary, 430, 400, 480, 390)
  })
  grid(ctx, theme, 412, time, 0.16)
}

let oneBitPattern: CanvasPattern | null = null

function dither(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  if (!oneBitPattern) {
    const tile = document.createElement('canvas')
    tile.width = 4
    tile.height = 4
    const tileContext = tile.getContext('2d')
    if (tileContext) {
      tileContext.fillStyle = '#000000'
      tileContext.fillRect(0, 0, 4, 4)
      tileContext.fillStyle = '#FFFFFF'
      tileContext.fillRect(0, 0, 1, 1)
      tileContext.fillRect(2, 2, 1, 1)
      oneBitPattern = ctx.createPattern(tile, 'repeat')
    }
  }
  ctx.fillStyle = oneBitPattern ?? '#000000'
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
}

function oneBitScene(ctx: CanvasRenderingContext2D, scene: Scene, time: number) {
  const white = '#FFFFFF'
  const black = '#000000'
  rect(ctx, black, 0, 0, WIDTH, GROUND)
  for (let i = 0; i < 23; i++) {
    const x = ((i * 83 + 31 - time * 1.8) % WIDTH + WIDTH) % WIDTH
    rect(ctx, white, x, 33 + (i * 73) % 280, 2, 2)
  }
  if (scene === 'gym') {
    for (let i = -1; i < 3; i++) {
      const x = 30 + i * 232 - time * 2 % 232
      rect(ctx, white, x, 85, 190, 245)
      dither(ctx, x + 3, 88, 184, 239)
      rect(ctx, black, x + 62, 88, 3, 239)
      rect(ctx, black, x + 127, 88, 3, 239)
      rect(ctx, black, x + 3, 203, 184, 4)
    }
    rect(ctx, white, 39, 374, 92, 8)
    rect(ctx, white, 48, 382, 4, 24)
    rect(ctx, white, 117, 382, 4, 24)
  } else if (scene === 'arcade') {
    for (let i = -1; i < 4; i++) {
      const x = i * 146 + 18 - time * 4 % 146
      rect(ctx, white, x + 7, 186, 101, 214)
      rect(ctx, black, x + 10, 189, 95, 208)
      dither(ctx, x + 18, 224, 79, 87)
      rect(ctx, white, x + 18, 199, 79, 5)
      rect(ctx, white, x + 15, 329, 83, 6)
      rect(ctx, white, x + 35, 319, 4, 10)
      rect(ctx, white, x + 74, 323, 8, 4)
    }
  } else if (scene === 'sunset' || scene === 'space') {
    const widths = [34, 56, 72, 86, 96, 104, 104, 96, 86, 72, 56, 34]
    widths.forEach((width, row) => {
      if (scene === 'space') dither(ctx, 326 - width / 2, 145 + row * 8, width, 8)
      else rect(ctx, white, 290 - width / 2, 186 + row * 8, width, row > 5 ? 5 : 8)
    })
    for (let i = 0; i < 29; i++) {
      const h = 20 + Math.abs(Math.sin(i * 0.29)) * 62
      dither(ctx, i * 18, 410 - h, 18, h)
    }
  } else {
    for (let i = -1; i < 12; i++) {
      const x = i * 47 - time * 4 % 47
      const h = 68 + ((i + 12) * 31) % 105
      rect(ctx, white, x, 408 - h, 33, h)
      rect(ctx, black, x + 2, 410 - h, 29, h - 2)
      for (let row = 0; row < Math.floor(h / 20) - 1; row++) {
        for (let col = 0; col < 3; col++) rect(ctx, white, x + 5 + col * 9, 417 - h + row * 18, 3, 4)
      }
    }
  }
  rect(ctx, white, 0, 412, WIDTH, 1)
  for (let y = 430; y < GROUND; y += 42) rect(ctx, white, 0, y, WIDTH, 1)
  for (let endpoint = -480; endpoint <= 960; endpoint += 120) {
    for (let y = 413; y < GROUND; y += 3) {
      const x = WIDTH / 2 + (endpoint - WIDTH / 2) * (y - 412) / (GROUND - 412)
      rect(ctx, white, x, y, 2, 2)
    }
  }
}

function sceneTexture(ctx: CanvasRenderingContext2D, theme: Theme, time: number) {
  if (theme.id === 'woodgrain') {
    alpha(ctx, 0.045, () => {
      for (let i = 0; i < 22; i++) {
        const y = i * 31
        line(ctx, theme.colors.accent, 0, y, WIDTH, y + Math.sin(i) * 12)
        line(ctx, theme.colors.accent, 0, y + 5, WIDTH, y + 8)
      }
    })
  }
  if (['phosphor', 'amber', 'vhs', 'gameboy', 'mac'].includes(theme.id)) {
    alpha(ctx, theme.id === 'vhs' ? 0.1 : 0.055, () => {
      for (let y = 0; y < GROUND; y += 4) rect(ctx, '#000000', 0, y, WIDTH, 1)
    })
  }
  if (theme.id === 'vhs') {
    alpha(ctx, 0.08, () => {
      const y = 80 + Math.floor(time * 17) % 480
      rect(ctx, theme.colors.secondary, 0, y, WIDTH, 2)
      rect(ctx, theme.colors.accent, 0, y + 3, WIDTH, 1)
    })
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, height: number, top: boolean, highContrast: boolean) {
  if (height <= 0) return
  const c = theme.colors
  const capY = top ? y + height - 22 : y
  if (theme.id === 'mac') {
    rect(ctx, '#FFFFFF', x + 5, y, PIPE_WIDTH - 10, height)
    dither(ctx, x + 8, y, PIPE_WIDTH - 16, height)
    rect(ctx, '#FFFFFF', x, capY, PIPE_WIDTH, 22)
    rect(ctx, '#000000', x + 3, capY + 3, PIPE_WIDTH - 6, 16)
    rect(ctx, '#FFFFFF', x + 6, capY + 5, PIPE_WIDTH - 12, 3)
    return
  }
  const bodyColor = highContrast ? tint(c.pipe, 0.16) : c.pipe
  const edge = highContrast ? c.text : tint(c.pipe, -0.5)
  // Square bodies and visible caps match the collider exactly.
  rect(ctx, edge, x + 5, y, PIPE_WIDTH - 10, height)
  rect(ctx, bodyColor, x + 9, y, PIPE_WIDTH - 18, height)
  rect(ctx, tint(bodyColor, 0.18), x + 12, y, 7, height)
  rect(ctx, tint(bodyColor, -0.2), x + PIPE_WIDTH - 18, y, 9, height)
  rect(ctx, edge, x, capY, PIPE_WIDTH, 22)
  rect(ctx, bodyColor, x + 3, capY + 3, PIPE_WIDTH - 6, 15)
  rect(ctx, tint(bodyColor, 0.3), x + 6, capY + 3, PIPE_WIDTH - 12, 4)
  rect(ctx, tint(bodyColor, -0.22), x + 3, capY + 16, PIPE_WIDTH - 6, 3)
  if (theme.id === 'neon' || theme.id === 'woodgrain') {
    // Gym obstacles resemble stacked weight plates around a vertical bar.
    rect(ctx, tint(c.accent, -0.18), x + PIPE_WIDTH / 2 - 10, y, 20, height)
    rect(ctx, tint(c.accent, 0.13), x + PIPE_WIDTH / 2 - 8, y, 4, height)
    for (let py = y + 40; py < y + height - 24; py += 45) {
      rect(ctx, edge, x, py, PIPE_WIDTH, 14)
      rect(ctx, tint(bodyColor, 0.12), x + 5, py + 3, PIPE_WIDTH - 10, 5)
      rect(ctx, c.accent, x + 9, py + 4, 4, 3)
    }
    rect(ctx, c.accent, x + 7, capY + 7, 4, 7)
    rect(ctx, c.accent, x + PIPE_WIDTH - 11, capY + 7, 4, 7)
  } else if (theme.id === 'phosphor' || theme.id === 'amber') {
    alpha(ctx, 0.75, () => {
      line(ctx, c.accent, x + 5, y, x + 5, y + height)
      line(ctx, c.accent, x + PIPE_WIDTH - 6, y, x + PIPE_WIDTH - 6, y + height)
      for (let py = y + 20; py < y + height - 23; py += 21) line(ctx, c.accent, x + 7, py, x + 16, py)
    })
  } else if (['synthwave', 'vaporwave'].includes(theme.id)) {
    alpha(ctx, 0.6, () => {
      for (let py = y + 26; py < y + height - 24; py += 26) rect(ctx, c.secondary, x + 4, py, PIPE_WIDTH - 8, 2)
    })
    rect(ctx, c.secondary, x + 2, capY + 6, PIPE_WIDTH - 4, 2)
  } else if (theme.id === 'mac') {
    for (let py = y + 8; py < y + height - 24; py += 8) {
      for (let px = 12; px < PIPE_WIDTH - 10; px += 8) {
        alpha(ctx, 0.18, () => rect(ctx, c.text, x + px + (py % 16 ? 4 : 0), py, 2, 2))
      }
    }
  } else if (theme.id !== 'gameboy') {
    for (let py = y + 36; py < y + height - 24; py += 62) {
      rect(ctx, tint(bodyColor, -0.3), x + 9, py, 5, 5)
      rect(ctx, tint(bodyColor, 0.36), x + 10, py, 2, 2)
      rect(ctx, tint(bodyColor, -0.3), x + PIPE_WIDTH - 14, py, 5, 5)
      rect(ctx, tint(bodyColor, 0.36), x + PIPE_WIDTH - 13, py, 2, 2)
    }
  }
}

const BIRD = [
  '      OOOOO      ',
  '    OOBBBBBBOO   ',
  '   OBBBBBBBBBO  ',
  '  OBBBHHHHHHHHO ',
  ' OBBBBWWWWWWWBBO',
  ' OBBBBBBBBEEBBBO',
  'OBBBBBBBBBEWEBBO',
  'OBBBBDDBBBEEBBKK',
  'OBBBDDDDDBBBBBKK',
  'OBBBDDDDBBBBBBO ',
  ' OBBBBBBLLLLBO  ',
  '  OBBBBBLLLLBO  ',
  '   OOBBBBBBOO   ',
  '     OFFFFO     ',
  '     FF  FF     ',
]

/** Draw the original sweatband mascot; scale is the pixel size (2 gives a 32px bird). */
export function drawMascot(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, theme: Theme, phase = 0) {
  const monochrome = ['gameboy', 'mac', 'phosphor', 'amber'].includes(theme.id)
  const body = theme.colors.accent
  const colors: Record<string, string> = {
    O: tint(theme.colors.background, -0.45),
    B: body,
    D: tint(body, -0.24),
    L: tint(body, 0.33),
    H: monochrome ? tint(body, -0.35) : theme.colors.secondary,
    W: monochrome ? theme.colors.text : '#F7F6D8',
    E: tint(theme.colors.background, -0.5),
    K: monochrome ? tint(body, -0.13) : '#F8B667',
    F: monochrome ? tint(body, -0.32) : '#EFA06F',
  }
  if (theme.id === 'mac') {
    Object.assign(colors, { O: '#000000', B: '#FFFFFF', D: '#000000', L: '#FFFFFF', H: '#000000', W: '#FFFFFF', E: '#000000', K: '#FFFFFF', F: '#FFFFFF' })
  }
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  const left = -8 * scale
  const top = -7.5 * scale
  BIRD.forEach((row, rowIndex) => {
    [...row].forEach((pixel, columnIndex) => {
      if (colors[pixel]) rect(ctx, colors[pixel], left + columnIndex * scale, top + rowIndex * scale, scale, scale)
    })
  })
  // The wing changes by one pixel, never distracting from the collision silhouette.
  if (Math.sin(phase * 9) > 0) {
    rect(ctx, colors.D, left + 3 * scale, top + 7 * scale, 4 * scale, 2 * scale)
    rect(ctx, colors.L, left + 3 * scale, top + 7 * scale, scale, scale)
  }
  if (theme.id === 'console') {
    rect(ctx, theme.colors.secondary, left + 3 * scale, top + 10 * scale, 7 * scale, 2 * scale)
  } else if (theme.id === 'vhs') {
    rect(ctx, theme.colors.secondary, left + 2 * scale, top + 10 * scale, 9 * scale, 2 * scale)
    rect(ctx, colors.W, left + 4 * scale, top + 10 * scale, scale, scale)
  } else if (theme.id === 'computer' || theme.id === 'mac') {
    rect(ctx, colors.W, left + 9 * scale, top + 5 * scale, 5 * scale, scale)
    rect(ctx, colors.E, left + 9 * scale, top + 6 * scale, scale, 2 * scale)
  }
  ctx.restore()
}

function ground(ctx: CanvasRenderingContext2D, theme: Theme, time: number, transparent: boolean) {
  const c = theme.colors
  if (theme.id === 'mac') {
    rect(ctx, '#FFFFFF', 0, GROUND, WIDTH, HEIGHT - GROUND)
    dither(ctx, 0, GROUND + 5, WIDTH, HEIGHT - GROUND - 5)
    const offset = Math.floor(time * 55) % 32
    for (let x = -32; x < WIDTH + 32; x += 32) rect(ctx, '#FFFFFF', x - offset, GROUND + 12, 16, 3)
    return
  }
  rect(ctx, tint(c.background, -0.15), 0, GROUND, WIDTH, HEIGHT - GROUND)
  rect(ctx, c.border, 0, GROUND, WIDTH, 2)
  rect(ctx, c.accent, 0, GROUND + 3, WIDTH, 3)
  const offset = Math.floor(time * 55) % 32
  alpha(ctx, transparent ? 0.65 : 0.35, () => {
    for (let x = -32; x < WIDTH + 32; x += 32) {
      rect(ctx, c.accent, x - offset, GROUND + 9, 17, 3)
      rect(ctx, c.border, x - offset + 7, GROUND + 21, 17, 3)
    }
  })
}

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState, theme: Theme, options: RenderOptions) {
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const time = options.reducedMotion ? 0 : options.time ?? state.elapsed
  if (!options.transparent) {
    const scenes: Record<Scene, (ctx: CanvasRenderingContext2D, theme: Theme, time: number) => void> = { gym, arcade, sunset, city, space }
    if (theme.id === 'mac') oneBitScene(ctx, options.scene, time)
    else {
      scenes[options.scene](ctx, theme, time)
      sceneTexture(ctx, theme, time)
    }
  }
  const visiblePipes = options.preview ? PREVIEW_PIPES : state.pipes
  for (const pipe of visiblePipes) {
    const gapTop = pipe.gapY - pipe.gapSize / 2
    const gapBottom = pipe.gapY + pipe.gapSize / 2
    const pipeTop = options.preview ? 200 : 0
    drawPipe(ctx, theme, pipe.x, pipeTop, gapTop - pipeTop, true, !!options.highContrast || !!options.preview)
    drawPipe(ctx, theme, pipe.x, gapBottom, GROUND - gapBottom, false, !!options.highContrast || !!options.preview)
  }
  const birdX = options.preview ? 130 : state.bird.x
  const birdY = options.preview ? 300 : state.bird.y
  // Small, static pixel shadow makes the athlete visible against camera and photo modes.
  if (options.transparent || (options.highContrast && theme.id !== 'mac')) {
    alpha(ctx, 0.25, () => rect(ctx, '#000000', birdX - 21, birdY - 19, 43, 41))
  }
  ctx.save()
  ctx.translate(Math.round(birdX), Math.round(birdY))
  const rotation = theme.id === 'mac' || options.preview || state.status !== 'playing' ? 0 : Math.max(-0.28, Math.min(0.8, state.bird.vy / 1000))
  ctx.rotate(rotation)
  drawMascot(ctx, 0, 0, options.preview ? 3 : 2, theme, options.reducedMotion ? 0 : time)
  ctx.restore()
  ground(ctx, theme, time, options.transparent)
  ctx.restore()
}
