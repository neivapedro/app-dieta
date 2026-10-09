# De-para do banco de alimentos

O banco da aba Dieta (`src/dados/alimentos.json`, 665 itens) junta três fontes:

1. **TACO 4ª edição (NEPA/Unicamp):** 590 alimentos brasileiros por 100 g. CSV em [raulfdm/taco-api](https://github.com/raulfdm/taco-api).
2. **Planilha Gorgonoidiana:** os 32 itens da aba de alimentos, conferidos abaixo.
3. **Rótulos e USDA:** produtos de marca e itens que a TACO não tem (whey, pasta de amendoim, Pão Pullman, gelatina zero, tilápia, wrap etc.).

**Regras aplicadas a todas as fontes:**

- **Sempre pronto:** o alimento é pesado depois de preparado. As 101 versões cruas de carnes, peixes, ovos, feijões e leguminosas, arroz, massas e tubérculos ficam fora da busca. Elas continuam no arquivo, para um plano antigo não quebrar. Ficam visíveis: verduras, legumes e frutas cruas (salada), aveia, amendoim, e o salmão e o atum crus (sashimi).
- **Carnes prontas incluídas além da TACO:**
  - carne moída de patinho cozida, fraldinha grelhada, carne de sol grelhada (IBGE/POF), hambúrguer artesanal grelhado;
  - frango: peito assado, coxa sem pele assada, asa assada, moela cozida;
  - bacon frito, linguiça calabresa, salsicha;
  - ovo mexido, atum fresco grelhado, tilápia frita;
  - acompanhamentos: batata-doce assada, inhame, grão-de-bico e guandu cozidos.
- **Só existiam crus na TACO:** corvinas, pescadinha, porquinho, tucunaré, fígado de frango, orelha e rabo de porco e canjica ganharam uma versão pronta **estimada** pelo rendimento (peixe e fígado assados ≈ 75% do peso cru; orelha e rabo cozidos ≈ 85%; canjica cozida ≈ 2,6× o peso crua). O nome traz "(estimado)".

- **kcal:** o app sempre calcula as kcal pelos macros (proteína 4, carbo 4, gordura 9), como a planilha de dieta. Assim o total do plano bate com a soma dos macros.
- **Proteína animal:** carnes, peixes, ovos, leite e derivados, whey/albumina e pratos com carne contam como **proteína animal**. O resto conta como **proteína vegetal**.
- **Linhas da TACO sem dados:** iogurte de abacaxi, aguardente, sal, coco verde e o leite integral e desnatado UHT foram descartados. Os dois leites foram repostos com valores médios de rótulo.

## Itens da Gorgonoidiana

Valores na porção da planilha. P / C / G em gramas. "kcal app" = 4/4/9 aplicado aos valores do app na mesma porção.

| Item na planilha (porção) | Planilha P / C / G · kcal | No app | P / C / G · kcal app | Situação |
|---|---|---|---|---|
| Arroz branco cozido (100 g) | 2 / 24 / 0,25 · 109 | Arroz, tipo 1, cozido (TACO) | 2,5 / 28,1 / 0,2 · 124 | Corrigido pela TACO |
| Macarrão caseiro cozido (100 g) | 3 / 22 / 0 · 105 | Macarrão, trigo, cozido (USDA) | 5,8 / 30,9 / 0,9 · 155 | Corrigido. A planilha subestimava |
| Farinha de aveia (100 g) | 16 / 60 / 7 · 374 | Farinha de aveia (USDA) | 14,7 / 65,7 / 9,1 · 403 | Ajustado |
| Aveia em flocos crua (100 g) | 14 / 57 / 7 · 353 | Aveia, flocos, crua (TACO) | 13,9 / 66,6 / 8,5 · 398 | Corrigido (carbo) |
| Iogurte desnatado (100 g) | 4 / 5 / 0 · 43 | Iogurte, natural, desnatado (TACO) | 3,8 / 5,8 / 0,3 · 41 | Confere |
| Pão de forma integral (100 g) | 8 / 48 / 2 · 240 | Pão, trigo, forma, integral (TACO) | 9,4 / 49,9 / 3,7 · 271 | Ajustado |
| Banana prata (100 g) | 1 / 23 / 0 · 89 | Banana, prata, crua (TACO) | 1,3 / 26,0 / 0,1 · 110 | Ajustado |
| Maçã (100 g) | 0,3 / 14 / 0,17 · 86 | Maçã, Fuji, com casca, crua (TACO) | 0,3 / 15,2 / 0 · 62 | Corrigido. As 86 kcal da planilha não batem com os macros |
| Peito de frango grelhado (100 g) | 23 / 0 / 1 · 104 | Frango, peito, sem pele, grelhado (TACO) | 32,0 / 0 / 2,5 · 151 | Corrigido. A planilha usava valores de peito cru |
| Leite desnatado (200 g) | 6 / 10 / 0 · 70 | Leite, de vaca, desnatado (rótulo médio) | 6,2 / 9,6 / 0,2 · 65 | Confere |
| Patinho (100 g) | 29 / 0 / 7 · 185 | Carne, bovina, patinho, sem gordura, grelhado (TACO) | 35,9 / 0 / 7,3 · 209 | Ajustado |
| Contra-filé (porção "%") | 25 / 0 / 20 · 297 | Contra-filé com e sem gordura, grelhado (TACO) | 32,4 / 0 / 15,5 · 269 (com gordura) | Corrigido. A porção da planilha era inválida |
| Ovo inteiro (50 g) | 6 / 0 / 5,5 · 75,5 | Ovo, de galinha, inteiro, cozido (TACO) | 6,7 / 0,3 / 4,8 · 70 | Confere |
| Clara de ovo (33 g) | 3 / 0 / 0 · 15 | Ovo, de galinha, clara, cozida (TACO) | 4,4 / 0 / 0 · 18 | Ajustado |
| Salmão cozido (100 g) | 27 / 0 / 8 · 113 | Salmão, sem pele, fresco, grelhado (TACO) | 26,1 / 0 / 14,5 · 235 | Corrigido. As 113 kcal da planilha não batem com os macros |
| Queijo cottage (100 g) | 12 / 3 / 4 · 102 | Queijo cottage (USDA) | 11,1 / 3,4 / 4,3 · 97 | Confere |
| Azeite extra virgem (10 ml) | 0 / 0 / 9,2 · 83 | Azeite, de oliva, extra virgem (TACO) | 0 / 0 / 9,2 · 83 (≈ 10 ml) | Confere. No app, colher de sopa = 13 g |
| Óleo de coco (10 ml) | 0 / 0 / 9,9 · 89 | Óleo de coco (USDA) | 0 / 0 / 9,2 · 83 (≈ 10 ml) | Ajustado pela densidade |
| Castanha-do-pará (100 g) | 17 / 7 / 67 · 699 | Castanha-do-Brasil, crua (TACO) | 14,5 / 15,1 / 63,5 · 690 | Ajustado |
| Amendoim cru (100 g) | 20 / 20 / 45 · 500 | Amendoim, grão, cru (TACO) | 27,2 / 20,3 / 43,9 · 585 | Corrigido. A planilha subestimava |
| Óleo de peixe / ômega 3 (10 ml) | 0 / 0 / 10 · 90 | Óleo de peixe (ômega 3) | por cápsula de 1 g | Mantido |
| Abacate (100 g) | 2 / 9 / 15 · 160 | Abacate, cru (TACO) + Avocado (Hass) (USDA) | 1,2 / 6,0 / 8,4 · 105 · Hass: 2 / 8,5 / 14,7 · 174 | Os dois no app. A planilha usava avocado |
| Margarina light (10 g) | 0 / 0 / 3,9 · 35,7 | Margarina light | igual | Mantido (rótulo) |
| Amêndoa (100 g) | 19 / 20 / 45 · 640 | Amêndoa, torrada, salgada (TACO) | 18,6 / 29,5 / 47,3 · 618 | Ajustado |
| Whey 100% PowerFoods, Whey Isolada PowerFoods, Top Whey 3W, Premium Whey Nutrata, Albumina Growth, Dextrose Growth, BCAA PowerFoods, Hipercalórico caseiro | rótulos | mesmos nomes | iguais | Mantidos (rótulo). kcal pelos macros |

## Itens da planilha "Dieta - Pedro Neiva"

A planilha não tinha macros preenchidos. Cada item foi ligado a um alimento do banco:

| Na planilha | No app |
|---|---|
| Fatia pão Pullman | Pão de forma tradicional (Pullman) · fatia 25 g · rótulo |
| Ovos (c/ gema) | Ovo, de galinha, inteiro, cozido (TACO) · unidade 50 g |
| Xícara de café s/ açúcar | Café preto sem açúcar · xícara 150 ml |
| Dose Whey Growth | Whey Protein Concentrado 80% (Growth) · dose 30 g |
| Arroz | Arroz, tipo 1, cozido (TACO) |
| Feijão | Feijão, carioca, cozido (TACO) |
| Carne bovina | Carne, bovina, patinho, sem gordura, grelhado (TACO). Troque pelo corte que usar |
| Laranjas | Laranja, pêra, crua (TACO) · unidade 150 g |
| Banana Prata | Banana, prata, crua (TACO) · unidade 65 g |
| Fatia mussarela | Queijo, mozarela (TACO) · fatia 15 g |
| Fatia de mortadela | Mortadela (TACO) · fatia 15 g |
| Colher sopa Doctor Peanut | Pasta de amendoim Dr. Peanut (saborizada) · colher de sopa 15 g |
| Gelatina sem açúcar | Gelatina zero açúcar (preparada) |

**Produtos de marca:** os valores vêm de bases públicas de rótulos (FatSecret/Open Food Facts) e mudam conforme o sabor e o lote. Se a embalagem do seu produto for diferente, vale trocar pelo item genérico mais próximo.
