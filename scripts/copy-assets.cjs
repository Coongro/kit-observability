/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs/promises');
const path = require('path');

// Copia assets estáticos del plugin (CSS + fonts) desde el source tree
// a dist/assets/, donde el manifest los expone vía assets.styles.
//
// JetBrains Mono se sirve como asset local (sin CDN) por requisito del
// spec COONG-118; los woff2 viven commiteados en assets/fonts/. Roboto y
// Noto Serif JP siguen vía jsdelivr en el CSS, matcheando el design
// system core de Coongro.
async function main() {
  const root = path.join(__dirname, '..');
  const destAssets = path.join(root, 'dist', 'assets');
  const destFonts = path.join(destAssets, 'fonts');

  await fs.mkdir(destFonts, { recursive: true });

  await Promise.all([
    fs.copyFile(
      path.join(root, 'src', 'styles', 'observability.css'),
      path.join(destAssets, 'observability.css')
    ),
    fs.cp(path.join(root, 'assets', 'fonts'), destFonts, { recursive: true }),
  ]);
}

main().catch((error) => {
  console.error('Failed to copy plugin assets', error);
  process.exit(1);
});
