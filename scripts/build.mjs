import * as esbuild from 'esbuild'

const shared = { bundle: true, target: 'es2017', platform: 'browser', legalComments: 'none', logLevel: 'warning' }

async function main () {
  for (const minify of [false, true]) {
    const suffix = minify ? '.min.js' : '.js'
    await esbuild.build({ ...shared, minify, entryPoints: ['lib/browser.js'], format: 'iife', globalName: 'QRCode', outfile: 'build/qrcode' + suffix })
    await esbuild.build({ ...shared, minify, entryPoints: ['helper/to-sjis-browser.js'], format: 'iife', outfile: 'build/qrcode.tosjis' + suffix })
    await esbuild.build({ ...shared, minify, entryPoints: ['scripts/esm-browser-entry.mjs'], format: 'esm', outfile: 'build/qrcode.esm' + suffix })
  }
}

main().catch(function (err) {
  console.error(err)
  process.exit(1)
})
