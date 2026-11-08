/** Simulated native playlist store; used only in browser tests. */
module.exports=()=>{
   const tracks=[{id:'one',title:'Ação',artist:'Artista',album:'Disco',year:'2000',duration:120000,cover:null,favorite:true},{id:'two',title:'日本語',artist:'Artista',album:'Disco',year:'2026',duration:130000,cover:null,favorite:false}];
   let saved=JSON.parse(sessionStorage.getItem('playlists')||'[]'),seq=0;
   const player={title:'Original',hasTrack:true,playing:true,loading:false,position:0,duration:120000,failed:false,queue:[{id:'original',title:'Original'}],index:0,shuffle:false,repeat:0,canNext:false,canPrevious:false};
   const result=id=>({playlists:saved.map(p=>({id:p.id,name:p.name,revision:p.revision,count:p.ids.length})),selected:saved.filter(p=>p.id===id).map(p=>({id:p.id,name:p.name,revision:p.revision,count:p.ids.length,tracks:p.ids.map(id=>{const t=tracks.find(t=>t.id===id)||{id,title:'Faixa '+id,artist:'Artista',album:'Disco'};return {id:t.id,title:t.title,artist:t.artist,album:t.album};})}))[0]||null});
   window.seedPlaylists=value=>{saved=value;sessionStorage.setItem('playlists',JSON.stringify(saved));};
   window.commands=[];
   window.__TAURI__={core:{invoke:async(name,args)=>{
    const cmd=name.split('|')[1];window.commands.push({cmd,args});
    if(cmd==='albums')return {items:[],total:0,page:0,pageSize:50,artists:[]};
    if(cmd==='track_details')return {id:args.id,artist:'Artista',album:'Disco',cover:null};
    if(cmd==='library_list'&&args?.home)return {total:0,recentTotal:0,favoriteTotal:0,recent:[],favorites:[]};
    if(cmd==='library_list')return {items:tracks,total:tracks.length,page:0,pageSize:50,artists:['Artista'],albums:[]};
    if(cmd==='playlists'){
     const r=args.request;
     if(r.action==='list')return window.invalidPlaylists?{playlists:[null],selected:null}:result(r.id);
     if(window.holdMutation===r.action)await new Promise(resolve=>{window.releaseMutation=resolve;});
     if(window.forceConflict)throw Error('A playlist ou biblioteca mudou. Recarregue antes de tentar novamente.');
     let p=saved.find(p=>p.id===r.id);
     if(r.action!=='create'&&(!p||p.revision!==r.revision))throw Error('A playlist ou biblioteca mudou. Recarregue antes de tentar novamente.');
     if(r.action==='create'){if(saved.length>=100)throw Error('Limite de playlists.');p={id:'playlist-'+Date.now()+'-'+seq++,name:r.name.trim(),revision:0,ids:[]};saved.push(p);}
     if(r.action==='rename')p.name=r.name.trim();
     if(r.action==='add'&&!p.ids.includes(r.trackId))p.ids.push(r.trackId);
     if(r.action==='remove')p.ids=p.ids.filter(id=>id!==r.trackId);
     if(r.action==='reorder')p.ids=r.trackIds;
     if(r.action==='delete')saved=saved.filter(x=>x.id!==p.id);
     if(r.action!=='create')p.revision++;
     sessionStorage.setItem('playlists',JSON.stringify(saved));return window.invalidMutation?{playlists:[null],selected:null}:result(p.id);
    }
    if(cmd==='playlist_play'||cmd==='playlist_enqueue'){
     if(window.unavailable)throw Error('Arquivo indisponível ou acesso revogado.');
     const p=saved.find(p=>p.id===args.id);const entries=p.ids.map(id=>({id:'entry-'+seq++,title:tracks.find(t=>t.id===id).title}));
     if(cmd==='playlist_play'){player.queue=entries;player.index=0;player.title=entries[0].title;player.playing=true;}
     else player.queue.push(...entries);
     player.hasTrack=true;player.canNext=player.queue.length>1;
    }
    return {...player,queue:[...player.queue]};
   }}};
  };
