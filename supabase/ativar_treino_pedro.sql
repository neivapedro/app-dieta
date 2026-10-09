-- Liga a aba "Treino" só para a conta do Pedro (rodar uma vez, depois do
-- script 20261010000000_treino.sql). O e-mail fica só aqui no banco.
update public.perfis
set modulo_treino = true
where user_id = (select id from auth.users where email = 'COLE-SEU-EMAIL-AQUI');
