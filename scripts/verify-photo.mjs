// Confirm the photo path end to end: feed a real file through the file input.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
const DIST = '/Users/yohan/Projects/rubiks/dist/'
const PORT = 4355
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css' }
const server = createServer(async (req,res)=>{
  const url=(req.url||'/').split('?')[0]
  let f=join(DIST, normalize(url==='/'?'/index.html':url))
  if(!existsSync(f)) f=join(DIST,'index.html')
  res.writeHead(200,{'content-type':MIME[extname(f)]??'application/octet-stream'})
  res.end(await readFile(f))
})
await new Promise(r=>server.listen(PORT,r))
const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page = await browser.newPage({viewport:{width:390,height:844}})
const errs=[]; page.on('pageerror',e=>errs.push(e.message))
await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle'})
const input = await page.$('input[type=file]')
console.log('file input present:', !!input)
await input.setInputFiles('/Users/yohan/Downloads/IMG_1469.PNG')
await page.waitForTimeout(1500)
const st = await page.evaluate(()=>({
  status: document.querySelector('.cam-status')?.textContent,
  bad: document.querySelector('.cam-bad')?.textContent,
  hint: document.querySelector('.cam-hint')?.textContent,
  filled: [...document.querySelectorAll('.mini')].filter(m=>m.style.background && m.style.background!=='rgb(32, 36, 45)').length,
}))
console.log('state:', JSON.stringify(st))
await page.screenshot({path:'/Users/yohan/Projects/rubiks/screenshots/photo-path.png'})
console.log('errors:', errs.length?errs:'none')
await browser.close(); server.close()
