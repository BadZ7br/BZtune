"""Common JSON envelope validation; route-specific checks still validate semantics."""
from flask import jsonify, request

TEXT_FIELDS = frozenset({'name','description','title','artist','album','albumId','videoId',
                         'video_id','track_id','url','kind','source','sessionId','confirm'})

def validate_json_object():
    if request.method not in {'POST','PUT','PATCH','DELETE'} or not request.is_json:
        return None
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error='Informe um objeto JSON válido.'), 400
    for name in TEXT_FIELDS.intersection(data):
        if data[name] is not None and not isinstance(data[name], str):
            return jsonify(error=f'O campo {name} precisa ser texto.'), 400
    if 'authorized' in data and type(data['authorized']) is not bool:
        return jsonify(error='A autorização precisa ser verdadeira ou falsa.'), 400
    return None
