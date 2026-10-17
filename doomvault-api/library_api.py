"""Compatibilidade com imports antigos; implemente alterações em api.library_api."""
from api.library_api import *  # noqa: F401,F403
from api.library_api import _norm, _base_title  # noqa: F401
