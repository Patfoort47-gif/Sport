import {test,expect,type BrowserContext} from '@playwright/test';
import {fitFixture} from '../test/fixture';

test('two devices see the same account activities; logout restores isolated local mode',async({browser})=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const base='https://uelygvkvdlxrewpftyrf.supabase.co';
  const objects=new Map<string,string>();const rows:any[]=[];
  const user={id:owner,aud:'authenticated',role:'authenticated',email:'sport@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const jwtPart=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const access_token=`${jwtPart({alg:'HS256',typ:'JWT'})}.${jwtPart({sub:owner,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})}.signature`;
  async function setup(context:BrowserContext){
    await context.addInitScript(()=>localStorage.setItem('sport-supabase-public-key','sb_publishable_example_public_browser_key'));
    await context.route(base+'/**',async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname;
      let body:unknown=[];
      if(path==='/auth/v1/token')body={access_token,token_type:'bearer',expires_in:3600,refresh_token:'test-refresh',user};
      else if(path==='/auth/v1/logout'){await route.fulfill({status:204});return}
      else if(path==='/auth/v1/user')body=user;
      else if(path==='/rest/v1/sport_activities'){
        expect(request.headers().authorization).toBe('Bearer '+access_token);
        if(request.method()==='POST'){const row=request.postDataJSON();if(!rows.some(r=>r.id===row.id))rows.push(row);body=[]}
        else if(url.searchParams.has('id'))body=rows.filter(r=>'eq.'+r.id===url.searchParams.get('id')).map(r=>({id:r.id}));
        else body=rows.map(r=>({summary:r.summary}));
      }else if(path.startsWith('/storage/v1/object/')){
        const objectPath=path.replace('/storage/v1/object/authenticated/','').replace('/storage/v1/object/','');
        if(request.method()==='POST'){
          let content=request.postData()??'';
          const contentType=request.headers()['content-type']??'';
          if(contentType.startsWith('multipart/form-data')){
            const form=await new Response(new Uint8Array(request.postDataBuffer()!),{headers:{'content-type':contentType}}).formData();
            const file=[...form.values()].find(value=>typeof value!=='string') as File;
            content=await file.text();
          }
          objects.set(objectPath,content);body={Key:objectPath}
        }
        else {await route.fulfill({status:200,contentType:'application/json',body:objects.get(objectPath)??'{}'});return}
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
  }
  const pc=await browser.newContext();const phone=await browser.newContext({viewport:{width:390,height:844}});
  await setup(pc);await setup(phone);
  async function login(context:BrowserContext){
    const page=await context.newPage();await page.goto('http://127.0.0.1:4173/Sport/');
    await page.getByLabel('E-mail',{exact:true}).fill('sport@example.test');
    await page.getByLabel('Mot de passe',{exact:true}).fill('test-password');
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await expect(page.getByText('Connecté :')).toBeVisible();return page;
  }
  try{
    const page=await login(pc);
    await page.locator('input[type=file]').setInputFiles({name:'run.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture())});
    await expect(page.getByRole('status')).toContainText('importé');
    expect(rows).toHaveLength(1);expect(rows[0].owner_id).toBe(owner);
    const mobile=await login(phone);
    await expect(mobile.getByRole('button',{name:'Course à pied',exact:true})).toBeVisible();
    await mobile.getByRole('button',{name:'Course à pied',exact:true}).click();
    await expect(mobile.getByRole('heading',{name:'Course à pied · Analyse'})).toBeVisible();
    await mobile.getByRole('button',{name:'Se déconnecter'}).click();
    await expect(mobile.getByRole('button',{name:'Se connecter',exact:true})).toBeVisible();
    await expect(mobile.getByRole('button',{name:'Course à pied',exact:true})).toHaveCount(0);
    await expect(mobile.getByRole('heading',{name:'Course à pied · Analyse'})).toHaveCount(0);
  }finally{await pc.close();await phone.close()}
});
