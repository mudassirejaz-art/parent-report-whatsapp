import {chromium,expect} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
const path=existsSync('backend/.local/accounts.json')?'backend/.local/accounts.json':'../backend/.local/accounts.json';
const {accounts}=JSON.parse(readFileSync(path,'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [role,width] of [['admin',1440],['parent_a',390]]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:5173/workspace');
    await page.getByLabel('Email address',{exact:true}).fill(accounts[role].email);
    await page.getByLabel('Password',{exact:true}).fill(accounts[role].password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    if(role==='admin'){
      await expect(page.getByRole('heading',{name:'Class portals',exact:true})).toBeVisible();
      await expect(page.locator('.live-grid .card').first()).toBeVisible();
      await page.screenshot({path:'verification/backend-admin-desktop.png',fullPage:true});
    } else {
      await page.getByRole('navigation',{name:'School workspace'}).getByRole('link',{name:'Reports',exact:true}).click();
      await page.getByRole('link',{name:'Read report',exact:true}).first().click();
      await expect(page.getByRole('heading',{name:'Ahmed · Fictional',exact:true})).toBeVisible();
      const widthOkay=await page.locator('.live-report table').evaluate(table=>table.scrollWidth<=table.clientWidth+1);
      if(!widthOkay)throw Error('Mobile report table is clipped');
      await page.screenshot({path:'verification/backend-parent-report-mobile.png',fullPage:true});
    }
    await context.close();
  }
  console.log('PASS: desktop admin and mobile parent screenshots captured; mobile report table fits.');
} finally {await browser.close();}
