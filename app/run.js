// Starts the app with `npm start`. Clears ELECTRON_RUN_AS_NODE, which VS Code sets in some
// terminals and which would make Electron run as plain Node instead of opening a window.
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron'); // path to the Electron binary when required from Node

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, [path.join(__dirname, '..'), ...process.argv.slice(2)], { stdio: 'inherit', env })
  .on('exit', code => process.exit(code ?? 0));
