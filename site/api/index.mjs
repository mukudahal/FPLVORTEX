import worker from '../worker/index.js';

export default {
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    }
    const url = new URL(request.url);
    const route = url.searchParams.get('fplRoute');
    if (route !== null) {
      url.pathname = '/api/' + route;
      url.searchParams.delete('fplRoute');
    }
    try {
      return await worker.fetch(new Request(url,{method:request.method,headers:request.headers}),{},{});
    } catch {
      return Response.json({error:'The FPL service is temporarily unavailable.'},{status:503});
    }
  }
};
