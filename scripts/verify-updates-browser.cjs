const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const output = 'test-results/updates';
const release = version => ({ tag_name:`v${version}-preview`, published_at:'2026-10-31', assets:[{name:`CasaMichele-v${version}-preview.apk`, state:'uploaded',size:6000000,digest:'sha256:'+'a'.repeat(64),browser_download_url:`https://github.com/mgritzbach/casa_michele/releases/download/v${version}-preview/CasaMichele-v${version}-preview.apk`}] });
(async () => {
  await fs.mkdir(output,{recursive:true});
  let nextDeployment = false;
  const root = path.resolve('dist');
  const server = http.createServer(async (req,res) => {
    try {
      let pathname = new URL(req.url,'http://localhost').pathname;
      if(pathname==='/') pathname='/index.html';
      const target=path.resolve(root,'.'+pathname);
      if(!target.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
      let bytes=await fs.readFile(target);
      if(!nextDeployment && pathname==='/sw.js') bytes=Buffer.from(bytes.toString().replace(/url:"index.html",revision:"[^"]+"/,'url:"index.html",revision:"fixture-old"'));
      if(!nextDeployment && pathname==='/index.html') bytes=Buffer.from(bytes.toString().replace('<body>','<body data-update-fixture="old">'));
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png'}[path.extname(target)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'}).end(bytes);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(4178,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const results=[];
  try {
    const native=await browser.newContext({viewport:{width:390,height:844}});
    await native.addInitScript(()=>{
      window.androidBridge={};window.installCalls=0;window.installResult='permission';
      window.Capacitor={PluginHeaders:[{name:'App',methods:[{name:'getLaunchUrl',rtype:'promise'},{name:'getInfo',rtype:'promise'},{name:'addListener'},{name:'removeListener',rtype:'promise'}]},{name:'CasaUpdater',methods:[{name:'install',rtype:'promise'}]}],
        nativeCallback:()=> 'listener',nativePromise:async(plugin,method,options)=>{
          if(method==='getInfo')return {id:'com.casamichele.app.preview',version:'5.2.0'};
          if(method==='install'){window.installCalls++;window.installOptions=options;if(window.installResult==='error')throw new Error('Download verification failed. Please try again.');return {status:window.installResult};}
        }};
    });
    await native.route('https://api.github.com/**',route=>route.fulfill({json:[release('6.0.0')]}));
    const page=await native.newPage();await page.goto('http://127.0.0.1:4178');
    await page.getByRole('button',{name:'Check for updates',exact:true}).click();
    await page.getByRole('button',{name:'Download and install',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.installCalls),0);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Check again' && !b.disabled && getComputedStyle(b).opacity==='1'));
    await page.evaluate(await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8'));
    const audit=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    await fs.writeFile(output+'/accessibility.json',JSON.stringify(audit.violations,null,2)); assert.deepEqual(audit.violations.map(v=>v.id),[]);
    await page.screenshot({path:output+'/native-update.png'});
    await page.getByRole('button',{name:'Download and install',exact:true}).click();
    await page.getByText('Allow Casa Michele to install updates',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.installCalls),1);
    await page.evaluate(()=>window.installResult='installer');
    await page.getByRole('button',{name:'Download and install',exact:true}).click();
    await page.getByText('Confirm the update in Android.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.installOptions.sha256),'a'.repeat(64));
    await page.evaluate(()=>window.installResult='error');
    await page.getByRole('button',{name:'Download and install',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Download verification failed'}).waitFor();
    await native.setOffline(true);await page.getByRole('button',{name:'Check again',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Connect to the internet'}).waitFor();
    results.push('native update availability, permission, installer, failure, offline and accessibility');
    await native.close();

    const web=await browser.newContext({viewport:{width:320,height:800}});
    await web.route('https://api.github.com/**',route=>route.fulfill({json:[release('6.0.0')]}));
    const app=await web.newPage();await app.goto('http://127.0.0.1:4178');
    await app.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await app.getByRole('button',{name:'Bartender access',exact:true}).click();
    await app.getByRole('button',{name:'Start a local offline bar',exact:true}).click();
    const notice=app.getByRole('button',{name:'Dismiss',exact:true});await app.addLocatorHandler(notice,()=>notice.click());
    await app.getByRole('button',{name:'Stock',exact:true}).click();
    await app.getByRole('switch',{name:'Gin in stock',exact:true}).click();
    await app.getByText('1 saved change',{exact:false}).waitFor();
    assert.equal(await app.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await app.getByRole('button',{name:'Check for updates',exact:true}).click();
    await app.getByText('The web update will be offered here',{exact:false}).waitFor();
    assert.equal(await app.getByRole('button',{name:'Download and install',exact:true}).count(),0);
    nextDeployment=true;
    await app.getByRole('button',{name:'Check again',exact:true}).click();
    await app.getByRole('button',{name:'Install web update',exact:true}).waitFor({timeout:20000});
    await app.screenshot({path:output+'/web-update.png'});
    await app.getByRole('button',{name:'Install web update',exact:true}).click();
    await app.waitForFunction(()=>!document.body.hasAttribute('data-update-fixture'),{},{timeout:20000});
    await app.getByText('1 saved change',{exact:false}).waitFor();
    await app.getByRole('button',{name:'Stock',exact:true}).click();
    assert.equal(await app.getByRole('switch',{name:'Gin in stock',exact:true}).getAttribute('aria-checked'),'false');
    await app.getByRole('button',{name:'Check for updates',exact:true}).click();
    await web.route('https://api.github.com/**',route=>route.fulfill({status:403,json:{message:'rate limited'}}));
    await app.getByRole('button',{name:'Check again',exact:true}).click();
    await app.getByRole('alert').filter({hasText:'limiting update checks'}).waitFor();
    await web.setOffline(true);
    await app.getByRole('button',{name:'Check again',exact:true}).click();
    await app.getByRole('alert').filter({hasText:'Connect to the internet'}).waitFor();
    results.push('real web service-worker install, pending stock preservation, release/deployment distinction, rate limit, 320px layout');
    await fs.writeFile(output+'/result.json',JSON.stringify({passed:true,checks:results,accessibilityViolations:audit.violations.length},null,2));
    console.log('PASS',results);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
