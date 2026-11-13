/* global btoa */
const MAX_SIZE = 0.3

function isBytes (value) {
  return typeof Uint8Array !== 'undefined' && value instanceof Uint8Array
}

function isRaw (value) {
  return value && typeof value === 'object' && !isBytes(value) &&
    value.data && typeof value.width === 'number' && typeof value.height === 'number'
}

exports.isBytes = isBytes
exports.isRaw = isRaw

exports.sniffType = function sniffType (bytes) {
  const b = bytes
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  const head = String.fromCharCode.apply(null, Array.prototype.slice.call(b, 0, 256)).trim().toLowerCase()
  if (head.indexOf('<svg') !== -1 || head.indexOf('<?xml') === 0) return 'image/svg+xml'
  return null
}

function toBase64 (bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

exports.getOptions = function getOptions (logo, lightColor, hex2rgba) {
  if (logo === undefined || logo === null || logo === false) return null

  const opts = typeof logo === 'object' && !isBytes(logo) && !isRaw(logo) && 'src' in logo
    ? logo
    : { src: logo }

  if (opts.src === undefined || opts.src === null || opts.src === '') {
    throw new Error('Logo needs a src')
  }

  const size = opts.size === undefined ? 0.2 : Number(opts.size)
  if (!(size > 0) || size > MAX_SIZE) {
    throw new Error('Logo size must be greater than 0 and at most ' + MAX_SIZE + ' (fraction of the QR code width)')
  }

  const margin = opts.margin === undefined ? 1 : Math.max(0, Math.floor(Number(opts.margin)))

  return {
    src: opts.src,
    size: size,
    margin: margin,
    background: opts.background === false ? null : (opts.background ? hex2rgba(opts.background) : lightColor)
  }
}

// Area cleared for the logo, in modules from the top-left of the symbol (quiet zone excluded).
// Its side has the same parity as the symbol so it sits exactly in the middle.
exports.getBox = function getBox (qrSize, logo) {
  let side = Math.round(qrSize * logo.size)
  if (side % 2 !== qrSize % 2) side++
  side = Math.max(side, 1 + 2 * logo.margin)
  const start = (qrSize - side) / 2
  const inner = side - 2 * logo.margin
  return { start: start, side: side, innerStart: start + logo.margin, inner: inner }
}

// Fits a w x h image inside a square of `side`, keeping its aspect ratio.
exports.fit = function fit (w, h, side) {
  const ratio = Math.min(side / w, side / h)
  const fw = w * ratio
  const fh = h * ratio
  return { x: (side - fw) / 2, y: (side - fh) / 2, width: fw, height: fh }
}

function sample (raw, x, y, out) {
  const w = raw.width
  const h = raw.height
  const data = raw.data
  const fx = Math.min(Math.max(x - 0.5, 0), w - 1)
  const fy = Math.min(Math.max(y - 0.5, 0), h - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const tx = fx - x0
  const ty = fy - y0
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * w + x0) * 4 + c] * (1 - tx) + data[(y0 * w + x1) * 4 + c] * tx
    const b = data[(y1 * w + x0) * 4 + c] * (1 - tx) + data[(y1 * w + x1) * 4 + c] * tx
    out[c] = a * (1 - ty) + b * ty
  }
}

// Draws the logo background and, when the logo is raw RGBA, the logo itself into imgData.
exports.drawRaster = function drawRaster (imgData, symbolSize, qrSize, scale, scaledMargin, logo) {
  const box = exports.getBox(qrSize, logo)

  if (logo.background) {
    const bg = logo.background
    for (let i = 0; i < symbolSize; i++) {
      const row = Math.floor((i - scaledMargin) / scale)
      if (i < scaledMargin || row < box.start || row >= box.start + box.side) continue
      for (let j = 0; j < symbolSize; j++) {
        const col = Math.floor((j - scaledMargin) / scale)
        if (j < scaledMargin || col < box.start || col >= box.start + box.side) continue
        const p = (i * symbolSize + j) * 4
        imgData[p] = bg.r
        imgData[p + 1] = bg.g
        imgData[p + 2] = bg.b
        imgData[p + 3] = bg.a
      }
    }
  }

  if (!isRaw(logo.src)) return

  const raw = logo.src
  const side = box.inner * scale
  const place = exports.fit(raw.width, raw.height, side)
  const left = scaledMargin + box.innerStart * scale + place.x
  const top = scaledMargin + box.innerStart * scale + place.y
  const px = [0, 0, 0, 0]

  const iStart = Math.max(0, Math.floor(top))
  const iEnd = Math.min(symbolSize, Math.ceil(top + place.height))
  const jStart = Math.max(0, Math.floor(left))
  const jEnd = Math.min(symbolSize, Math.ceil(left + place.width))

  for (let i = iStart; i < iEnd; i++) {
    const y = (i + 0.5 - top) / place.height * raw.height
    if (y < 0 || y > raw.height) continue
    for (let j = jStart; j < jEnd; j++) {
      const x = (j + 0.5 - left) / place.width * raw.width
      if (x < 0 || x > raw.width) continue
      sample(raw, x, y, px)
      const p = (i * symbolSize + j) * 4
      const a = px[3] / 255
      const da = imgData[p + 3] / 255
      const outA = a + da * (1 - a)
      if (outA === 0) continue
      imgData[p] = Math.round((px[0] * a + imgData[p] * da * (1 - a)) / outA)
      imgData[p + 1] = Math.round((px[1] * a + imgData[p + 1] * da * (1 - a)) / outA)
      imgData[p + 2] = Math.round((px[2] * a + imgData[p + 2] * da * (1 - a)) / outA)
      imgData[p + 3] = Math.round(outA * 255)
    }
  }
}

exports.getHref = function getHref (src) {
  if (typeof src === 'string') return src
  if (isBytes(src)) {
    const type = exports.sniffType(src)
    if (!type) throw new Error('Unknown logo image format (expected PNG, JPEG, GIF, WebP or SVG bytes)')
    return 'data:' + type + ';base64,' + toBase64(src)
  }
  throw new Error('SVG output needs the logo as a URL, data URI or image bytes')
}

function escapeAttr (value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function num (n) {
  return +n.toFixed(4)
}

// SVG elements for the logo, in viewBox units (one unit per module).
exports.svg = function svg (qrSize, margin, logo, colorAttrib) {
  const box = exports.getBox(qrSize, logo)
  let out = ''
  if (logo.background) {
    out += '<path ' + colorAttrib(logo.background, 'fill') + ' d="M' + (margin + box.start) + ' ' + (margin + box.start) +
      'h' + box.side + 'v' + box.side + 'h-' + box.side + 'z"/>'
  }
  const at = margin + box.innerStart
  out += '<image href="' + escapeAttr(exports.getHref(logo.src)) + '" x="' + num(at) + '" y="' + num(at) +
    '" width="' + num(box.inner) + '" height="' + num(box.inner) + '" preserveAspectRatio="xMidYMid meet"/>'
  return out
}

exports.drawCanvas = function drawCanvas (ctx, qrSize, scale, scaledMargin, logo) {
  if (isRaw(logo.src)) return
  if (typeof logo.src === 'string' || isBytes(logo.src)) {
    throw new Error('Canvas output needs the logo as a loaded image (HTMLImageElement, ImageBitmap or canvas)')
  }
  const box = exports.getBox(qrSize, logo)
  const w = logo.src.naturalWidth || logo.src.width
  const h = logo.src.naturalHeight || logo.src.height
  const side = box.inner * scale
  const place = exports.fit(w, h, side)
  const at = scaledMargin + box.innerStart * scale
  ctx.drawImage(logo.src, at + place.x, at + place.y, place.width, place.height)
}
