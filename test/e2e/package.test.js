const test = require('tap').test
const path = require('path')
const fs = require('fs')
const os = require('os')
const execFileSync = require('child_process').execFileSync
const vm = require('vm')

const root = path.join(__dirname, '..', '..')
const cli = path.join(root, 'bin', 'qrcode')

function run (args, input) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [cli].concat(args), { input: input || '', encoding: 'utf8', stdio: 'pipe' }) }
  } catch (e) {
    return { code: e.status, out: e.stdout + e.stderr }
  }
}

test('cli - help, version and validation', function (t) {
  t.match(run(['-h']).out, /^Usage: qrcode \[options\] <input string>/)
  t.equal(run(['--version']).out.trim(), require('../../package.json').version)
  const bad = run(['-e', 'X', 'hi'])
  t.equal(bad.code, 1)
  t.match(bad.out, /Argument: e, Given: "X", Choices: "L", "M", "Q", "H"/)
  t.match(run(['-t', 'svg', 'hi']).out, /Missing dependent arguments:\n t -> output/)
  t.match(run(['-w', '10', '-s', '2', '-o', 'x.png', 'hi']).out, /Arguments w and scale are mutually exclusive/)
  t.match(run(['--small', '-t', 'svg', '-o', 'a.svg', 'hi']).out, /Arguments small and type are mutually exclusive/)
  t.equal(run([]).code, 1)
  t.end()
})

test('cli - renders to terminal and files', function (t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qrcode-cli-'))
  const svg = path.join(dir, 'out.svg')
  t.match(run(['-o', svg, '-d', 'F00', 'hello']).out, /saved qrcode to: /)
  t.match(fs.readFileSync(svg, 'utf8'), /stroke="#ff0000"/i)
  t.ok(run(['hello']).out.length > 100)
  t.ok(run(['-t', 'utf8', '-o', path.join(dir, 'o.txt')], 'from stdin').code === 0)
  fs.rmSync(dir, { recursive: true })
  t.end()
})

test('package - exports keep deep imports working', function (t) {
  const pkg = require('../../package.json')
  const map = pkg.exports
  t.equal(map['.'].default, './lib/index.js')
  t.equal(map['./lib/*'], './lib/*.js')
  t.equal(map['./lib/*.js'], './lib/*.js')
  t.ok(pkg.files.indexOf('index.d.ts') !== -1)
  t.end()
})

test('build - browser bundles load and render', { skip: !fs.existsSync(path.join(root, 'build', 'qrcode.min.js')) && 'run npm run build first' }, function (t) {
  const sandbox = { window: {}, document: undefined, TextEncoder: TextEncoder }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(path.join(root, 'build', 'qrcode.min.js'), 'utf8'), sandbox)
  t.equal(typeof sandbox.QRCode.toString, 'function')
  vm.runInContext(fs.readFileSync(path.join(root, 'build', 'qrcode.tosjis.min.js'), 'utf8'), sandbox)
  t.equal(typeof sandbox.QRCode.toSJIS, 'function')

  return new Promise(function (resolve) {
    sandbox.QRCode.toString('bundle', function (err, svg) {
      t.error(err)
      t.match(svg, /^<svg/)
      resolve()
    })
  }).then(function () {
    return import(path.join(root, 'build', 'qrcode.esm.js')).then(function (mod) {
      t.equal(typeof mod.default.toString, 'function')
      t.equal(typeof mod.toDataURL, 'function')
      return mod.toString('esm')
    }).then(function (svg) {
      t.match(svg, /^<svg/)
    })
  })
})
