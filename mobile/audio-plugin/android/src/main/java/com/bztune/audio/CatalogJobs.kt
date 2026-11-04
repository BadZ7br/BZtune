package com.bztune.audio

import app.tauri.plugin.Invoke
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

internal class CatalogJobs(private val catalog:OnlineCatalog) {
    private class Job(val id:String,val invoke:Invoke) {
        val cancelled=AtomicBoolean(false);val done=AtomicBoolean(false);var future:Future<*>?=null
        fun cancel(){cancelled.set(true);future?.cancel(true);if(done.compareAndSet(false,true))runCatching {invoke.reject("Consulta cancelada.","CATALOG_CANCELLED")}}
    }
    private val pool=ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,LinkedBlockingQueue<Runnable>())
    private var current:Job?=null;private var closed=false
    @Synchronized fun submit(id:String,request:CatalogRequest,refresh:Boolean,invoke:Invoke) {
        try{request.path();require(id.matches("[A-Za-z0-9_-]{1,80}".toRegex()))}catch(_:Exception){invoke.reject("Consulta inválida.","CATALOG_INVALID");return}
        if(closed){invoke.reject("Consulta cancelada.","CATALOG_CANCELLED");return}
        current?.cancel();pool.purge();val job=Job(id,invoke);current=job
        job.future=pool.submit {
            try {
                val result=catalog.load(request,refresh){job.cancelled.get()}
                if(job.done.compareAndSet(false,true))invoke.resolve(result)
            }catch(error:Exception){if(job.done.compareAndSet(false,true))invoke.reject("Não foi possível consultar o catálogo.",if(error is CatalogProblem)error.code else if(error is CancellationException)"CATALOG_CANCELLED" else "CATALOG_NETWORK")}
            finally{synchronized(this){if(current===job)current=null}}
        }
    }
    @Synchronized fun cancel(id:String){if(current?.id==id){current?.cancel();current=null;pool.purge()}}
    @Synchronized fun close(){closed=true;current?.cancel();current=null;pool.shutdownNow()}
}
