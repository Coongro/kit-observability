// Wrapper thin de `DropdownFilterChip` con el fetcher de `/tenants` y
// formatting de UUIDs largos. Dejar el wrapper específico (en lugar de
// instanciar DropdownFilterChip directamente en cada filter-bar) hace que
// los call-sites lean cortos y no se preocupen del fetcher.

import { getHostReact } from '@coongro/plugin-sdk';

import { listTenants, type TenantOption } from '../api.js';
import { shortenId } from '../lib/format-id.js';

import { DropdownFilterChip, type DropdownFilterChipItem } from './dropdown-filter-chip.js';

const React = getHostReact();
const h = React.createElement;

export interface TenantFilterChipProps {
  /** UUID del tenant filtrado, null = "todos". */
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
  /** Lista pre-cargada (tests / re-uso con lista cacheada). */
  knownTenants?: TenantOption[];
}

export function TenantFilterChip({ tenantId, setTenantId, knownTenants }: TenantFilterChipProps) {
  const knownItems = knownTenants?.map(toItem);
  return h(DropdownFilterChip, {
    label: 'TENANT',
    value: tenantId,
    setValue: setTenantId,
    placeholder: 'tenant_id (UUID)',
    allLabel: 'todos los tenants',
    formatUnknownValue: shortenId,
    knownItems,
    fetcher: knownItems
      ? undefined
      : async (signal) => (await listTenants({ signal })).rows.map(toItem),
  });
}

function toItem(t: TenantOption): DropdownFilterChipItem {
  return { id: t.id, name: t.name, hint: shortenId(t.id) };
}
