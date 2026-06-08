const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, '..', 'dist', 'nimako_pos', 'browser', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
fs.writeFileSync(indexPath, html.replace('<base href="/">', '<base href="./">'));
console.log('Updated Electron index base href to ./');
