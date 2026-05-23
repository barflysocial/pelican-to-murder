const fs=require('fs');
const path=require('path');
const fastify=require('fastify')({logger:false});
const publicDir=path.join(__dirname,'public');
function siteUrl(req){
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers.host||'localhost:3000';
  return `${proto}://${host}`;
}
function renderIndex(req){
  const tpl=fs.readFileSync(path.join(publicDir,'index.template.html'),'utf8');
  return tpl.replaceAll('__SITE_URL__',siteUrl(req));
}
fastify.get('/',(req,reply)=>reply.type('text/html').send(renderIndex(req)));
fastify.get('/index.html',(req,reply)=>reply.type('text/html').send(renderIndex(req)));
fastify.register(require('@fastify/static'),{root:publicDir,prefix:'/',index:false});
fastify.setNotFoundHandler((req,reply)=>{
  const ext=path.extname(req.url.split('?')[0]);
  if(ext){
    if(ext==='.json') return reply.code(404).type('application/json').send({error:'JSON file not found',path:req.url});
    return reply.code(404).send('File not found');
  }
  reply.type('text/html').send(renderIndex(req));
});
const port=process.env.PORT||3000;
fastify.listen({port,host:'0.0.0.0'},err=>{if(err){console.error(err);process.exit(1)}console.log('Barfly Mystery Hub running on '+port)});
