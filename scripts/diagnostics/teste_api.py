
from ytmusicapi import YTMusic

# Inicializa o acesso ao catálogo do YouTube Music
yt = YTMusic()

# Pesquisa os álbuns de um artista
consulta = input("Digite um artista ou álbum: ")

resultados = yt.search(
    consulta,
    filter="albums",
    limit=10,
)

if not resultados:
    print("Nenhum álbum encontrado.")
else:
    for album in resultados:
        artistas = album.get("artists", [])
        nomes_artistas = ", ".join(
            artista["name"] for artista in artistas
        )

        miniaturas = album.get("thumbnails", [])
        capa = miniaturas[-1]["url"] if miniaturas else "Sem capa"

        print("-" * 45)
        print("Álbum:", album.get("title", "Sem título"))
        print("Artista:", nomes_artistas or "Desconhecido")
        print("Ano:", album.get("year", "Desconhecido"))
        print("ID:", album.get("browseId", "Sem ID"))
        print("Capa:", capa)
