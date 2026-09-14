import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, selectUrls, notifyIndexNow, sitemapEntries } from './indexnow.mjs';
const old = { url: ORIGIN+'/', lastmod: '2026-09-08' };
const fresh = { url: ORIGIN+'/tools/new.html', lastmod: '2026-09-14' };
const entries=[old,fresh];
test('Only selected changed canonical URLs are submitted',()=>{
 assert.deepEqual(selectUrls(entries,{since:'2026-09-14'}),[fresh.url]);
 assert.throws(()=>selectUrls(entries),/Choose/);
 assert.throws(()=>selectUrls(entries,{since:'2026-02-31'}),/Invalid/);
 for(const url of ['https://example.com/',ORIGIN+'/?income=100',ORIGIN+'/unknown']) assert.throws(()=>selectUrls(entries,{urls:[url]}));
});
test('Preview never calls the network',async()=>{
 const r=await notifyIndexNow({entries,urls:[fresh.url],fetchImpl:()=>{throw Error('Unexpected network');}});
 assert.equal(r.mode,'preview');
});
test('Submission stops before POST if the change is not deployed',async()=>{
 let posted=false;
 const fetchImpl=async(url,options)=>{
  if(options.method==='POST')posted=true;
  if(url.endsWith('.txt'))return new Response('5a512c78dcd2032ef00728d001674202');
  return new Response('<urlset><url><loc>'+old.url+'</loc><lastmod>'+old.lastmod+'</lastmod></url></urlset>');
 };
 await assert.rejects(notifyIndexNow({entries,urls:[fresh.url],submit:true,fetchImpl}),/not deployed/);
 assert.equal(posted,false);
});
test('Deployed, canonical pages reach IndexNow and preserve 202 status',async()=>{
 let payload;
 const xml='<urlset><url><loc>'+fresh.url+'</loc><lastmod>'+fresh.lastmod+'</lastmod></url></urlset>';
 assert.deepEqual(sitemapEntries(xml),[fresh]);
 const fetchImpl=async(url,options)=>{
  if(options.method==='POST'){payload=JSON.parse(options.body);return new Response('',{status:202});}
  return new Response(url.endsWith('.txt')?'5a512c78dcd2032ef00728d001674202':url.endsWith('.xml')?xml:'<link rel="canonical" href="'+fresh.url+'" />');
 };
 const result=await notifyIndexNow({entries,urls:[fresh.url],submit:true,fetchImpl});
 assert.equal(result.status,202);assert.deepEqual(payload.urlList,[fresh.url]);
});
