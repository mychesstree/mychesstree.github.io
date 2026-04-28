const fs = require('fs');
const path = require('path');

// Run from project root
const baseDir = process.cwd();
const files = ['ecoA.json', 'ecoB.json', 'ecoC.json', 'ecoD.json', 'ecoE.json'];
const combined = {};

function getCanonicalFen(fen) {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

files.forEach(file => {
  const filePath = path.join(baseDir, 'src/data/eco', file);
  console.log('Processing ' + filePath);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    Object.keys(data).forEach(fen => {
      const canonical = getCanonicalFen(fen);
      combined[canonical] = data[fen].name;
    });
  } else {
    console.warn('File not found: ' + filePath);
  }
});

const outPath = path.join(baseDir, 'src/data/eco_combined.json');
fs.writeFileSync(outPath, JSON.stringify(combined));

console.log('Combined ECO database created with ' + Object.keys(combined).length + ' positions at ' + outPath);
