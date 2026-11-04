package com.bztune.audio

import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import org.json.JSONObject
import org.json.JSONArray
import java.net.URLEncoder
import java.net.HttpURLConnection
import java.net.URL
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.CancellationException

internal class CatalogProblem(val code:String):Exception(code)
internal data class CatalogRequest(val action:String,val query:String="",val kind:String="artists",val id:String="",val page:Int=0) {
    fun path():String {
        if(page !in 0..399)throw CatalogProblem("CATALOG_INVALID")
        val paging="limit=25&offset=${page*25}"
        val mbid=id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}".toRegex())
        fun idRequired(){if(!mbid)throw CatalogProblem("CATALOG_INVALID")}
        return when(action) {
            "search"->{val text=query.trim();if(text.length !in 2..160||text.any {it.isISOControl()})throw CatalogProblem("CATALOG_INVALID")
                val entity=when(kind){"artists"->"artist";"albums"->"release-group";"recordings"->"recording";else->throw CatalogProblem("CATALOG_INVALID")}
                val literal="\""+text.replace("\\","\\\\").replace("\"","\\\"")+"\""
                "/$entity/?query=${URLEncoder.encode(literal,"UTF-8")}&$paging&fmt=json"}
            "artist"->{idRequired();"/release-group?artist=$id&inc=artist-credits&$paging&fmt=json"}
            "group"->{idRequired();"/release?release-group=$id&inc=artist-credits&$paging&fmt=json"}
            "recording"->{idRequired();"/recording/$id?inc=artist-credits+releases&fmt=json"}
            "release"->{idRequired();"/release/$id?inc=recordings+artist-credits&fmt=json"}
            else->throw CatalogProblem("CATALOG_INVALID")
        }
    }
}
internal object CatalogJson {
    const val MAX_BYTES=2*1024*1024
    private fun text(o:JSONObject,key:String,default:String=""):String {
        if(!o.has(key)||o.isNull(key))return default
        val v=o.get(key);if(v !is String||v.length>4096)throw CatalogProblem("CATALOG_RESPONSE");return v
    }
    private fun id(o:JSONObject):String=text(o,"id").also {if(!it.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}".toRegex()))throw CatalogProblem("CATALOG_RESPONSE")}
    private fun count(o:JSONObject,key:String,default:Int):Int {
        if(!o.has(key))return default
        val n=o.get(key);if(n !is Int||n<0)throw CatalogProblem("CATALOG_RESPONSE");return n
    }
    private fun credits(o:JSONObject):String {
        val a=o.optJSONArray("artist-credit")?:return ""
        if(a.length()>100)throw CatalogProblem("CATALOG_RESPONSE")
        return (0 until a.length()).joinToString("") {i->val c=a.getJSONObject(i);text(c,"name",c.optJSONObject("artist")?.let {text(it,"name")}?:"")+text(c,"joinphrase")}.take(4096)
    }
    private fun duration(o:JSONObject):Any {
        if(!o.has("length")||o.isNull("length"))return JSONObject.NULL
        val n=o.get("length");if((n !is Long&&n !is Int)||(n as Number).toLong()<0)throw CatalogProblem("CATALOG_RESPONSE");return n
    }
    private fun row(o:JSONObject,entity:String):JSObject=JSObject().apply {
        put("id",id(o));put("entity",entity);put("title",text(o,if(entity=="artist")"name" else "title").also {if(it.isBlank())throw CatalogProblem("CATALOG_RESPONSE")})
        put("artist",credits(o));put("duration",duration(o))
        put("detail",listOf(text(o,"first-release-date",text(o,"date")),text(o,"primary-type"),text(o,"country"),text(o,"status"),text(o,"disambiguation")).filter {it.isNotBlank()}.joinToString(" · ").take(4096))
    }
    fun parse(request:CatalogRequest,root:JSONObject):JSObject {
        val items=JSArray();var total=0;var pageable=true;var complete=true
        val heading=when(request.action){"search"->request.query.trim();"artist"->"Álbuns do artista";"group"->"Escolha a edição";"recording"->text(root,"title");else->text(root,"title")}
        if(request.action=="release") {
            id(root).also {if(it!=request.id)throw CatalogProblem("CATALOG_RESPONSE")}
            val media=root.getJSONArray("media");if(media.length()>100)throw CatalogProblem("CATALOG_RESPONSE")
            for(disc in 0 until media.length()) {
                val medium=media.getJSONObject(disc);val tracks=medium.optJSONArray("tracks")?:JSONArray()
                total+=count(medium,"track-count",tracks.length())
                if(total>1000||tracks.length()>1000-items.length())throw CatalogProblem("CATALOG_RESPONSE")
                for(i in 0 until tracks.length()) {
                    val t=tracks.getJSONObject(i);val recording=t.optJSONObject("recording")
                    items.put(JSObject().apply {put("id",id(t));put("entity","track");put("title",text(t,"title",recording?.let {text(it,"title")}?:"").also {if(it.isBlank())throw CatalogProblem("CATALOG_RESPONSE")});put("artist",credits(t).ifEmpty {recording?.let {credits(it)}.orEmpty()}.ifEmpty {credits(root)});put("duration",if(t.has("length"))duration(t) else recording?.let {duration(it)}?:JSONObject.NULL);put("detail","Disco ${count(medium,"position",disc+1)} · ${text(t,"number",(i+1).toString())}")})
                }
            }
            complete=items.length()==total;pageable=false
        } else {
            val key=when(request.action){"artist"->"release-groups";"group","recording"->"releases";else->when(request.kind){"artists"->"artists";"albums"->"release-groups";else->"recordings"}}
            if(request.action=="recording"&&id(root)!=request.id)throw CatalogProblem("CATALOG_RESPONSE")
            val values=if(request.action=="recording")root.optJSONArray(key)?:JSONArray() else root.getJSONArray(key);if(values.length()>(if(request.action=="recording")1000 else 25))throw CatalogProblem("CATALOG_RESPONSE")
            val entity=when(key){"artists"->"artist";"release-groups"->"group";"releases"->"release";else->"recording"}
            for(i in 0 until values.length())items.put(row(values.getJSONObject(i),entity))
            total=count(root,if(request.action=="search")"count" else key.removeSuffix("s")+"-count",values.length())
            if(request.action=="recording"){total=values.length();pageable=false;complete=false}
            if(total<values.length())throw CatalogProblem("CATALOG_RESPONSE")
        }
        val ids=(0 until items.length()).map {items.getJSONObject(it).getString("id")}
        if(ids.toSet().size!=ids.size)throw CatalogProblem("CATALOG_RESPONSE")
        return JSObject().apply {put("provider","musicbrainz");put("heading",heading);put("description",credits(root));put("items",items);put("total",total);put("page",if(pageable)request.page else 0);put("pageSize",25);put("pageable",pageable);put("complete",complete)}
    }
    fun read(input:InputStream,cancelled:()->Boolean,deadline:Long=Long.MAX_VALUE):JSONObject {
        val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
        while(true){if(cancelled()||Thread.currentThread().isInterrupted)throw CancellationException();if(System.nanoTime()>deadline)throw CatalogProblem("CATALOG_TIMEOUT");val n=input.read(buffer);if(n<0)break;if(out.size()+n>MAX_BYTES)throw CatalogProblem("CATALOG_RESPONSE");out.write(buffer,0,n)}
        val decoder=Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
        return JSONObject(decoder.decode(java.nio.ByteBuffer.wrap(out.toByteArray())).toString())
    }
}
internal object MusicBrainzTransport {
    private var last=0L
    @Synchronized fun fetch(path:String,cancelled:()->Boolean):JSONObject {
        while(System.nanoTime()-last<1_100_000_000L){if(cancelled()||Thread.currentThread().isInterrupted)throw CancellationException();Thread.sleep(50)}
        if(cancelled())throw CancellationException()
        last=System.nanoTime()
        val c=URL("https://musicbrainz.org/ws/2$path").openConnection() as HttpURLConnection
        val expired=java.util.concurrent.atomic.AtomicBoolean(false)
        val timer=java.util.Timer("bztune-catalog-deadline",true)
        timer.schedule(object:java.util.TimerTask(){override fun run(){expired.set(true);runCatching{c.disconnect()}}},12000)
        try {
            c.instanceFollowRedirects=false;c.connectTimeout=5000;c.readTimeout=5000
            c.setRequestProperty("Accept","application/json");c.setRequestProperty("User-Agent","BZtuneAndroid/0.9.0 (https://github.com/BadZ7br/BZtune)")
            val deadline=System.nanoTime()+12_000_000_000L
            val code=c.responseCode
            if(code==429||code==503)throw CatalogProblem("CATALOG_RATE")
            if(code!=200)throw CatalogProblem("CATALOG_NETWORK")
            if(!c.contentType.orEmpty().lowercase(java.util.Locale.ROOT).contains("application/json"))throw CatalogProblem("CATALOG_RESPONSE")
            return c.inputStream.use {CatalogJson.read(it,cancelled,deadline)}
        } catch(error:Exception) {
            if(cancelled())throw CancellationException()
            if(expired.get())throw CatalogProblem("CATALOG_TIMEOUT")
            throw error
        } finally {timer.cancel();c.disconnect()}
    }
}
internal class CatalogCache(private val directory:File) {
    private fun file(key:String)=File(directory,MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}+".json")
    fun read(key:String,now:Long):Pair<Long,JSONObject>?=try {
        val f=file(key);if(f.length()>CatalogJson.MAX_BYTES+4096)throw IllegalArgumentException()
        val root=android.util.AtomicFile(f).openRead().use {CatalogJson.read(it,{false})}
        val at=root.getLong("at");require(root.getString("path")==key&&at>=0&&at<=now&&now-at<=30L*24*60*60*1000)
        at to root.getJSONObject("body")
    }catch(_:Exception){null}
    fun write(key:String,body:JSONObject,now:Long) {
        try {
            directory.mkdirs();val file=file(key);val bytes=JSONObject().put("path",key).put("at",now).put("body",body).toString().toByteArray(Charsets.UTF_8)
            if(bytes.size>CatalogJson.MAX_BYTES)return
            val atomic=android.util.AtomicFile(file);val stream=atomic.startWrite()
            try{stream.write(bytes);atomic.finishWrite(stream)}catch(error:Exception){atomic.failWrite(stream);throw error}
            val entries=directory.listFiles().orEmpty().filter {it.name.matches("[0-9a-f]{64}\\.json(\\.bak|\\.new)?".toRegex())}
                .groupBy {it.name.substring(0,69)}.entries.sortedBy {it.value.maxOf {file->file.lastModified()}}.toMutableList()
            var size=entries.sumOf {it.value.sumOf {file->file.length()}}
            while(entries.size>40||size>16*1024*1024){val old=entries.removeAt(0);size-=old.value.sumOf {it.length()};android.util.AtomicFile(File(directory,old.key)).delete();old.value.forEach {it.delete()}}
        }catch(_:Exception){} // Cache failure must not discard a valid network result.
    }
}
internal class OnlineCatalog(private val cache:CatalogCache,private val fetch:(String,()->Boolean)->JSONObject=MusicBrainzTransport::fetch,private val clock:()->Long=System::currentTimeMillis) {
    fun load(request:CatalogRequest,refresh:Boolean,cancelled:()->Boolean):JSObject {
        val path=request.path();val now=clock();val saved=cache.read(path,now)
        fun result(body:JSONObject,at:Long,cached:Boolean,offline:Boolean)=CatalogJson.parse(request,body).apply {put("cached",cached);put("offline",offline);put("fetchedAt",at)}
        if(cancelled())throw CancellationException()
        if(!refresh&&saved!=null&&now-saved.first<10*60*1000)try{return result(saved.second,saved.first,true,false)}catch(_:Exception){}
        try {
            val body=fetch(path,cancelled);if(cancelled())throw CancellationException()
            val value=result(body,now,false,false);cache.write(path,body,now);return value
        }catch(error:Exception){
            if(error is CancellationException||cancelled())throw CancellationException()
            if(saved!=null)try{return result(saved.second,saved.first,true,true)}catch(_:Exception){}
            throw if(error is CatalogProblem)error else if(error is org.json.JSONException||error is java.nio.charset.CharacterCodingException)CatalogProblem("CATALOG_RESPONSE") else CatalogProblem("CATALOG_NETWORK")
        }
    }
}
