const dialog=page=>page.getByRole('dialog',{name:/Agora tocando|Fila de reprodução/});
async function closePlayer(page){const d=dialog(page);if(await d.isVisible()){await d.getByRole('button',{name:'Minimizar player',exact:true}).click();await d.waitFor({state:'hidden'});}}
async function nav(page,name){await closePlayer(page);await page.getByRole('navigation',{name:'Navegação principal',exact:true}).getByRole('button',{name,exact:true}).click();}
async function library(page,view='Músicas'){await nav(page,'Biblioteca');await page.getByRole('navigation',{name:'Categorias da biblioteca',exact:true}).getByRole('button',{name:view,exact:true}).click();}
async function player(page){if(!(await dialog(page).isVisible()))await page.getByRole('button',{name:'Abrir player expandido',exact:true}).click();const playerButton=dialog(page).getByRole('button',{name:'Player',exact:true});if(await playerButton.getAttribute('aria-pressed')!=='true')await playerButton.click();}
async function queue(page){if(!(await dialog(page).isVisible()))await page.getByRole('button',{name:/^Abrir fila ·/}).click();else await dialog(page).getByRole('button',{name:/^Fila ·/}).click();}
function queueCount(page,count){return page.locator('.mobile-dock').getByRole('button',{name:`Abrir fila · ${count}`,exact:true});}
function trackTitle(page,title){return page.locator('.mini-track').getByText(title,{exact:true});}
async function replaceMusic(page){const menu=page.locator('.player-menu');if(!(await menu.evaluate(el=>el.open)))await menu.locator('summary').click();await menu.getByRole('button',{name:'Escolher músicas',exact:true}).click();}
module.exports={dialog,closePlayer,nav,library,player,queue,queueCount,trackTitle,replaceMusic};
