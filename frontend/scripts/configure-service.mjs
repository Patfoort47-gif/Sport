import {writeFileSync} from 'node:fs';
const url=(process.env.VITE_GARMIN_SERVICE_URL||'').trim().replace(/\/$/,'');
if(url){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('GARMIN_SERVICE_URL must be an HTTPS origin');
}
writeFileSync(new URL('../dist/garmin-service.json',import.meta.url),JSON.stringify({url}));
