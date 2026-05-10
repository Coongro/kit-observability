// Wrapper thin de `DropdownFilterChip` con el fetcher de `/sources`. La
// lista se ordena en el backend por uso reciente — el chip muestra
// `source` como label y un hint con el `count` de eventos en la ventana
// (los más activos primero).

import { getHostReact } from '@coongro/plugin-sdk';

import { listSources, type SourceOption } from '../api.js';

import { DropdownFilterChip, type DropdownFilterChipItem } from './dropdown-filter-chip.js';

const React = getHostReact();
const h = React.createElement;

export interface SourceFilterChipProps {
  /** Valor del filtro source, null = "todos". */
  value: string | null;
  setValue: (next: string | null) => void;
  /** Lista pre-cargada (tests / re-uso con lista cacheada). */
  knownSources?: SourceOption[];
}

export function SourceFilterChip({ value, setValue, knownSources }: SourceFilterChipProps) {
  const knownItems = knownSources?.map(toItem);
  return h(DropdownFilterChip, {
    label: 'SOURCE',
    value,
    setValue,
    placeholder: 'source (ej: plugin:billing-afip)',
    allLabel: 'todos los sources',
    knownItems,
    fetcher: knownItems
      ? undefined
      : async (signal) => (await listSources({ signal })).rows.map(toItem),
  });
}

function toItem(s: SourceOption): DropdownFilterChipItem {
  return {
    id: s.source,
    name: s.source,
    // El hint muestra el count formateado — útil para distinguir sources
    // muy activos de sources con un único evento histórico.
    hint: `${s.count.toLocaleString('es-AR')} eventos`,
  };
}
