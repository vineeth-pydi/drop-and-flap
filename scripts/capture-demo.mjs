import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:920}});
await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>document.fonts.ready);
await page.getByRole('button',{name:/practice/i}).click();await expect(page.getByRole('button',{name:'FLAP',exact:true})).toBeVisible({timeout:7000});
const interval=setInterval(()=>{void page.locator('canvas').click().catch(()=>undefined);},350);
for(let i=0;i<16;i++){await page.locator('.cabinet').screenshot({path:`docs/demo-frames/frame-${String(i).padStart(2,'0')}.png`});await page.waitForTimeout(180);}
clearInterval(interval);await browser.close();
