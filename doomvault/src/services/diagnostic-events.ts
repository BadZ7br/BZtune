// Volatile, bounded technical codes only. No URLs, bodies, track data or exception text.
type DiagnosticEvent = {time:number; code:string};
const events: DiagnosticEvent[]=[];
export function recordRequestFailure(code: number | 'network') {
  events.push({time:Date.now(),code:typeof code==='number'?`HTTP ${code}`:'Conexão ou prazo excedido'});
  if(events.length>20)events.shift();
}
export function recentRequestFailures(): string[] {
  const cutoff=Date.now()-15*60*1000;
  return events.filter(event=>event.time>=cutoff).map(event=>event.code);
}
