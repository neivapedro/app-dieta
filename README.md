# app-dieta · Ciclo

App (PWA) de acompanhamento do ciclo de retatrutida e da composição corporal. Abre no navegador e pode ser instalado no celular. Tem login: cada conta só vê os próprios dados.

## O que o app faz

| Tela | Equivale a | Conteúdo |
|---|---|---|
| **Início** | Painel | Próxima dose (data, mg, UI, marcação prática, fase, local sugerido), saldo do frasco, registro do dia e comparação antes × agora |
| **Ciclo → Agenda** | Diário + Semanal | Próximas aplicações projetadas e histórico (prevista × aplicada, atraso, saldo, peso médio e náusea máxima por semana) |
| **Ciclo → Plano** | Plano | Fases editáveis, "Repetir fase (+4 semanas)", conferência do consumo × quantidade disponível e regras para subir de fase |
| **Ciclo → Ajustes** | Painel (parâmetros) | Data da 1ª aplicação, quantidade (mg), concentração (mg/ml), intervalo e menor marcação da seringa |
| **Diário** | Diário | Peso, náusea (0 a 3) e observações em qualquer dia, com as aplicações na mesma linha do tempo |
| **Medidas** | % de Gordura (Gorgonoidiana) | % de gordura, massa magra e massa gorda, ganhos (última − primeira medição) e gráfico de evolução |
| **Análise** | — | Resumo do ciclo, gráfico peso × dose, medidas iniciais × atuais e resultado por fase |
| **Perfil** | — | Dados pessoais, lembretes, notificações do aparelho, backup (exportar/importar) |

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

Sem o arquivo `.env.local`, o app roda em **modo demonstração**: os dados ficam só no navegador, separados por e-mail. Esse modo serve só para testar.

## Colocar no ar (login real + lembretes no celular)

Todos os serviços abaixo têm plano gratuito suficiente para uso pessoal.

### 1. Supabase (login + banco de dados)

1. Crie uma conta em <https://supabase.com> e um projeto novo (região São Paulo).
2. Em **SQL Editor**, cole e execute o conteúdo de `supabase/migrations/20261008000000_inicial.sql`. Ele cria as tabelas com Row Level Security: cada usuário só acessa as próprias linhas.
3. Em **Project Settings → API**, anote a **Project URL**, a chave **anon** e a chave **service_role**.
4. Em **Authentication → URL Configuration**, coloque em *Site URL* o endereço do app (passo 3).

### 2. Lembretes (push)

1. Gere as chaves VAPID: `npx web-push generate-vapid-keys`.
2. Publique a função e configure os segredos:
   ```bash
   npx supabase login
   npx supabase link --project-ref <id-do-projeto>
   npx supabase secrets set VAPID_PUBLIC_KEY=<publica> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<seu-email>
   npx supabase functions deploy enviar-lembretes
   ```
3. No **SQL Editor**, guarde a URL e a service role no Vault e agende a função:
   ```sql
   select vault.create_secret('https://<id-do-projeto>.supabase.co', 'projeto_url');
   select vault.create_secret('<service_role_key>', 'service_role_key');
   ```
   Depois, execute `supabase/migrations/20261008000100_agendar_lembretes.sql`.

A função roda a cada hora. No dia previsto, a partir do horário escolhido no Perfil (padrão 08:00, no seu fuso), ela envia o lembrete com a dose em mg e UI. Se a dose atrasar, envia um lembrete por dia, por até 14 dias, até a aplicação ser registrada.

### 3. Vercel (hospedagem do app)

1. Em <https://vercel.com>, importe este repositório do GitHub. O framework é detectado como Vite.
2. Em **Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
3. Faça o deploy e use a URL gerada no passo 1.4.

### 4. Instalar no celular

- **Android (Chrome):** abra o site, toque em ⋮ → **Instalar app**. Depois, vá em Perfil → **Ativar notificações**.
- **iPhone (Safari, iOS 16.4+):** toque em Compartilhar → **Adicionar à Tela de Início** e abra pelo ícone. Depois, vá em Perfil → **Ativar notificações**. No iPhone, o push só funciona com o app instalado.

Ative as notificações em cada aparelho que for usar.

---

Este app registra e calcula; decisões de dose devem ser tomadas com acompanhamento médico.
