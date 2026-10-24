export function createWorker(assets) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
      let upstream = {'/api/bootstrap':'bootstrap-static/','/api/fixtures':'fixtures/'}[url.pathname];
      const entry = url.pathname.match(/^\/api\/entry\/([1-9]\d{0,9})$/);
      const history = url.pathname.match(/^\/api\/history\/([1-9]\d{0,9})$/);
      const picks = url.pathname.match(/^\/api\/picks\/([1-9]\d{0,9})\/(\d{1,2})$/);
      const live = url.pathname.match(/^\/api\/live\/(\d{1,2})$/);
      if (entry) upstream = `entry/${entry[1]}/`;
      if (history) upstream = `entry/${history[1]}/history/`;
      if (picks && Number(picks[2]) >= 1 && Number(picks[2]) <= 38) upstream = `entry/${picks[1]}/event/${picks[2]}/picks/`;
      if (live && Number(live[1]) >= 1 && Number(live[1]) <= 38) upstream = `event/${live[1]}/live/`;
      if (url.pathname === '/api/videos') {
        try {
          const response = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=UCDU7nEIN72xoiR3NtxCT6CQ',{signal:AbortSignal.timeout(10000)});
          if (!response.ok) throw new Error('Feed unavailable');
          const text = await response.text();
          if (text.length > 1_000_000) throw new Error('Feed too large');
          const decode = value => value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
          const videos = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => {
            const id = match[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
            const title = match[1].match(/<title>([^<]*)<\/title>/)?.[1];
            const published = match[1].match(/<published>([^<]+)<\/published>/)?.[1];
            return /^[a-zA-Z0-9_-]{11}$/.test(id ?? '') && title && published ? {id,title:decode(title),published,thumbnail:`https://i.ytimg.com/vi/${id}/mqdefault.jpg`,url:`https://www.youtube.com/watch?v=${id}`} : null;
          }).filter(Boolean);
          return Response.json(videos,{headers:{'cache-control':'public, max-age=1800'}});
        } catch { return Response.json({error:'YouTube feed unavailable; the saved channel list remains available.'},{status:503}); }
      }
      if (upstream) {
        let stage = 'request_setup';
        try {
          const signal = AbortSignal.timeout(12000);
          stage = 'upstream_fetch';
          const response = await fetch('https://fantasy.premierleague.com/api/' + upstream, {headers:{accept:'application/json'},signal});
          if(response.status===404&&(entry||picks||history))return Response.json({error:'FPL Team ID or gameweek selection was not found.'},{status:404});
          if (!response.ok) return Response.json({error:'Official data is temporarily unavailable. Import a snapshot to continue testing.'},{status:503});
          stage = 'response_body';
          const text = await response.text();
          if (text.length > 8_000_000) throw new Error('Upstream response exceeds limit');
          stage = 'response_json';
          JSON.parse(text);
          const result = new Response(request.method === 'HEAD' ? null : text,{headers:{'content-type':'application/json; charset=utf-8','cache-control':(entry || picks || live || history) ? 'private, max-age=60' : 'public, max-age=900','x-data-source':'Official FPL API','x-retrieved-at':new Date().toISOString(),'x-content-type-options':'nosniff'}});
          return result;
        } catch (error) {
          console.error(JSON.stringify({event:'official_feed_failure',route:url.pathname.replace(/\d+/g,':id'),stage,errorName:error?.name??'Error',message:String(error?.message??'Unknown failure').replace(/https?:\/\/\S+/g,'[upstream]').slice(0,250)}));
          return Response.json({error:'The official feed could not be reached. The labelled sandbox and snapshot import remain available.',failureStage:stage},{status:503});
        }
      }
      const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
      if (!asset) return new Response('Not found',{status:404});
      const body = request.method === 'HEAD' ? null : asset.encoding === 'base64' ? Uint8Array.from(atob(asset.content),character=>character.charCodeAt(0)) : asset.content;
      return new Response(body,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https://resources.premierleague.com https://premierleague-static-files.s3.amazonaws.com https://cdn.englandfootball.com https://i.ytimg.com; object-src 'none'; base-uri 'self'; form-action 'self'"}});
    }
  };
}
