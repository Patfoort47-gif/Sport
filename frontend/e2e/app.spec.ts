import {test,expect} from '@playwright/test';
import {fitFixture} from '../test/fixture';
import {visualNetwork} from './network';
test.beforeEach(async({page})=>visualNetwork(page));
test('imports FIT, shows analysis, persists across reload and filters without a backend',async({page})=>{
  const errors:string[]=[];const apiRequests:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/'))apiRequests.push(r.url())});
  await page.goto('./');
  await expect(page.getByRole('heading',{name:'Chaque effort compte.'})).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'run.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture())});
  await expect(page.getByRole('status')).toContainText('run.fit : importé');
  await page.getByRole('button',{name:'Course à pied'}).click();
  await expect(page.getByRole('heading',{name:'Course à pied · Analyse'})).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  await expect(page.locator('.leaflet-control-attribution').getByRole('link',{name:'OpenStreetMap',exact:false})).toBeVisible();
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src',/^https:\/\/tile.openstreetmap.org\//);
  for(const metric of ['heart_rate','pace','altitude'])await expect(page.getByTestId('chart-'+metric)).toBeVisible();
  await page.getByTestId('chart-heart_rate').hover();
  await expect(page.getByTestId('analysis-cursor')).toContainText('Temps écoulé');
  await expect(page.getByTestId('analysis-cursor')).toContainText('4:46');
  await page.getByLabel('Début de la plage').fill('3');
  await expect(page.getByTestId('analysis-range')).toHaveText('0:03 — 0:09');
  await page.getByRole('button',{name:'Réinitialiser le zoom'}).click();
  await expect(page.getByTestId('analysis-range')).toHaveText('0:00 — 0:09');
  await page.reload();
  await expect(page.getByRole('button',{name:'Course à pied'})).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'copy.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture())});
  await expect(page.getByRole('status')).toContainText('déjà présent');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Discipline').selectOption('cycling');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByLabel('Discipline').selectOption('');
  await page.getByLabel('Date de début').fill('2026-10-02');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);expect(apiRequests).toEqual([]);
});

test('keeps indoor activities readable without GPS or sensors',async({page})=>{
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles({name:'indoor.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture(['cycling'],{sensors:false}))});
  await expect(page.getByRole('status')).toContainText('indoor.fit : importé');
  await page.getByRole('button',{name:'Cyclisme',exact:true}).click();
  await expect(page.getByText('Aucune position GPS', {exact:false})).toBeVisible();
  await expect(page.getByText('Aucune mesure de fréquence cardiaque dans ce fichier.')).toBeVisible();
  await expect(page.getByText('Aucune mesure de altitude dans ce fichier.')).toBeVisible();
  await expect(page.getByTestId('activity-map')).toHaveCount(0);
});
test('reports invalid FIT files',async({page})=>{
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles({name:'broken.fit',mimeType:'application/octet-stream',buffer:Buffer.from('bad fit')});
  await expect(page.getByRole('status')).toContainText('invalide');
  await expect(page.locator('tbody tr')).toHaveCount(0);
});


test('accepts batches by drag and drop even when the journal already has activities',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles({name:'run.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture())});
  await expect(page.getByRole('status')).toContainText('run.fit : importé');
  const bytes=Array.from(fitFixture(['cycling']));
  const transfer=await page.evaluateHandle(({bytes})=>{
    const dt=new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)],'bike.fit',{type:'application/octet-stream'}));
    dt.items.add(new File(['not a FIT'],'invalid.fit',{type:'application/octet-stream'}));
    return dt;
  },{bytes});
  await page.getByTestId('fit-dropzone').dispatchEvent('drop',{dataTransfer:transfer});
  await transfer.dispose();
  await expect(page.getByRole('status')).toContainText('bike.fit : importé');
  await expect(page.getByRole('status')).toContainText('invalid.fit');
  await expect(page.locator('#journal tbody tr')).toHaveCount(2);
  await expect(page.getByRole('columnheader',{name:'DÉNIVELÉ +'})).toBeVisible();
  await page.getByRole('button',{name:'Cyclisme',exact:true}).click();
  await expect(page.getByTestId('chart-altitude')).toBeVisible();
  await page.screenshot({path:'test-results/dashboard-v2-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByTestId('fit-dropzone')).toBeVisible();
  await expect(page.getByTestId('chart-heart_rate')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/dashboard-v2-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('navigates between statistics, journal and import with shared sport filters on mobile',async({page})=>{
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles([
    {name:'run.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture())},
    {name:'bike.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture(['cycling']))},
    {name:'walk.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fitFixture(['walking']))},
  ]);
  await expect(page.locator('#journal tbody tr')).toHaveCount(3);
  await page.setViewportSize({width:390,height:844});
  const nav=page.getByRole('navigation',{name:'Navigation principale'});
  await nav.getByRole('button',{name:'Statistiques générales'}).click();
  await expect(page.getByRole('heading',{name:'Statistiques générales'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Heures par mois',exact:true})).toBeVisible();
  await expect(page.getByText('3 séance(s).',{exact:false})).toBeVisible();
  await page.screenshot({path:'test-results/statistics-mobile.png',fullPage:true});
  await page.getByLabel('Discipline').selectOption('other');
  await expect(page.getByText('1 séance(s).',{exact:false})).toBeVisible();
  await page.getByLabel('Date de début').fill('2027-01-01');
  await expect(page.getByText('Aucune activité pour ces filtres.',{exact:false})).toBeVisible();
  await page.getByLabel('Date de début').fill('');
  await nav.getByRole('button',{name:'Mes activités'}).click();
  await expect(page.locator('#journal')).toBeVisible();
  await expect(page.locator('#journal tbody tr')).toHaveCount(1);
  await nav.getByRole('button',{name:'Importer un FIT'}).click();
  await expect(page.getByTestId('fit-dropzone')).toBeVisible();
  await expect(page.locator('#journal')).toBeHidden();
});
