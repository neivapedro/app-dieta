import { useCallback, useEffect, useState } from 'react';
import { gravarMedicaoAdiada, lerMedicaoAdiada } from '../lib/medicao-adiada';

/** Data para a qual a medição de segunda foi adiada (ou null), sempre em dia com o que está guardado no aparelho. */
export function useMedicaoAdiada(): [string | null, (data: string | null) => void] {
  const [data, setData] = useState<string | null>(() => lerMedicaoAdiada());
  useEffect(() => {
    const ler = () => setData(lerMedicaoAdiada());
    window.addEventListener('medicao-adiada', ler);
    window.addEventListener('storage', ler);
    return () => {
      window.removeEventListener('medicao-adiada', ler);
      window.removeEventListener('storage', ler);
    };
  }, []);
  const definir = useCallback((d: string | null) => {
    gravarMedicaoAdiada(d);
    setData(d);
  }, []);
  return [data, definir];
}
