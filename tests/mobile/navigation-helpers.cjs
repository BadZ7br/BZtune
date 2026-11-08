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

async function trackAction(page,title,name){
 await page.getByRole('button',{name:`Opções de ${title}`,exact:true}).click();
 const sheet=page.getByRole('dialog',{name:title,exact:true});await sheet.waitFor();
 await sheet.getByRole('button',{name,exact:true}).click();await sheet.waitFor({state:'hidden'});
}
async function expectFavorite(page,title,expected){
 await page.waitForFunction(({title,expected})=>{
  const b=Array.from(document.querySelectorAll('.library-track-main')).find(n=>n.getAttribute('aria-label')===`Tocar agora ${title}`);
  return !!b&&!!b.querySelector('.track-favorite')===expected;
 },{title,expected});
}
module.exports.trackAction=trackAction;module.exports.expectFavorite=expectFavorite;
async function albumAction(page,title,year,name){
 await page.getByRole('button',{name:`Opções do álbum ${title} ${year}`,exact:true}).click();
 const sheet=page.getByRole('dialog',{name:`${title}${year?` (${year})`:''}`,exact:true});await sheet.waitFor();
 await sheet.getByRole('button',{name,exact:true}).click();await sheet.waitFor({state:'hidden'});
}
async function expectAlbumMark(page,id,field,expected){
 await page.waitForFunction(({id,field,expected})=>Array.from(document.querySelectorAll('.album-grid>li')).some(n=>n.getAttribute('data-album-id')===id&&n.getAttribute('data-'+field)===String(expected)),{id,field,expected});
}
module.exports.albumAction=albumAction;module.exports.expectAlbumMark=expectAlbumMark;
async function playlistMenu(page,name){
 await page.getByRole('button',{name:'Opções da playlist',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();
}
async function playlistTrackAction(page,title,name){
 await page.getByRole('button',{name:`Opções de ${title} na playlist`,exact:true}).click();
 const sheet=page.getByRole('dialog',{name:title,exact:true});await sheet.waitFor();
 await sheet.getByRole('button',{name,exact:true}).click();await sheet.waitFor({state:'hidden'});
}
module.exports.playlistMenu=playlistMenu;module.exports.playlistTrackAction=playlistTrackAction;
async function queueAction(page,title,name,position){
 const rows=page.locator('.mobile-queue li');const row=position?rows.nth(position-1):rows.filter({has:page.getByRole('button',{name:`Selecionar ${title}`,exact:true})});
 await row.getByRole('button',{name:/^Opções de/}).click();
 const sheet=page.getByRole('dialog',{name:title,exact:true});await sheet.waitFor();await sheet.getByRole('button',{name,exact:true}).click();await sheet.waitFor({state:'hidden'});
}
module.exports.queueAction=queueAction;
