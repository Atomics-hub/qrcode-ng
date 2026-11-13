const test = require('tap').test
const fs = require('fs')
const os = require('os')
const path = require('path')
const PNG = require('pngjs').PNG
const jsQR = require('jsqr')
const QRCode = require('lib')
const PngRenderer = require('lib/renderer/png')
const Logo = require('lib/renderer/logo')

function makeLogo (w, h) {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) {
    const x = i % w
    const y = Math.floor(i / w)
    png.data.set((x + y) % 7 < 3 ? [0, 0, 0, 255] : [30, 90, 200, 255], i * 4)
  }
  return png
}

function decode (png) {
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  return result && result.data
}

const LOGO = makeLogo(80, 60)
const RAW = { data: LOGO.data, width: LOGO.width, height: LOGO.height }
const LOGO_BYTES = PNG.sync.write(LOGO)

test('logo - codes still decode across versions, sizes and margins', function (t) {
  const text = 'https://example.com/a/b?c=d'
  let checked = 0
  for (const version of [4, 7, 15, 25]) {
    for (const size of [0.1, 0.2, 0.3]) {
      for (const margin of [0, 1, 2]) {
        const data = QRCode.create(text, { version: version, logo: RAW })
        const png = PngRenderer.render(data, { logo: { src: RAW, size: size, margin: margin }, scale: 4 })
        t.equal(decode(png), text, 'v' + version + ' size ' + size + ' margin ' + margin)
        checked++
      }
    }
  }
  t.equal(checked, 36)
  t.end()
})

test('logo - defaults error correction to H, keeps an explicit level', function (t) {
  t.equal(QRCode.create('hello', { logo: RAW }).errorCorrectionLevel.bit, 2)
  t.equal(QRCode.create('hello', { logo: RAW, errorCorrectionLevel: 'L' }).errorCorrectionLevel.bit, 1)
  t.equal(QRCode.create('hello', {}).errorCorrectionLevel.bit, 0)
  t.end()
})

test('logo - box is centered with the same parity as the symbol', function (t) {
  for (const qrSize of [21, 25, 57, 177]) {
    for (const size of [0.05, 0.1, 0.2, 0.3]) {
      const box = Logo.getBox(qrSize, { size: size, margin: 1 })
      t.equal(box.side % 2, qrSize % 2)
      t.equal(box.start * 2 + box.side, qrSize)
      t.ok(box.inner >= 1)
    }
  }
  t.end()
})

test('logo - option validation', function (t) {
  t.throws(function () { Logo.getOptions({ src: '' }) }, /needs a src/)
  t.throws(function () { Logo.getOptions({ src: RAW, size: 0 }) }, /size/)
  t.equal(Logo.getOptions(false), null)
  t.equal(Logo.getOptions(undefined), null)
  t.end()
})

test('logo - oversized logo rejects', function (t) {
  return QRCode.toString('a', { type: 'svg', logo: { src: RAW, size: 0.31 } }).then(
    function () { t.fail('should reject') },
    function (err) { t.match(err.message, /at most 0.3/) }
  )
})

test('logo - sniffs image types', function (t) {
  t.equal(Logo.sniffType(LOGO_BYTES), 'image/png')
  t.equal(Logo.sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  t.equal(Logo.sniffType(Buffer.from('GIF89a')), 'image/gif')
  t.equal(Logo.sniffType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp')
  t.equal(Logo.sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml')
  t.equal(Logo.sniffType(Buffer.from('hello')), null)
  t.end()
})

test('logo - PNG output from a file path, bytes and pixels', function (t) {
  const file = path.join(os.tmpdir(), 'qrcode-logo-test-' + process.pid + '.png')
  fs.writeFileSync(file, LOGO_BYTES)
  const text = 'logo test'

  return Promise.all([file, LOGO_BYTES, RAW].map(function (src) {
    return QRCode.toBuffer(text, { logo: src, scale: 4 }).then(function (buf) {
      t.equal(decode(PNG.sync.read(buf)), text)
    })
  })).then(function () {
    fs.unlinkSync(file)
  })
})

test('logo - PNG output rejects other formats with a clear error', function (t) {
  return QRCode.toBuffer('x', { logo: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) }).then(
    function () { t.fail('should reject') },
    function (err) { t.match(err.message, /PNG logos only/) }
  )
})

test('logo - missing file path rejects', function (t) {
  return QRCode.toDataURL('x', { logo: '/no/such/logo.png' }).then(
    function () { t.fail('should reject') },
    function (err) { t.equal(err.code, 'ENOENT') }
  )
})

test('logo - SVG output embeds the image', function (t) {
  return Promise.all([
    QRCode.toString('svg logo', { type: 'svg', logo: { src: LOGO_BYTES, size: 0.25 } }),
    QRCode.toString('svg logo', { type: 'svg', logo: 'https://example.com/logo.svg?a=1&b="2"' }),
    QRCode.toString('svg logo', { type: 'svg', logo: { src: 'data:image/png;base64,AAAA', background: false } })
  ]).then(function (out) {
    t.match(out[0], /<image href="data:image\/png;base64,[A-Za-z0-9+/=]+" x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" preserveAspectRatio="xMidYMid meet"\/><\/svg>/)
    t.match(out[0], /<path fill="#ffffff" d="M\d+ \d+h\d+v\d+h-\d+z"\/><image/)
    t.match(out[1], /href="https:\/\/example.com\/logo.svg\?a=1&amp;b=&quot;2&quot;"/)
    t.notMatch(out[2], /h-\d+z"\/>/)
    t.match(out[0], /h-\d+z"\/>/)
  })
})

test('logo - background color option', function (t) {
  const data = QRCode.create('bg', { logo: RAW })
  const png = PngRenderer.render(data, { logo: { src: RAW, background: '#ff0000' }, scale: 1, margin: 0 })
  const box = Logo.getBox(data.modules.size, { size: 0.2, margin: 1 })
  const p = (box.start * png.width + box.start) * 4
  t.same(Array.from(png.data.slice(p, p + 4)), [255, 0, 0, 255])
  t.end()
})

test('logo - terminal and utf8 output ignore the logo', function (t) {
  return QRCode.toString('term', { type: 'utf8', logo: RAW }).then(function (out) {
    t.ok(out.length > 0)
  })
})

test('logo - canvas output draws a loaded image centered', function (t) {
  const CanvasRenderer = require('lib/renderer/canvas')
  const calls = []
  const ctx = {
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) } },
    putImageData: function () {},
    clearRect: function () {},
    drawImage: function () { calls.push([].slice.call(arguments, 1)) }
  }
  const canvas = { getContext: function () { return ctx } }
  const image = { naturalWidth: 200, naturalHeight: 100 }
  const data = QRCode.create('canvas logo', { logo: image })
  CanvasRenderer.render(data, canvas, { logo: image, scale: 2 })
  t.equal(calls.length, 1)
  const size = data.modules.size
  const box = Logo.getBox(size, { size: 0.2, margin: 1 })
  const at = (4 + box.innerStart) * 2
  const side = box.inner * 2
  t.same(calls[0], [at, at + side / 4, side, side / 2])

  t.throws(function () {
    CanvasRenderer.render(data, canvas, { logo: 'https://example.com/a.png' })
  }, /loaded image/)
  t.end()
})
