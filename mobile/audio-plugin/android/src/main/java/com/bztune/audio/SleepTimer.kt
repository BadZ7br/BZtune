package com.bztune.audio
internal class SleepTimer(private val now:()->Long,private val expire:()->Unit){
 var deadline:Long=0;private set
 var endTrack:String?=null;private set
 fun configure(minutes:Int,track:String?){require(minutes in 0..180&&!(minutes>0&&track!=null));cancel();if(track!=null){require(track.isNotEmpty());endTrack=track}else if(minutes>0)deadline=now()+minutes*60000L}
 fun cancel(){deadline=0;endTrack=null}
 private fun finish(){cancel();expire()}
 fun tick(){if(deadline>0&&now()>=deadline)finish()}
 fun transition(automatic:Boolean){if(endTrack!=null){if(automatic)finish()else cancel()}}
 fun ended(){if(endTrack!=null)finish()}
 fun remaining()=if(deadline>0)(deadline-now()).coerceAtLeast(0) else 0L
}
