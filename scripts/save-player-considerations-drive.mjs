import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

const [, , reportDir] = process.argv;
const { VORTEX_DRIVE_OAUTH, VORTEX_DRIVE_PNG_ID, VORTEX_DRIVE_ZIP_ID, VORTEX_DRIVE_CAPTION_ID, GITHUB_STEP_SUMMARY } = process.env;
async function summary(line) {
  if (GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY, line+'\n');
}
if (!VORTEX_DRIVE_OAUTH) {
  console.warn('Google Drive is not configured in this repository. The graphics and caption are in the private GitHub plan ZIP.');
  await summary('Google Drive save unavailable. The repository needs `VORTEX_DRIVE_OAUTH`.');
} else {
  const targets=[
    {id:VORTEX_DRIVE_ZIP_ID,path:'current-plan.zip',mime:'application/zip',label:'Current plan ZIP with graphics and caption'},
    {id:VORTEX_DRIVE_PNG_ID,path:'graphics/FPL_VORTEX_players_to_consider.png',mime:'image/png',label:'Current Players to Consider PNG'},
    {id:VORTEX_DRIVE_CAPTION_ID,path:'caption.txt',mime:'text/plain',label:'Current caption and hashtags'},
  ];
  if(!reportDir||new Set(targets.map(t=>t.id)).size!==targets.length||
      targets.some(t=>!t.id||!/^[\w-]{10,200}$/.test(t.id))) throw Error('Configure three distinct existing Drive file IDs and a report directory.');
  let config;
  try { config = JSON.parse(VORTEX_DRIVE_OAUTH); }
  catch { throw Error('VORTEX_DRIVE_OAUTH must contain JSON.'); }
  if (![config?.client_id, config?.client_secret, config?.refresh_token].every(v=>typeof v==='string' && v.trim())) {
    throw Error('Drive OAuth config requires a client ID, client secret and refresh token.');
  }
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(30_000),
    body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,
      refresh_token:config.refresh_token,grant_type:'refresh_token'}),
  });
  if(!tokenResponse.ok) throw Error('Google OAuth rejected the Drive connection (HTTP '+tokenResponse.status+').');
  const {access_token} = await tokenResponse.json();
  if(typeof access_token!=='string'||!access_token.length) throw Error('Google OAuth returned no Drive access token.');
  const headers = {authorization:'Bearer '+access_token};
  const files = await Promise.all(targets.map(async target=>{
    const bytes=await readFile(reportDir+'/'+target.path);
    if(!bytes.length) throw Error('Refusing to overwrite with an empty '+target.label+'.');
    const response=await fetch('https://www.googleapis.com/drive/v3/files/'+target.id+
      '?supportsAllDrives=true&fields=id,mimeType,capabilities(canEdit)', {
      headers,redirect:'error',signal:AbortSignal.timeout(30_000),
    });
    if(!response.ok) throw Error('Could not verify '+target.label+' (HTTP '+response.status+').');
    const file=await response.json();
    if(file.id!==target.id||file.mimeType!==target.mime||file.capabilities?.canEdit!==true) {
      throw Error('Wrong file type or edit access missing for '+target.label+'.');
    }
    return {...target,bytes};
  }));
  for (const {id,mime,bytes,label} of files) {
    const update=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+id+
      '?uploadType=media&supportsAllDrives=true&fields=id,size,md5Checksum', {
      method:'PATCH',headers:{...headers,'content-type':mime},body:bytes,
      redirect:'error',signal:AbortSignal.timeout(60_000),
    });
    if(!update.ok) throw Error('Could not update '+label+' (HTTP '+update.status+').');
    const result=await update.json();
    if(result.id!==id||Number(result.size)!==bytes.length||
        result.md5Checksum!==createHash('md5').update(bytes).digest('hex')) throw Error('Google Drive did not verify '+label+'.');
    await summary('['+label+'](https://drive.google.com/file/d/'+id+'/view)');
  }
}
