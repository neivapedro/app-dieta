"""Gera src/dados/alimentos.json a partir da TACO + itens extras (marcas, suplementos, USDA).
Uso: python3 -I gerar_alimentos.py <pasta_csv_taco> <saida_json>
Valores por 100 g. Cada item: [id, nome, grupo, prot, carb, gord, fibra, animal(0/1), porcoes, fonte, apelidos, oculto(0/1)]
O alimento é sempre pesado PRONTO: versões cruas de carnes, peixes, ovos, feijões, arroz,
massas e tubérculos ficam ocultas na busca (continuam no arquivo para planos antigos).
Fonte da TACO em CSV: https://github.com/raulfdm/taco-api (references/csv)
"""
import csv, json, re, sys

pasta, saida = sys.argv[1], sys.argv[2]
cats = {r['id']: r['name'] for r in csv.DictReader(open(f'{pasta}/categories.csv', encoding='utf-8'))}
foods = list(csv.DictReader(open(f'{pasta}/food.csv', encoding='utf-8')))
nut = {r['foodId']: r for r in csv.DictReader(open(f'{pasta}/nutrients.csv', encoding='utf-8'))}

GRUPO = {
    '1': 'Cereais e pães', '2': 'Verduras, legumes e tubérculos', '3': 'Frutas', '4': 'Óleos e gorduras',
    '5': 'Peixes e frutos do mar', '6': 'Carnes', '7': 'Leite e derivados', '8': 'Bebidas', '9': 'Ovos',
    '10': 'Doces', '11': 'Diversos', '12': 'Industrializados', '13': 'Pratos prontos', '14': 'Leguminosas',
    '15': 'Castanhas e sementes',
}
ANIMAL_CATS = {'5', '6', '7', '9'}
# Itens de outras categorias cuja proteína vem principalmente de origem animal.
# Gelatina (515) fica fora: colágeno não conta na meta de proteína animal.
ANIMAL_IDS = {'20', '55', '56', '57', '58', '140', '141', '495', '496', '497', '501',
              '526', '528', '544', '529', '531', '532', '536', '537', '538', '539', '540', '541', '542', '543',
              '547', '548', '553', '554', '555', '556'}
# Linhas sem dados na TACO: descartadas ou substituídas por valores de rótulo
DESCARTAR = {'450', '472', '516', '517', '591', '457', '458'}

def f(v):
    try:
        return round(float(v), 2)
    except ValueError:
        return 0.0

def limpar(nome):
    nome = nome.replace('cozido/10minutos', 'cozido').replace('cozida/10minutos', 'cozida')
    nome = nome.replace('mingnon', 'mignon').replace('congelado,cozido', 'congelado, cozido')
    nome = re.sub(r'\s+', ' ', nome).strip()
    return nome

PORCOES = [
    (r'^Ovo, de galinha, inteiro', [('unidade', 50)]),
    (r'^Ovo, de galinha, clara', [('unidade', 33)]),
    (r'^Ovo, de galinha, gema', [('unidade', 17)]),
    (r'^Ovo, de codorna', [('unidade', 10)]),
    (r'^Omelete', [('unidade (2 ovos)', 120)]),
    (r'^Pão, trigo, francês', [('unidade', 50)]),
    (r'^Pão, (trigo, forma|aveia, forma|glúten|milho, forma|de soja)', [('fatia', 25)]),
    (r'^Pão, trigo, sovado', [('unidade', 50)]),
    (r'^Pão, de queijo, assado', [('unidade média', 40)]),
    (r'^Torrada', [('unidade', 10)]),
    (r'^Biscoito, salgado, cream cracker', [('unidade', 6)]),
    (r'^Biscoito, doce, maisena', [('unidade', 5)]),
    (r'^Queijo, (mozarela|prato|minas|pasteurizado)', [('fatia', 15)]),
    (r'^Queijo, parmesão', [('colher de sopa (ralado)', 10)]),
    (r'^Queijo, (requeijão|ricota)', [('colher de sopa', 30)]),
    (r'^(Mortadela|Presunto|Salame|Apresuntado)', [('fatia', 15)]),
    (r'^Salsicha', [('unidade', 50)]),
    (r'^Banana, doce em barra', [('unidade', 25)]),
    (r'^Banana, da terra', [('unidade', 150)]),
    (r'^Banana', [('unidade', 65)]),
    (r'^Laranja, .*, crua', [('unidade', 150)]),
    (r'^(Laranja|Limão|Abacaxi|Maracujá|Uva|Tangerina), .*suco', [('copo', 200)]),
    (r'^Tangerina', [('unidade', 135)]),
    (r'^Maçã', [('unidade', 130)]),
    (r'^Pêra', [('unidade', 130)]),
    (r'^Kiwi', [('unidade', 75)]),
    (r'^Morango', [('unidade', 12)]),
    (r'^Mamão.*calda', [('pedaço', 30)]),
    (r'^Mamão', [('fatia', 150)]),
    (r'^Manga, polpa', [('pacote', 100)]),
    (r'^Manga', [('unidade', 300)]),
    (r'^Melancia|^Melão', [('fatia', 200)]),
    (r'^Arroz.*cozido', [('colher de sopa cheia', 25), ('escumadeira', 90)]),
    (r'^Feijão.*cozido', [('concha', 140)]),
    (r'^Lentilha, cozida|^Grão-de-bico', [('concha', 140)]),
    (r'^(Azeite|Óleo)', [('colher de sopa', 13), ('colher de chá', 4)]),
    (r'^(Manteiga|Margarina)', [('colher de chá', 5)]),
    (r'^Mel|^Melado', [('colher de sopa', 20)]),
    (r'^Açúcar', [('colher de chá', 5)]),
    (r'^Leite, de vaca, .*pó', [('colher de sopa', 15)]),
    (r'^Leite, de vaca', [('copo', 200)]),
    (r'^Iogurte', [('pote', 170)]),
    (r'^Café, infusão', [('cafezinho', 50), ('xícara', 150)]),
    (r'^Aveia', [('colher de sopa', 15)]),
    (r'^Linhaça', [('colher de sopa', 10)]),
    (r'^Amendoim', [('colher de sopa', 15)]),
    (r'^Castanha-do-Brasil', [('unidade', 4)]),
    (r'^Castanha-de-caju', [('unidade', 2.5)]),
    (r'^(Refrigerante|Cerveja)', [('lata', 350)]),
    (r'^Tapioca, com manteiga', [('unidade', 100)]),
    (r'^Pastel', [('unidade', 60)]),
    (r'^Coxinha|^Empada|^Quibe,', [('unidade', 80)]),
    (r'^Hambúrguer', [('unidade', 90)]),
]

APELIDOS = [
    (r'mozarela', 'mussarela muçarela'),
    (r'^Castanha-do-Brasil', 'castanha do pará'),
    (r'^Pêra', 'pera'),
    (r'^Carne, bovina', 'carne vermelha boi'),
    (r'^Frango, peito', 'filé de frango'),
    (r'^Batata, baroa', 'mandioquinha'),
    (r'^Mandioca', 'aipim macaxeira'),
    (r'^Pão, trigo, francês', 'pão de sal cacetinho'),
    (r'^Queijo, minas', 'queijo branco'),
    (r'^Ovo, de galinha', 'ovos'),
    (r'^Feijão', 'feijao'),
    (r'^Queijo, requeijão', 'requeijao'),
    (r'^Carne, bovina, acém, moído', 'carne moída'),
    (r'^Lingüiça, porco', 'linguiça toscana'),
    (r'^Lingüiça, frango', 'linguiça de frango'),
    (r'^Frango, peito, sem pele, cozido', 'frango desfiado'),
    (r'^Frango, inteiro, sem pele, assado', 'frango assado'),
    (r'^Salmão, sem pele, fresco, cru', 'sashimi sushi'),
    (r'^Tilápia', 'saint peter'),
    (r'^Ovo, de galinha, inteiro, cozido', 'pochê'),
    (r'^Carne, bovina, charque', 'jabá'),
    (r'^Carne, bovina, seca', 'jabá'),
    (r'^Toucinho', 'torresmo'),
    (r'^Peru, congelado, assado', 'peito de peru assado'),
    (r'^Carne, bovina, músculo', 'carne de panela'),
    (r'^Grão-de-bico', 'grao de bico'),
    (r'^Banana, doce em barra', 'bananinha'),
]

# Sempre se pesa o alimento pronto: cru some da busca, exceto o que se come cru
CRU = re.compile(r'\bcru(a|s|as)?\b')
GRUPOS_COZIDOS = {'Carnes', 'Peixes e frutos do mar', 'Ovos', 'Leguminosas'}
CRU_VISIVEL = {'t278', 't316', 't557', 't485'}  # atum e salmão (sashimi), amendoim, ovo de codorna (pesa igual cozido)
CRU_OCULTO = {'t2', 't4', 't6', 't19', 't38', 't40', 't41', 't55', 't57', 't59', 't87', 't89', 't92', 't103', 't126',
              't130', 't141', 'x26'}

def oculto(i, nome, grupo):
    if i in CRU_VISIVEL or not CRU.search(nome):
        return False
    return grupo in GRUPOS_COZIDOS or i in CRU_OCULTO

def apelidos(nome):
    return ' '.join(a for pad, a in APELIDOS if re.search(pad, nome))

def porcoes(nome):
    for pad, lista in PORCOES:
        if re.search(pad, nome):
            return lista
    return []

itens = []
for r in foods:
    i = r['id']
    if i in DESCARTAR:
        continue
    n = nut[i]
    if not n['kcal'].strip():
        continue
    nome = limpar(r['name'])
    animal = r['categoryId'] in ANIMAL_CATS or i in ANIMAL_IDS
    itens.append([f't{i}', nome, GRUPO[r['categoryId']], f(n['protein']), f(n['carbohydrates']), f(n['lipids']),
                  f(n['dietaryFiber']), 1 if animal else 0, porcoes(nome), 'TACO'])


# Extras: (id, nome, grupo, prot, carb, gord, fibra, animal, porcoes, fonte) por 100 g
SUP, PAO, CARNE, LEITE, GORD, OUT = 'Suplementos', 'Cereais e pães', 'Carnes', 'Leite e derivados', 'Óleos e gorduras', 'Diversos'
POR30 = lambda p, c, g, gr=30: (round(p * 100 / gr, 2), round(c * 100 / gr, 2), round(g * 100 / gr, 2))
extras = [
    ('x01', 'Whey Protein Concentrado 80% (Growth)', SUP, 80.0, 10.0, 6.7, 0, 1, [('dose', 30)], 'Rótulo (Growth/FatSecret)'),
    ('x02', 'Whey Protein Isolado (genérico)', SUP, 90.0, 3.3, 1.0, 0, 1, [('dose', 30)], 'Rótulo médio'),
    ('x03', 'Whey 100% (PowerFoods)', SUP, *POR30(23.7, 2.94, 0.9), 0, 1, [('dose', 30)], 'Gorgonoidiana (rótulo)'),
    ('x04', 'Whey Isolado (PowerFoods)', SUP, *POR30(27, 1, 0), 0, 1, [('dose', 30)], 'Gorgonoidiana (rótulo)'),
    ('x05', 'Top Whey 3W (Max Titanium)', SUP, *POR30(24, 1.5, 1.5), 0, 1, [('dose', 30)], 'Gorgonoidiana (rótulo)'),
    ('x06', 'Premium Whey (Nutrata)', SUP, *POR30(21, 5.5, 0), 0, 1, [('dose', 30)], 'Gorgonoidiana (rótulo)'),
    ('x07', 'Albumina (Growth)', SUP, *POR30(24, 1.6, 0.2, 28), 0, 1, [('dose', 28)], 'Gorgonoidiana (rótulo)'),
    ('x08', 'Dextrose (Growth)', SUP, 0, 96.0, 0, 0, 0, [('dose', 50)], 'Gorgonoidiana (rótulo)'),
    ('x09', 'Maltodextrina', SUP, 0, 95.0, 0, 0, 0, [('colher de sopa', 15)], 'Rótulo médio'),
    ('x10', 'Hipercalórico caseiro', SUP, 34.0, 43.3, 7.8, 0, 1, [], 'Gorgonoidiana'),
    ('x11', 'BCAA em pó (PowerFoods)', SUP, 100.0, 0, 0, 0, 0, [('dose', 5)], 'Gorgonoidiana (rótulo)'),
    ('x12', 'Creatina', SUP, 0, 0, 0, 0, 0, [('dose', 3)], 'Rótulo'),
    ('x13', 'Barra de proteína (média, 20 g de proteína)', SUP, 33.0, 30.0, 13.0, 8, 1, [('unidade', 60)], 'Rótulo médio'),
    ('x14', 'Colágeno hidrolisado', SUP, 90.0, 0, 0, 0, 0, [('dose', 10)], 'Rótulo médio'),
    ('x15', 'Pão de forma tradicional (Pullman)', PAO, 8.8, 48.0, 2.6, 2.5, 0, [('fatia', 25)], 'Rótulo (Pullman/FatSecret)'),
    ('x16', 'Pão de hambúrguer', PAO, 9.0, 50.0, 4.0, 2.3, 0, [('unidade', 50)], 'USDA'),
    ('x17', 'Tortilha de trigo (wrap, Rap10)', PAO, 8.3, 51.6, 8.0, 3.5, 0, [('unidade', 40)], 'USDA'),
    ('x18', 'Pão sírio (pita)', PAO, 9.1, 55.7, 1.2, 2.2, 0, [('unidade', 60)], 'USDA'),
    ('x19', 'Macarrão, trigo, cozido', PAO, 5.8, 30.9, 0.9, 1.8, 0, [('pegador', 110)], 'USDA'),
    ('x20', 'Macarrão integral, cozido', PAO, 6.0, 30.1, 1.7, 3.9, 0, [('pegador', 110)], 'USDA'),
    ('x21', 'Goma de tapioca hidratada', PAO, 0, 58.0, 0, 0, 0, [('tapioca média', 60)], 'Rótulo médio'),
    ('x22', 'Biscoito de arroz (rice cake)', PAO, 8.2, 81.5, 2.8, 4.2, 0, [('unidade', 9)], 'USDA'),
    ('x23', 'Granola tradicional', PAO, 9.0, 68.0, 10.0, 7, 0, [('colher de sopa', 10)], 'Rótulo médio'),
    ('x24', 'Farinha de aveia', PAO, 14.7, 65.7, 9.1, 6.5, 0, [('colher de sopa', 15)], 'USDA'),
    ('x25', 'Tilápia, filé, grelhado', 'Peixes e frutos do mar', 26.2, 0, 2.7, 0, 1, [('filé', 120)], 'USDA'),
    ('x26', 'Tilápia, filé, cru', 'Peixes e frutos do mar', 20.1, 0, 1.7, 0, 1, [('filé', 150)], 'USDA'),
    ('x27', 'Atum em conserva, em água (drenado)', 'Peixes e frutos do mar', 24.0, 0, 1.0, 0, 1, [('lata drenada', 120)], 'Rótulo médio'),
    ('x28', 'Peito de peru defumado (fatiado)', CARNE, 16.0, 3.3, 2.3, 0, 1, [('fatia', 15)], 'Rótulo médio'),
    ('x29', 'Clara de ovo pasteurizada (líquida)', 'Ovos', 10.9, 0.7, 0.2, 0, 1, [('clara', 33)], 'USDA'),
    ('x30', 'Queijo cottage', LEITE, 11.1, 3.4, 4.3, 0, 1, [('colher de sopa', 30)], 'USDA'),
    ('x31', 'Iogurte grego tradicional (adoçado)', LEITE, 4.6, 15.0, 5.7, 0, 1, [('pote', 100)], 'Rótulo médio'),
    ('x32', 'Iogurte natural tipo grego (sem açúcar)', LEITE, 6.0, 4.5, 5.0, 0, 1, [('pote', 100)], 'Rótulo médio'),
    ('x33', 'Iogurte proteico (15 g de proteína)', LEITE, 9.4, 4.4, 0.6, 0, 1, [('pote', 160)], 'Rótulo médio'),
    ('x34', 'Cream cheese', LEITE, 5.9, 4.1, 34.2, 0, 1, [('colher de sopa', 15)], 'USDA'),
    ('x35', 'Leite, de vaca, integral', LEITE, 3.0, 4.5, 3.0, 0, 1, [('copo', 200)], 'Rótulo médio'),
    ('x36', 'Leite, de vaca, desnatado', LEITE, 3.1, 4.8, 0.1, 0, 1, [('copo', 200)], 'Rótulo médio'),
    ('x37', 'Pasta de amendoim integral', GORD, 27.0, 16.0, 50.0, 8, 0, [('colher de sopa', 15)], 'Rótulo médio'),
    ('x38', 'Pasta de amendoim Dr. Peanut (saborizada)', GORD, 18.7, 23.3, 48.7, 5, 0, [('colher de sopa', 15)], 'Rótulo (Dr. Peanut/FatSecret)'),
    ('x39', 'Óleo de coco', GORD, 0, 0, 100.0, 0, 0, [('colher de sopa', 13), ('colher de chá', 4)], 'USDA'),
    ('x40', 'Óleo de peixe (ômega 3)', GORD, 0, 0, 100.0, 0, 1, [('cápsula', 1)], 'Gorgonoidiana'),
    ('x41', 'Avocado (Hass)', 'Frutas', 2.0, 8.5, 14.7, 6.7, 0, [('unidade', 140)], 'USDA'),
    ('x42', 'Chia, semente', 'Castanhas e sementes', 16.5, 42.1, 30.7, 34.4, 0, [('colher de sopa', 10)], 'USDA'),
    ('x43', 'Margarina light', GORD, 0, 0, 39.0, 0, 0, [('colher de chá', 5)], 'Gorgonoidiana (rótulo)'),
    ('x44', 'Gelatina zero açúcar (preparada)', OUT, 1.5, 0.5, 0, 0, 0, [('porção', 120)], 'Rótulo (Royal/FatSecret)'),
    ('x45', 'Gelatina tradicional (preparada)', OUT, 1.3, 14.0, 0, 0, 0, [('porção', 120)], 'Rótulo médio'),
    ('x46', 'Refrigerante zero / água com gás', 'Bebidas', 0, 0, 0, 0, 0, [('lata', 350)], 'Rótulo'),
    ('x47', 'Chocolate amargo 70%', 'Doces', 7.8, 45.9, 42.6, 10.9, 0, [('quadradinho', 5)], 'USDA'),
    ('x48', 'Café preto sem açúcar', 'Bebidas', 0.1, 0, 0, 0, 0, [('cafezinho', 50), ('xícara', 150)], 'USDA'),
    # Carnes prontas comuns que a TACO não tem
    ('x49', 'Carne moída de patinho, cozida/refogada', CARNE, 35.9, 0, 7.3, 0, 1, [('colher de sopa', 25)], 'TACO (patinho cozido)'),
    ('x50', 'Fraldinha, grelhada', CARNE, 27.7, 0, 8.2, 0, 1, [], 'USDA (flank grelhado)'),
    ('x51', 'Carne de sol, grelhada', CARNE, 26.9, 0, 21.9, 0, 1, [], 'IBGE/POF'),
    ('x52', 'Hambúrguer artesanal bovino, grelhado', CARNE, 25.9, 0, 15.4, 0, 1, [('unidade (150 g)', 150)], 'USDA (85% magra)'),
    ('x53', 'Frango, peito, sem pele, assado', CARNE, 31.0, 0, 3.6, 0, 1, [], 'USDA'),
    ('x54', 'Frango, coxa, sem pele, assada', CARNE, 24.2, 0, 5.7, 0, 1, [('unidade', 60)], 'USDA'),
    ('x55', 'Frango, asa, com pele, assada', CARNE, 26.9, 0, 19.5, 0, 1, [('unidade', 35)], 'USDA'),
    ('x56', 'Frango, moela, cozida', CARNE, 30.4, 0, 2.7, 0, 1, [], 'USDA'),
    ('x57', 'Bacon, frito', CARNE, 37.0, 1.4, 41.8, 0, 1, [('fatia', 8)], 'USDA'),
    ('x58', 'Linguiça calabresa (defumada)', CARNE, 15.0, 1.8, 24.0, 0, 1, [('gomo', 80)], 'Rótulo médio'),
    ('x59', 'Salsicha', CARNE, 12.0, 5.0, 18.0, 0, 1, [('unidade', 50)], 'Rótulo médio'),
    ('x60', 'Ovo mexido', 'Ovos', 10.0, 1.6, 10.9, 0, 1, [('2 ovos', 110)], 'USDA'),
    ('x61', 'Atum fresco, grelhado', 'Peixes e frutos do mar', 29.2, 0, 0.6, 0, 1, [], 'USDA'),
    ('x62', 'Tilápia, filé, frita', 'Peixes e frutos do mar', 24.0, 0, 9.0, 0, 1, [('filé', 120)], 'USDA (peixe branco frito)'),
    # Acompanhamentos prontos que faltavam
    ('x63', 'Batata, doce, assada', 'Verduras, legumes e tubérculos', 2.0, 20.7, 0.2, 3.3, 0, [], 'USDA'),
    ('x65', 'Grão-de-bico, cozido', 'Leguminosas', 8.9, 27.4, 2.6, 7.6, 0, [('concha', 140)], 'USDA'),
    ('x66', 'Guandu, cozido', 'Leguminosas', 6.8, 23.3, 0.4, 6.7, 0, [('concha', 140)], 'USDA'),
    ('x64', 'Inhame, cozido', 'Verduras, legumes e tubérculos', 0.5, 34.6, 0.1, 5.1, 0, [], 'USDA (taro cozido)'),
]
for e in extras:
    i, nome, grupo, p, c, g, fib, a, por, fonte = e
    itens.append([i, nome, grupo, p, c, g, fib, a, por, fonte])

# Alimentos que na TACO só existem crus: versão pronta estimada pelo rendimento
# (peso pronto ÷ peso cru). Peixe e fígado grelhados/assados perdem ~25% de água;
# canjica cozida absorve água (~2,6×).
COZIDOS_ESTIMADOS = [
    ('t291', 'Corvina de água doce, assada (estimado)', 0.75),
    ('t292', 'Corvina do mar, assada (estimado)', 0.75),
    ('t310', 'Pescadinha, assada (estimado)', 0.75),
    ('t314', 'Porquinho (peixe), assado (estimado)', 0.75),
    ('t322', 'Tucunaré, filé, assado (estimado)', 0.75),
    ('t400', 'Frango, fígado, grelhado (estimado)', 0.75),
    ('t434', 'Porco, orelha, cozida (estimado)', 0.85),
    ('t437', 'Porco, rabo, cozido (estimado)', 0.85),
    ('t19', 'Canjica, branca, cozida (estimado)', 2.6),
]
por_id = {x[0]: x for x in itens}
for orig, nome, rendimento in COZIDOS_ESTIMADOS:
    x = por_id[orig]
    f = lambda v: round(v / rendimento, 2)
    itens.append([orig + 'p', nome, x[2], f(x[3]), f(x[4]), f(x[5]), f(x[6]), x[7], [], f'TACO cru ÷ rendimento {str(rendimento).replace(".", ",")}'])

ids = [x[0] for x in itens]
assert len(ids) == len(set(ids))
saida_itens = []
for x in itens:
    linha = [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], [[n, g] for n, g in x[8]], x[9], apelidos(x[1]),
             1 if oculto(x[0], x[1], x[2]) else 0]
    saida_itens.append(linha)
json.dump(saida_itens, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(sum(1 for x in saida_itens if x[11]), 'crus ocultos;', len(itens), 'alimentos;', sum(1 for x in itens if x[7]), 'com proteína animal;', sum(1 for x in itens if x[8]), 'com porção caseira')
