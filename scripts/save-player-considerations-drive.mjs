import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

const [, , path] = process.argv;
const { VORTEX_DRIVE_OAUTH, VORTEX_DRIVE_PNG_ID, GITHUB_STEP_SUMMARY } = process.env;
async function summary(line) {
  if (GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY, line+'\n');
}
if (!VORTEX_DRIVE_OAUTH || !VORTEX_DRIVE_PNG_ID) {
  console.warn('Google Drive is not configured in this repository. The PNG is in the private GitHub plan ZIP.');
  await summary('Google Drive save unavailable. The repository needs `VORTEX_DRIVE_OAUTH` and `VORTEX_DRIVE_PNG_ID`.');
} else {
  if (!path || !/^[\w-]{10,200}$/.test(VORTEX_DRIVE_PNG_ID)) throw Error('Invalid Drive target or PNG path.');
  let config;
  try { config = JSON.parse(VORTEX_DRIVE_OAUTH); }
  catch { throw Error('VORTEX_DRIVE_OAUTH must contain JSON.'); }
  if (![config?.client_id, config?.client_secret, config?.refresh_token].every(v=>typeof v==='string' && v.trim())) {
    throw Error('Drive OAuth config requires a client ID, client secret and refresh token.');
  }
  const bytes = await readFile(path);
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Refusing to replace the Drive file with invalid PNG data.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(30_000),
    body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,
      refresh_token:config.refresh_token,grant_type:'refresh_token'}),
  });
  if(!tokenResponse.ok) throw Error('Google OAuth rejected the Drive connection (HTTP '+tokenResponse.status+').');
  const {access_token} = await tokenResponse.json();
  if(typeof access_token!=='string'||!access_token.length) throw Error('Google OAuth returned no Drive access token.');
  const headers = {authorization:'Bearer '+access_token};
  const metadata = await fetch('https://www.googleapis.com/drive/v3/files/'+VORTEX_DRIVE_PNG_ID+
    '?supportsAllDrives=true&fields=id,mimeType,capabilities(canEdit)', {
    headers,redirect:'error',signal:AbortSignal.timeout(30_000),
  });
  if(!metadata.ok) throw Error('The existing Drive PNG could not be verified (HTTP '+metadata.status+').');
  const target=await metadata.json();
  if(target.id!==VORTEX_DRIVE_PNG_ID||target.mimeType!=='image/png'||target.capabilities?.canEdit!==true) {
    throw Error('The configured Drive target must be an existing editable PNG.');
  }
  const update = await fetch('https://www.googleapis.com/upload/drive/v3/files/'+VORTEX_DRIVE_PNG_ID+
    '?uploadType=media&supportsAllDrives=true&fields=id,size,md5Checksum', {
    method:'PATCH',headers:{...headers,'content-type':'image/png'},body:bytes,
    redirect:'error',signal:AbortSignal.timeout(60_000),
  });
  if(!update.ok) throw Error('Google Drive could not update the existing PNG (HTTP '+update.status+').');
  const result=await update.json();
  if(result.id!==VORTEX_DRIVE_PNG_ID||Number(result.size)!==bytes.length||
      result.md5Checksum!==createHash('md5').update(bytes).digest('hex')) throw Error('Google Drive did not verify the PNG save.');
  await summary('[Open the current Players to Consider PNG in Drive](https://drive.google.com/file/d/'+result.id+'/view)');
}
