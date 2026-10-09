# Ideias futuras (em espera)

## Versão comercial: vários medicamentos e publicação nas lojas

**Status:** em espera, por decisão do Pedro (10/2026).

### Ideia
- Na criação da conta, a pessoa escolhe o medicamento e a forma de uso:
  - frasco + seringa (retatrutida e manipulados, como hoje)
  - caneta de dose pronta (Mounjaro / tirzepatida)
  - caneta com seletor (Ozempic / Wegovy / semaglutida)
  - outro (plano livre)
- Cada opção vem com um plano inicial editável. A pessoa ajusta conforme a orientação médica dela.
- Publicar na Google Play e na App Store e cobrar pelo app.

### O que já ajuda
- Login individual, com dados isolados por conta (RLS).
- O motor do ciclo já é genérico: fases, dose em mg, intervalo e concentração.

### Pontos de atenção levantados
1. **Apple, regra 1.4.2:** "calculadoras de dose" só são aceitas de fabricante, farmácia ou hospital, ou com aprovação regulatória. Posicionar o app como diário e acompanhamento, sem recomendar dose.
2. **Retatrutida:** ainda em estudo, sem aprovação no Brasil. Na versão comercial, focar nos medicamentos aprovados e deixar "Outro" para o resto.
3. **LGPD:** são dados sensíveis de saúde. Exige política de privacidade, consentimento, exclusão de conta e dados (exigida também pelas lojas) e um contato responsável.
4. **ANVISA (software como dispositivo médico):** um app que só registra e lembra normalmente fica fora; um que recomenda ou calcula dose pode precisar de registro.
5. **Marcas:** nomes de medicamentos só na lista de opções, nunca no nome nem no ícone do app. A imagem do braço precisa de licença ou de um desenho próprio.
6. **Infraestrutura:** projeto Supabase próprio, separado do Diário de Carga, provavelmente no plano pago (cerca de US$ 25/mês).
7. **Validação jurídica:** conversar com um advogado de direito digital ou saúde antes de publicar.

### Custos de publicação
- **Google Play:** US$ 25, pagamento único.
- **Apple Developer:** US$ 99 por ano. A versão de iPhone exige um Mac ou um serviço de compilação na nuvem.
- **Técnica:** empacotar o PWA atual com Capacitor, sem reescrever o app.

### Fases sugeridas
1. Escolha de medicamento (frasco ou caneta) no app atual e teste com um grupo pequeno.
2. Projeto Supabase próprio, política de privacidade, termos, exclusão de conta, textos de diário e marca própria.
3. Empacotar com Capacitor, testar em grupo fechado (TestFlight e teste interno do Play) e publicar.

### Referência de mercado
- Shotsy (EUA), app de acompanhamento de GLP-1. Mostra que existe demanda; em português ainda há pouca concorrência.
