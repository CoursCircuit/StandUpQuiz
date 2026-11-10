/* Build in a clean local directory: cloud/Finder metadata can invalidate signing. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const root = path.resolve(__dirname, '..');
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    proc.on('error', reject); proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)));
  });
}
async function cleanFinderMetadata(bundle) {
  // A cloud-synced destination can add empty FinderInfo to bundles during copying.
  // Remove only signing-incompatible metadata from this generated app.
  const { stdout } = await promisify(execFile)('/usr/bin/xattr', ['-lr', bundle], { maxBuffer: 8000000 });
  for (const name of ['com.apple.FinderInfo', 'com.apple.ResourceFork']) {
    if (stdout.includes(`: ${name}:`)) await run('/usr/bin/xattr', ['-rd', name, bundle]);
  }
}
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'standup-build-'));
  const project = path.join(temporary, 'project'); const electronDist = path.join(temporary, 'electron');
  await fs.mkdir(project); await fs.mkdir(electronDist);
  const packageJSON = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const files = ['main.js','preload.js','projection-preload.js','storage.js','core.js','view.js','script.js','projection.js','index.html','projection.html','style.css','LICENSE.txt'];
  for (const name of files) await fs.copyFile(path.join(root, name), path.join(project, name));
  await fs.cp(path.join(root, 'assets'), path.join(project, 'assets'), { recursive: true });
  await fs.cp(path.join(root, 'node_modules/electron/dist'), electronDist, { recursive: true, verbatimSymlinks: true });
  packageJSON.build.directories.output = path.join(temporary, 'output');
  packageJSON.build.electronDist = electronDist;
  packageJSON.build.electronVersion = packageJSON.devDependencies.electron;
  packageJSON.devDependencies = {};
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify(packageJSON, null, 2));
  const args = [path.join(root, 'node_modules/electron-builder/out/cli/cli.js'), '--projectDir', project, '--mac', '--arm64'];
  if (process.argv.includes('--dir')) args.push('--dir');
  await run(process.execPath, args, { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_CACHE: path.join(os.tmpdir(), 'standup-builder-cache') } });
  const bundle = path.join(temporary, 'output/mac-arm64/StandUp Quiz.app');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  const target = path.join(root, 'release'); await fs.mkdir(target, { recursive: true });
  for (const name of await fs.readdir(path.join(temporary, 'output'))) {
    if (/\.(dmg|zip|blockmap)$/.test(name)) await fs.copyFile(path.join(temporary, 'output', name), path.join(target, name));
  }
  const installedBundle = path.join(target, 'mac-arm64', 'StandUp Quiz.app');
  await fs.rm(installedBundle, { recursive: true, force: true });
  await fs.cp(bundle, installedBundle, { recursive: true, verbatimSymlinks: true });
  await cleanFinderMetadata(installedBundle);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', installedBundle]);
  if (!process.argv.includes('--dir')) {
    await run('/usr/bin/hdiutil', ['verify', path.join(target, `StandUp Quiz-${packageJSON.version}-arm64.dmg`)]);
    await run('/usr/bin/unzip', ['-tq', path.join(target, `StandUp Quiz-${packageJSON.version}-arm64.zip`)]);
  }
  await fs.writeFile(path.join(target, 'latest-build.json'), JSON.stringify({ version: packageJSON.version, bundle: installedBundle, builtAt: new Date().toISOString() }, null, 2));
  console.log(`\nVerified local app: ${installedBundle}\nRelease archives: ${target}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
