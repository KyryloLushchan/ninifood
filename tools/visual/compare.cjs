// Попиксельное сравнение двух папок со скриншотами (допуск 0). Код выхода 1, если есть отличия или недостающие файлы.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const [A, B] = process.argv.slice(2).map((p) => path.resolve(p));
(async () => {
  const names = fs.readdirSync(A).filter((f) => f.endsWith('.png')).sort();
  let same = 0; const diffs = [];
  for (const n of names) {
    const fb = path.join(B, n);
    if (!fs.existsSync(fb)) { diffs.push(`${n}: нет в «после»`); continue; }
    const [a, b] = await Promise.all([sharp(path.join(A, n)).raw().toBuffer({ resolveWithObject: true }), sharp(fb).raw().toBuffer({ resolveWithObject: true })]);
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) { diffs.push(`${n}: размер ${a.info.width}×${a.info.height} → ${b.info.width}×${b.info.height}`); continue; }
    let cnt = 0; const ab = a.data, bb = b.data, ch = a.info.channels;
    for (let i = 0; i < ab.length; i += ch) if (ab[i] !== bb[i] || ab[i + 1] !== bb[i + 1] || ab[i + 2] !== bb[i + 2]) cnt++;
    cnt ? diffs.push(`${n}: ${cnt} px отличаются`) : same++;
  }
  console.log(`сравнено: ${names.length}, идентичны: ${same}, отличий: ${diffs.length}`);
  diffs.forEach((d) => console.log('  ≠', d));
  process.exit(diffs.length ? 1 : 0);
})();
