"""Comparable names without erasing non-Latin scripts or their phonetic marks."""
import unicodedata

def normalize_name(value):
    text = unicodedata.normalize('NFD', unicodedata.normalize('NFKC', str(value or '')).casefold())
    result = []
    latin = False
    for char in text:
        mark = unicodedata.category(char).startswith('M')
        if mark:
            if not latin:
                result.append(char)
        else:
            latin = 'LATIN' in unicodedata.name(char, '')
            result.append(char if char.isalnum() else ' ')
    return unicodedata.normalize('NFC', ' '.join(''.join(result).split()))
