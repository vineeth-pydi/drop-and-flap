import { test, expect } from '@playwright/test';
test('save image downloads an original PNG result card',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:/practice/i}).click();
 await expect(page.getByRole('button',{name:'FLAP',exact:true})).toBeVisible({timeout:7000});
 await page.getByRole('button',{name:/end this set/i}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:/save image/i}).click();
 const download=await downloaded;expect(download.suggestedFilename()).toBe('drop-and-flap-set.png');
 const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!)chunks.push(chunk);
 const data=Buffer.concat(chunks);expect(data.subarray(1,4).toString()).toBe('PNG');expect(data.readUInt32BE(16)).toBe(1080);expect(data.readUInt32BE(20)).toBe(1080);
 await download.saveAs('docs/sample-practice-card.png');
});
