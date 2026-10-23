import sys,json
from unittest.mock import patch
from flask import Flask
sys.path.insert(0,'/workspace/BZtune/doomvault-api')
from api import auto_catalog_api as auto
app=Flask(__name__);app.register_blueprint(auto.auto_catalog_bp);client=app.test_client();out=[]
with patch.object(auto.threading,'Thread') as thread:
 for name,payload in [('non_object_list',[1]),('non_object_text','bad'),('null_metadata',{'artist':None,'title':None,'kind':'track'}),('numeric_metadata',{'artist':42,'title':3,'kind':'track'}),('empty_metadata',{'artist':'','title':'','kind':'track'})]:
  auto.BATCHES.clear();r=client.post('/api/library/auto-download',json=payload);out.append({'name':name,'status':r.status_code,'json':r.get_json(silent=True),'workerArguments':list(thread.call_args.kwargs.get('args',())[1:]) if r.status_code==202 else None})
 auto.BATCHES.clear();codes=[]
 for _ in range(4):codes.append(client.post('/api/library/auto-download',json={'artist':'Artist','title':'Song','kind':'track','videoId':'abcdefghijk'}).status_code)
 out.append({'name':'batch_capacity','statuses':codes,'activeBatchCount':len(auto.BATCHES)})
 auto.BATCHES.clear()
print(json.dumps(out,indent=2));open('/tmp/bztune-audit-backend-player.json','w').write(json.dumps(out,indent=2))
