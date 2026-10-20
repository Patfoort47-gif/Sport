import {test,expect} from '@playwright/test';
import {visualNetwork} from './network';
test('starts with a dedicated login and allows explicit local use without exposing a dashboard first',async({page})=>{
 await visualNetwork(page);await page.goto('./');
 await expect(page.getByRole('button',{name:'Se connecter',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Statistiques générales',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/welcome-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Accéder au tableau de bord et au coach sans compte'}).click();
 await expect(page.getByRole('heading',{name:'Statistiques générales',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Voir les séances du coach',exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Voir les séances du coach',exact:false}).click();
 await expect(page.getByRole('heading',{name:'Votre prochaine séance, au bon dosage.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Se connecter',exact:true})).toBeHidden();
 await page.getByRole('navigation').getByRole('button',{name:'Compte et Garmin'}).click();
 await page.getByRole('button',{name:'Revenir à la connexion'}).click();
 await expect(page.getByRole('navigation')).toHaveCount(0);
});
