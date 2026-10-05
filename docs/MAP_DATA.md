# Dados do mapa

## O que o PDF é

`MAPA SantaJuliana.pdf` é a planta do perímetro urbano da Prefeitura, com a legenda **atualizado em 07/2021**. É um desenho esquemático. Não é um arquivo georreferenciado.

Por isso o seed usa o PDF só para:

- nome oficial
- nome antigo e nome popular escritos no rótulo
- bairro identificado por rótulo
- praça e equipamento público nomeados

`source = "Prefeitura Santa Juliana"` e `source_date = "2021-07"`.

## O que o PDF não é

Não há latitude nem longitude de rua neste repositório. `geometry` fica `null` e `verified` fica `false`. Bairro não foi atribuído a rua nenhuma: a proximidade visual no desenho não é uma evidência segura.

O centro do mapa é outra fonte. A Câmara Municipal de Santa Juliana publica a sede em 19°18′32″S e 47°31′27″W. Isso vira `cities.center_lat/center_lng` e o centro inicial do MapLibre. Não foi medido no PDF.

## Como o texto foi lido

Vários rótulos estão com as letras separadas por espaço (`R U A E L M A R...`). O seed junta essas letras e separa o nome pelos conectivos `de`, `da`, `do`, `dos` e `das`, conferindo com os nomes que o mapa escreve por extenso. Grafia sem acento foi mantida quando a camada de texto do PDF não tem o acento, por exemplo Antonio, Euripedes, Ezio, Lucilia e Alvaro Garrucha.

Nomes antigos encontrados no próprio rótulo, entre outros:

| Nome oficial | Nome antigo |
| --- | --- |
| Rua Orivaldo José Pires | Lírios |
| Rua Elmar Goulart de Andrade | Girassóis |
| Rua Antonio Gonçalves da Cunha | Violetas |
| Rua Euripedes Patrocinio de Morais | Orquídeas |
| Rua Ezio Borges de Souza | Hortênsias |
| Rua Adelaide Maria Ribeiro do Prado | Jasmins |
| Rua Joaquim Naves Tito | Jacarandás e Maranhão |
| Rua Antonio Ferreira Neto | Ipês, também chamado Antonio Carteiro |
| Rua Cleonaldo Clemente | Acácias |
| Rua Lucilia Cintra Castro | Cedros |
| Rua Maria Abadia Messias | Cerejeiras |
| Rua José Ferreira de Paiva | Gameleira |
| Rua Nicanor Jonas de Oliveira | Palmeiras |
| Rua Nigrim Carneiro | Pau Brasil |
| Rua Jesus Rosa Ferreira | Rio de Janeiro |
| Rua Ana Borges de Oliveira | São Paulo |
| Rua Fabio Miranda de Menezes | Minas Gerais |
| Rua Marcos Antonio de Oliveira | Paineiras |
| Rua João Marques de Oliveira | Aroeiras |

O mapa de 2021 também pode estar desatualizado. Correção de campo entra como `PENDING` e só muda a rua quando um editor aprova e grava a alteração.

Nome antigo não cria outra rua. O alias aponta para a mesma `streets.id`, e `street_name_history` guarda a troca com fonte, data e quem conferiu. O seed entra com `confidence_score = 70`: fonte oficial, sem revisão local. Marcar a rua como verificada no editor sobe a confiança para 100. A busca mostra o nome atual e avisa quando o texto usou o nome antigo, sem tratar a troca de 2021 como verdade absoluta.

## Onde editar

`/admin/mapa` altera nome, nome antigo, bairro, sentido por segmento, restrição de conversão e a linha desenhada no mapa. A linha nova é uma geometria informada pelo editor, não uma estimativa do PDF.
