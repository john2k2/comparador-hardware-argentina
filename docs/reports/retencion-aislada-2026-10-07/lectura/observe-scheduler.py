import subprocess,selectors,time,datetime,pathlib,json,re,sys
p=pathlib.Path('tmp/retencion-aislada-2026-10-07')
stop=datetime.datetime.fromisoformat('2026-10-07T16:12:30+00:00').timestamp()
proc=subprocess.Popen(['npx','wrangler','tail','comparador-hardware-argentina','--format','json','--version-id','652e3c18-4182-43d1-9d98-5f10afd67aa8'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
sel=selectors.DefaultSelector();sel.register(proc.stdout,selectors.EVENT_READ)
buf='';decoder=json.JSONDecoder();out={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'version':'652e3c18-4182-43d1-9d98-5f10afd67aa8','readOnlyTail':True,'scheduled':[],'otherEventCount':0}
print(json.dumps({'tailStarted':True,'stopsAtUTC':'2026-10-07T16:12:30Z','rawLogsPersisted':False}),flush=True)
try:
 while time.time()<stop and proc.poll() is None:
  for key,_ in sel.select(timeout=1):
   chunk=key.fileobj.read1(65536).decode('utf-8',errors='replace')
   if not chunk:break
   buf+=chunk
   while True:
    start=buf.find('{')
    if start<0:buf=buf[-1000:];break
    buf=buf[start:]
    try: event,end=decoder.raw_decode(buf)
    except json.JSONDecodeError:
     if len(buf)>400000:buf=''
     break
    buf=buf[end:]
    if not isinstance(event,dict):continue
    detail=event.get('event') or {}
    if not isinstance(detail,dict) or 'cron' not in detail:
     out['otherEventCount']+=1;continue
    codes=[];results=[];messages=[]
    for item in event.get('logs',[]):
     value=item.get('message',[]) if isinstance(item,dict) else []
     text=' '.join(str(v) for v in value) if isinstance(value,list) else str(value)
     codes.extend(re.findall(r'CATALOG_SCHEDULER_[A-Z_]+',text))
     for result in ['disabled','busy','recent','deferred','sent']:
      if re.search(r'"result"\s*:\s*"'+result+'"',text):results.append(result)
     if 'Catalog scheduler completed' in text:messages.append('completed')
     if 'Catalog scheduler failed' in text:messages.append('failed')
    for exc in event.get('exceptions',[]):
     if isinstance(exc,dict):codes.extend(re.findall(r'CATALOG_SCHEDULER_[A-Z_]+',str(exc.get('message',''))))
    safe={'readAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cron':str(detail['cron']) if re.fullmatch(r'[\d*/ ,\-]+',str(detail['cron'])) else 'redacted','scheduledTime':detail.get('scheduledTime') if isinstance(detail.get('scheduledTime'),(int,float)) else None,'outcome':event.get('outcome') if event.get('outcome') in ['ok','exception','exceededCpu','exceededMemory','canceled','unknown'] else 'other','scriptVersionId':event.get('scriptVersion',{}).get('id') if isinstance(event.get('scriptVersion'),dict) else None,'codes':sorted(set(codes)),'results':sorted(set(results)),'messages':sorted(set(messages)),'exceptionCount':len(event.get('exceptions',[]))}
    out['scheduled'].append(safe);print(json.dumps(safe),flush=True)
    (p/'scheduler-tail.json').write_text(json.dumps(out,indent=2)+'\n')
 finally_exit=proc.poll()
finally:
 proc.terminate()
 try:proc.wait(timeout=5)
 except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)
 out['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();out['tailExit']=finally_exit if 'finally_exit' in locals() else None
 (p/'scheduler-tail.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps({'tailClosed':True,'scheduledEvents':len(out['scheduled']),'otherEventsCountedOnly':out['otherEventCount']}),flush=True)
