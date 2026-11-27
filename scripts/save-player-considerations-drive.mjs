import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

const [, , reportDir] = process.argv;
const { VORTEX_DRIVE_OAUTH, VORTEX_DRIVE_FOLDER_ID, GITHUB_STEP_SUMMARY, GITHUB_OUTPUT } = process.env;
async function summary(line) {
  if (GITHUB_STEP_SUMMARY) await appendFile(GITHUB_STEP_SUMMARY, line+'\n');
}
if (!VORTEX_DRIVE_OAUTH) {
  console.warn('Google Drive is not configured in this repository. The workflow will save the four files individually in GitHub.');
  await summary('Google Drive save unavailable. The repository needs `VORTEX_DRIVE_OAUTH`.');
} else {
  const targets=[
    {path:'01-FPL-VORTEX-Lineup.png',mime:'image/png',label:'Lineup'},
    {path:'02-FPL-VORTEX-Transfer-Roadmap.png',mime:'image/png',label:'Transfer roadmap'},
    {path:'03-FPL-VORTEX-Players-to-Consider.png',mime:'image/png',label:'Players to Consider'},
    {path:'04-FPL-VORTEX-Caption-and-Hashtags.txt',mime:'text/plain',label:'Caption and hashtags'},
  ];
  if(!reportDir||!VORTEX_DRIVE_FOLDER_ID||!/^[\w-]{10,200}$/.test(VORTEX_DRIVE_FOLDER_ID)) throw Error('Configure the My Team Drive folder.');
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
  const request = async (url, options={}) => {
    const response=await fetch(url,{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(60_000)});
    if(!response.ok) throw Error('Drive request failed (HTTP '+response.status+').');
    return response.json();
  };
  const api='https://www.googleapis.com/drive/v3/files';
  const upload='https://www.googleapis.com/upload/drive/v3/files';
  const folder=await request(api+'/'+VORTEX_DRIVE_FOLDER_ID+'?fields=id,name,mimeType,trashed,capabilities(canAddChildren)');
  if(folder.trashed||folder.name!=='My Team'||folder.mimeType!=='application/vnd.google-apps.folder'||folder.capabilities?.canAddChildren!==true) throw Error('My Team destination is not writable.');
  const files=await Promise.all(targets.map(async target=>{
    const bytes=await readFile(reportDir+'/'+target.path);
    if(!bytes.length) throw Error('Empty '+target.label);
    const query=new URLSearchParams({q:"'"+folder.id+"' in parents and trashed = false and name = '"+target.path+"'",fields:'nextPageToken,files(id,name,mimeType,capabilities(canEdit))',pageSize:'100'});
    const found=await request(api+'?'+query);
    if(found.nextPageToken||found.files.length>1) throw Error('Ambiguous Drive filename: '+target.path);
    const existing=found.files[0];
    if(existing&&(existing.mimeType!==target.mime||existing.capabilities?.canEdit!==true)) throw Error('Existing file is not editable: '+target.path);
    return {...target,bytes,existing};
  }));
  for(const {path,mime,bytes,label,existing} of files) {
    const fields='id,size,md5Checksum,parents';
    let result;
    if(existing) {
      result=await request(upload+'/'+existing.id+'?uploadType=media&fields='+fields,{method:'PATCH',headers:{'content-type':mime},body:bytes});
    } else {
      const boundary='vortex_'+createHash('sha256').update(bytes).digest('hex');
      const metadata=JSON.stringify({name:path,mimeType:mime,parents:[folder.id]});
      const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+metadata+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
      result=await request(upload+'?uploadType=multipart&fields='+fields,{method:'POST',headers:{'content-type':'multipart/related; boundary='+boundary},body});
    }
    if(!result.id||(existing&&result.id!==existing.id)||!result.parents?.includes(folder.id)||Number(result.size)!==bytes.length||result.md5Checksum!==createHash('md5').update(bytes).digest('hex')) throw Error('Google Drive did not verify '+label+'.');
    await summary('['+label+'](https://drive.google.com/file/d/'+result.id+'/view)');
  }
  await summary('[Open My Team](https://drive.google.com/drive/folders/'+folder.id+')');
  if (GITHUB_OUTPUT) await appendFile(GITHUB_OUTPUT,'saved=true\n');
}
