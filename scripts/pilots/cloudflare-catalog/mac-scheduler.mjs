// LaunchAgent de usuario: ejecuta un tick sin shell, red pública local ni privilegios.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateCycleConfig } from './automatic-cycle.mjs';
export const CYCLE_AGENT_LABEL='ar.comparador.catalog-pilot';
function xml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
export function schedulerPlist(configPath,config,nodePath=process.execPath){
 validateCycleConfig(config);
 const script=resolve(dirname(fileURLToPath(import.meta.url)),'automatic-cycle.mjs');
 const directory=dirname(config.sqlite);
 return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
 <key>Label</key><string>${CYCLE_AGENT_LABEL}</string>
 <key>ProgramArguments</key><array>${[nodePath,script,'--tick',configPath].map(value=>'<string>'+xml(value)+'</string>').join('')}</array>
 <key>WorkingDirectory</key><string>${xml(resolve(dirname(script),'../../..'))}</string>
 <key>StartInterval</key><integer>${config.intervalSeconds}</integer><key>RunAtLoad</key><true/>
 <key>ProcessType</key><string>Background</string><key>ThrottleInterval</key><integer>60</integer>
 <key>StandardOutPath</key><string>${xml(resolve(directory,'scheduler.log'))}</string>
 <key>StandardErrorPath</key><string>${xml(resolve(directory,'scheduler-error.log'))}</string>
 </dict></plist>`;
}
export function schedulerCli(args){
 if(process.platform!=='darwin')throw new Error('CYCLE_MAC_REQUIRED');
 const [mode,configPath]=args;if(!['install','stop','status'].includes(mode)||args.length>2)throw new Error('CYCLE_SCHEDULER_USAGE');
 const domain='gui/'+process.getuid(),path=resolve(homedir(),'Library/LaunchAgents',CYCLE_AGENT_LABEL+'.plist');
 const run=(...cmd)=>spawnSync('/bin/launchctl',cmd,{encoding:'utf8'});
 if(mode==='status'){const r=run('print',domain+'/'+CYCLE_AGENT_LABEL);console.log(r.stdout||'Piloto local detenido');return r.status;}
 if(mode==='stop'){run('bootout',domain+'/'+CYCLE_AGENT_LABEL);if(existsSync(path))unlinkSync(path);console.log('Scheduler del piloto detenido');return 0;}
 if(!configPath)throw new Error('CYCLE_SCHEDULER_USAGE');
 if(existsSync(path))throw new Error('CYCLE_AGENT_ALREADY_EXISTS');
 const config=validateCycleConfig(JSON.parse(readFileSync(configPath,'utf8')));
 if(Date.now()>=config.expiresAt)throw new Error('CYCLE_CONFIG_EXPIRED');
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,schedulerPlist(resolve(configPath),config),{mode:0o600,flag:'wx'});
 const r=run('bootstrap',domain,path);if(r.status!==0){unlinkSync(path);throw new Error('CYCLE_SCHEDULER_INSTALL_FAILED');}
 console.log('Scheduler del piloto instalado; un tick cada '+config.intervalSeconds+' segundos, hasta '+new Date(config.expiresAt).toISOString());return 0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=schedulerCli(process.argv.slice(2));}catch{console.error('CYCLE_SCHEDULER_FAILED');process.exitCode=1;}
}
