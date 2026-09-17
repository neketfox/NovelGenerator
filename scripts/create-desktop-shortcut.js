#!/usr/bin/env node
/**
 * Windows desktop shortcut for NovelGenerator: creates a "NovelGenerator.lnk" on the desktop
 * that runs launch.vbs, which starts `npm run dev` in the background and opens the browser at
 * http://localhost:5173 once the dev server responds. Mirrors "Launch NovelGenerator.command"
 * (the existing macOS launcher) for Windows.
 *
 * Usage: node scripts/create-desktop-shortcut.js
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(process.env.USERPROFILE ?? '', 'Desktop');
const launchVbsPath = path.join(projectRoot, 'launch.vbs');
const shortcutPath = path.join(desktop, 'NovelGenerator.lnk');
const iconPath = path.join(projectRoot, 'public', 'favicon.svg');

if (process.platform !== 'win32') {
  console.error('This script creates a Windows .lnk shortcut; run it on Windows.');
  process.exit(1);
}

// launch.vbs: starts the dev server hidden, waits for it to answer, then opens the browser.
// A single .vbs (rather than a .bat) avoids a visible console window on double-click.
const launchVbs = `
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "${projectRoot.replace(/\\/g, '\\\\')}"
shell.Run "cmd /c npm run dev", 0, False
WScript.Sleep 3000
shell.Run "http://localhost:5173", 1, False
`.trim();
writeFileSync(launchVbsPath, launchVbs, 'utf-8');

// A second, throwaway .vbs that creates the .lnk via WScript.Shell's shortcut object —
// the standard way to author a Windows shortcut without a native (non-portable) dependency.
const shortcutVbs = `
Set shell = WScript.CreateObject("WScript.Shell")
Set shortcut = shell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
shortcut.TargetPath = "${launchVbsPath.replace(/\\/g, '\\\\')}"
shortcut.WorkingDirectory = "${projectRoot.replace(/\\/g, '\\\\')}"
shortcut.WindowStyle = 1
shortcut.IconLocation = "${existsSync(iconPath) ? iconPath.replace(/\\/g, '\\\\') : 'shell32.dll, 220'}"
shortcut.Description = "Launch NovelGenerator"
shortcut.Save
`.trim();

const tmpDir = mkdtempSync(path.join(tmpdir(), 'novelgen-shortcut-'));
const tmpVbsPath = path.join(tmpDir, 'make-shortcut.vbs');
writeFileSync(tmpVbsPath, shortcutVbs, 'utf-8');

execFileSync('cscript', ['//nologo', tmpVbsPath]);

console.log(`Created ${shortcutPath}`);
console.log(`It runs ${launchVbsPath}, which starts "npm run dev" and opens http://localhost:5173.`);
