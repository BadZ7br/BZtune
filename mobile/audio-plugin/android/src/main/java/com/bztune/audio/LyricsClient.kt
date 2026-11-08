package com.bztune.audio
import java.net.URL
import java.net.HttpURLConnection
import java.net.URLEncoder
import org.json.JSONObject
internal object LyricsClient {
 fun read(title:String,artist:String,duration:Long):JSONObject{
  require(title.isNotBlank()&&artist.isNotBlank()&&title.length<=512&&artist.length<=512)
  val url="https://lrclib.net/api/get?track_name="+URLEncoder.encode(title,"UTF-8")+"&artist_name="+URLEncoder.encode(artist,"UTF-8")+"&duration="+(duration.coerceAtLeast(0)/1000)
  val c=URL(url).openConnection() as HttpURLConnection
  c.connectTimeout=5000;c.readTimeout=5000;c.instanceFollowRedirects=false;c.setRequestProperty("User-Agent","BZtuneAndroid (https://github.com/BadZ7br/BZtune)")
  val deadline=java.util.Timer(true);deadline.schedule(object:java.util.TimerTask(){override fun run(){c.disconnect()}},12000)
  try{if(c.responseCode==404)return JSONObject().put("synced","").put("plain","").put("instrumental",false)
   require(c.responseCode==200);val bytes=c.inputStream.use {input->val out=java.io.ByteArrayOutputStream();val b=ByteArray(8192);while(true){val n=input.read(b);if(n<0)break;require(out.size()+n<=512*1024);out.write(b,0,n)};out.toByteArray()}
   val raw=Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString()
   return parse(raw)
  }finally{deadline.cancel();c.disconnect()}
 }
 fun parse(raw:String):JSONObject{require(raw.length<=512*1024);val j=JSONObject(raw);fun text(k:String):String{if(j.isNull(k))return "";require(j.get(k) is String);return j.getString(k)}
  val instrumental=if(j.isNull("instrumental"))false else j.get("instrumental").also {require(it is Boolean)} as Boolean
  return JSONObject().put("synced",text("syncedLyrics")).put("plain",text("plainLyrics")).put("instrumental",instrumental)
 }
}
