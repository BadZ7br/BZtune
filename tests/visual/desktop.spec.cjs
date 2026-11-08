const path=require('node:path');
const {createRequire}=require('node:module');
const {test,expect}=createRequire(path.resolve(__dirname,'../../doomvault/package.json'))('playwright/test');
const {fixture}=require('../browser/frontend-contracts.cjs');
for(const theme of ['dark','midnight','light']){
 test(`Início ${theme}`,async({browser})=>{
  const f=await fixture(browser,{theme});
  try{
   await f.page.getByText('Biblioteca recente',{exact:true}).waitFor();
   await f.page.getByText('Faixa Local 1',{exact:true}).waitFor();
   await f.page.evaluate(()=>document.fonts.ready);
   await expect(f.page).toHaveScreenshot(`inicio-${theme}.png`,{animations:'disabled',maxDiffPixelRatio:0.005});
   expect(f.errors).toEqual([]);
  }finally{await f.page.close()}
 });
}
test('Biblioteca com arquivos locais',async({browser})=>{
 const f=await fixture(browser,{tab:'library',trackCount:3});
 try{await f.page.getByText('Faixa Local 3',{exact:true}).waitFor();await f.page.evaluate(()=>document.fonts.ready);
  await expect(f.page).toHaveScreenshot('biblioteca.png',{animations:'disabled',maxDiffPixelRatio:0.005});expect(f.errors).toEqual([]);
 }finally{await f.page.close()}
});
