# app-dieta · Ciclo

App (PWA) de acompanhamento do ciclo de retatrutida e da composição corporal. Abre no navegador e pode ser instalado no celular. Tem login: cada conta só vê os próprios dados.

## O que o app faz

| Tela | Equivale a | Conteúdo |
|---|---|---|
| **Início** | Painel | Próxima dose (data, mg, UI, marcação prática, fase, local sugerido), medição de segunda, treino de hoje, dieta de hoje ("segui o plano?"), saldo do frasco e sobra depois do plano, registro do dia e antes × agora (medidas primeiro, com a meta) |
| **Ciclo → Agenda** | Diário + Semanal | Próximas aplicações projetadas e histórico (prevista × aplicada, atraso, saldo, peso médio e náusea máxima por semana) |
| **Ciclo → Plano** | Plano | Fases editáveis, "Repetir fase (+4 semanas)", conferência do consumo × quantidade disponível e regras para subir de fase |
| **Ciclo → Ajustes** | Painel (parâmetros) | Data da 1ª aplicação, quantidade (mg), concentração (mg/ml), intervalo e menor marcação da seringa |
| **Ciclo → Diário** | Diário | Peso, náusea (0 a 3), sintomas (vômito, diarreia, intestino preso) e observações em qualquer dia, com as aplicações e o "D+N" (dias depois da dose) na mesma linha do tempo |
| **Medidas** | % de Gordura (Gorgonoidiana) | % de gordura, massa magra e massa gorda; variação desde a anterior e desde a 1ª; até 3 leituras por medida (vale a média) com alerta de erro de digitação; resumo da semana ao salvar |
| **Dieta** | Dieta Pedro Neiva + Cálculo de Macros (Gorgonoidiana) | Gasto calórico, meta do dia, metas de macros e plano alimentar por refeição com o banco de alimentos |
| **Análise** | — | Resumo (medidas primeiro) e ritmo em % do peso por semana, peso × dose, composição e aderência por fase, náusea D0–D6 e sintomas por fase, aplicações com atraso, plano alimentar, treino e **Imprimir / PDF** para o médico |
| **Perfil** | — | Dados pessoais (inclui data de nascimento), lembretes, notificações do aparelho, backup (exportar/importar) |

### Regras de cálculo

- **Agenda recalculada pela última aplicação real.** A 1ª dose é na data de início. Cada dose seguinte cai na última aplicação + 7 dias. Exemplo: era quinta e você tomou na sexta, então a próxima passa para a sexta seguinte.
- **A fase é definida pelo número da aplicação** (1ª a 4ª = fase 1 etc.). Assim, um atraso não pula degraus de dose.
- **Conversão para seringa U-100:** `UI = mg ÷ concentração × 100`. A "marcação prática" arredonda para a menor marcação da seringa (padrão 0,5 UI) e mostra quantos mg ela realmente entrega.
- **Saldo** = quantidade total − soma das doses aplicadas. Também em ml e UI.
- **% de gordura** pelo método da Marinha dos EUA, em cm. Idêntico à planilha, inclusive o ajuste de +2 no masculino:
  - Masculino: `495 / (1,0324 − 0,19077·log10(cintura − pescoço) + 0,15456·log10(altura)) − 450 + 2`
  - Feminino: `495 / (1,29579 − 0,35004·log10(cintura + quadril − pescoço) + 0,221·log10(altura)) − 450`
  - Massa gorda = peso × %; massa magra = peso − massa gorda.
- O peso usado na análise une o Diário e as Medidas. No mesmo dia, vale a medição.
- O app avisa sobre aplicações com menos de 5 dias de intervalo (possível duplicidade), saldo insuficiente e plano que consome mais do que a quantidade disponível.

Os cálculos estão em `src/lib/` e têm testes em `src/lib/calculos.test.ts`, conferidos contra os valores calculados pelas planilhas.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes dos cálculos
```

O app usa o projeto Supabase configurado em `src/config.ts`. Para testar sem nuvem, com dados só no navegador, rode com `VITE_SUPABASE_URL=` vazio (veja `.env.example`).

## Colocar no ar

Mesmo método do Diário de Carga:

- **Endereço:** <https://neivapedro.github.io/app-dieta/>, pelo **GitHub Pages**.
- **Dados e login:** no **Supabase**, no mesmo projeto do Diário de Carga. As tabelas deste app têm nomes próprios e não mexem nas do treino, e o login é o mesmo nos dois apps.
- **Valores públicos:** já estão em `src/config.ts`. Ali ficam a URL do projeto, a chave publicável e a chave pública de notificação.

### 1. GitHub: publicação automática (uma vez)

1. **Settings → General → Danger Zone → Change visibility → Public.** O GitHub Pages grátis exige repositório público. Isso deixa visível o código, não os dados: cada conta só acessa as próprias linhas no Supabase.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. A partir daí, cada atualização da `main` roda os testes e publica o app sozinho (`.github/workflows/publicar.yml`).

### 2. Supabase: banco e lembretes (uma vez, no projeto do Diário de Carga)

1. **Edge Functions → Secrets:** cadastre `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:seu-email`) e `CRON_SECRET`.
2. **Edge Functions → Deploy a new function → Via Editor:**
   - Nome: `enviar-lembretes`.
   - Cole o conteúdo de `supabase/functions/enviar-lembretes/index.ts` e publique.
   - Nos detalhes da função, **desligue "Enforce JWT verification"**. A função valida o próprio CRON_SECRET.
3. **SQL Editor:** abra `supabase/configurar_tudo.sql`, troque o CRON_SECRET marcado no topo e clique em **Run**. O script cria as tabelas com Row Level Security, guarda os segredos no Vault e agenda os lembretes de hora em hora.
4. **Authentication → URL Configuration → Redirect URLs:** adicione `https://neivapedro.github.io/app-dieta/**`. Isso é usado nos links de confirmação e de troca de senha. O *Site URL* do Diário de Carga continua como está.

### 3. Instalar no celular

Abra <https://neivapedro.github.io/app-dieta/> e entre com o mesmo e-mail e senha do Diário de Carga.

- **Android (Chrome):** abra o site, toque em ⋮ → **Instalar app**. Depois, vá em Perfil → **Ativar notificações** → **Enviar teste**.
- **iPhone (Safari, iOS 16.4+):** toque em Compartilhar → **Adicionar à Tela de Início** e abra pelo ícone. Depois, vá em Perfil → **Ativar notificações**. No iPhone, o push só funciona com o app instalado.

Ative as notificações em cada aparelho que for usar.

### Calendário do iPhone (opcional)

Coloca todas as doses do plano no Calendário do iPhone. É um calendário **assinado**: quando uma dose atrasa ou o plano muda, as datas se ajustam sozinhas.

1. No **SQL Editor**, rode `supabase/migrations/20261009000000_calendario.sql`. Ele cria o endereço secreto de cada conta.
2. Em **Edge Functions → Deploy a new function → Via Editor**:
   - Nome: `calendario`.
   - Cole `supabase/functions/calendario/index.ts` e publique.
   - Nos detalhes da função, **desligue a verificação de JWT**.
3. No app, vá em **Perfil → Adicionar ao Calendário** e confirme em **Assinar**.

Detalhes:
- Cada conta tem um endereço secreto próprio (`perfis.token_calendario`).
- **Perfil → Gerar novo endereço** invalida o endereço antigo.

### Aba Dieta (todas as contas)

- **Basal (TMB) pela Katch-McArdle:** `370 + 21,6 × massa magra`. A massa magra vem da última medição (fórmula da Gorgonoidiana), então a meta se atualiza sozinha a cada medição. Para conferência, o app mostra também Mifflin-St Jeor e Harris-Benedict (a fórmula das duas planilhas), que exigem a data de nascimento no Perfil.
- **Gasto total** = basal × fator do dia a dia (sentado 1,2 · em pé 1,3 · braçal 1,45) + média diária dos exercícios (Σ kcal da sessão × vezes por semana ÷ 7).
- **Meta do dia** = gasto total ± déficit/superávit em kcal.
- **Macros:** proteína animal em g/kg de **massa magra** (padrão 2), gordura em g/kg de **peso** (padrão 1). O **carboidrato fecha a conta**: `(meta − ptn animal × 4 − gordura × 9 − ptn vegetal do plano × 4) ÷ 4`. A proteína vegetal (arroz, feijão, pão…) aparece separada, sem meta, e consome kcal do carbo.
- **Plano:** refeições com alimento, quantidade (g ou porção caseira: fatia, unidade, dose…) e Ptn A, Ptn V, Carb, Gord e kcal de cada item, por refeição e no total. A barra "Falta", fixa no rodapé, mostra quanto ainda falta de cada macro enquanto você monta e simula. As kcal sempre vêm dos macros (4/4/9).
- **Banco de alimentos** (`src/dados/alimentos.json`, sem tela própria): 665 itens. São 590 da TACO (Unicamp, 4ª ed.), os da planilha Gorgonoidiana revisados, marcas, suplementos e carnes prontas comuns que a TACO não tem. **O alimento é sempre pesado pronto:** as versões cruas de carnes, peixes, ovos, feijões, arroz, massas e tubérculos não aparecem na busca. Saladas, frutas e o peixe de sashimi continuam crus. O de-para está em `docs/alimentos-depara.md`. Para regenerar: `python3 scripts/gerar_alimentos.py <pasta csv da TACO> src/dados/alimentos.json`.

Para ativar: no **SQL Editor**, rode `supabase/ativar_dieta.sql`. A parte 2 é opcional e já monta o plano da planilha numa conta; antes, troque o e-mail.

### Aba Treino (só para contas liberadas)

Acompanhamento do treino durante o ciclo:
- **Check diário:** 1 treino e 1 cardio por dia, sem folga. O cardio é corrida de 5 km na quarta e no domingo, e bike de 30 min nos demais dias.
- **Placar:** aderência, sequência e projeção.
- **Grade:** calendário do período com o check de cada dia.
- **Medidas:** início × agora × meta.
- **Aderência semanal × medidas:** comparada com a medição de toda segunda.
- **Pace das corridas.**

O período vai da 1ª aplicação até 7 dias depois da última.

Para ativar:
1. No **SQL Editor**, rode `supabase/migrations/20261010000000_treino.sql`.
2. Rode `supabase/ativar_treino_pedro.sql`, trocando o e-mail. O e-mail fica só no banco, nunca no código.

### Como os lembretes funcionam

O `pg_cron` chama a função `enviar-lembretes` a cada 15 minutos (migração `20261012000000_melhorias.sql`). Para cada usuário, a função calcula a próxima dose com a mesma regra do app: última aplicação real + intervalo, ou a data de início se ainda não houver aplicação.

- O lembrete é enviado a partir do horário escolhido no Perfil (padrão 08:00), no fuso do usuário, uma vez por dia.
- Se a dose atrasar, o lembrete se repete diariamente, por até 14 dias, até a aplicação ser registrada.
- Quando a sua parte do frasco acaba, os lembretes param.

### Funcionar sem sinal e atualizações

- **Fila de gravação:** aplicações, medições, checks do treino, registros do diário e edições da dieta mudam a tela na hora e são enviados em ordem. Sem internet, ficam guardados no aparelho e vão quando a conexão volta, mesmo que o app seja fechado.
- **Sem conexão:** o app abre com a última cópia dos dados e um aviso no topo; não manda para o login por falta de rede.
- **Versão nova:** cada publicação gera um service worker com versão própria; o app mostra "Nova versão disponível · Atualizar".
- **Supabase acordado:** o agendamento `.github/workflows/manter-supabase.yml` faz uma consulta leve a cada 3 dias. Se o projeto pausar, a execução falha e o GitHub avisa por e-mail.

## Verificações feitas

- `npm test`: 20 testes dos cálculos, conferidos contra os valores das planilhas (ex.: % de gordura 24,89301412476658, igual ao Excel).
- Migração aplicada num PostgreSQL 16 com os papéis do Supabase emulados:
  - outra conta não lê, não altera nem grava dados de outro usuário;
  - ninguém registra aplicação no ciclo de outra pessoa;
  - visitante sem login não vê nada.
- Função de lembretes executada com Deno contra um banco simulado e um endpoint de push HTTPS local, em 12 cenários:
  - horário e fuso de Brasília;
  - não repetir no mesmo dia;
  - dose remarcada de quinta para sexta;
  - lembrete de atraso;
  - inscrição expirada removida;
  - push criptografado (aes128gcm + VAPID).

## Versão de demonstração

`npm run build:demo` gera em `dist-demo/` uma versão sem nuvem: dados só no navegador e rotas com `#`. Serve para testar a interface.

---

Este app registra e calcula; decisões de dose devem ser tomadas com acompanhamento médico.
