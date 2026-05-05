import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

// --- Toast y Notificaciones (usePlugin) ---
// const { moduleId, toast, notifications, views } = usePlugin();
//
// Toast (temporal, desaparece en 3-5s):
//   toast.success('Guardado', 'Registro creado exitosamente');
//   toast.error('Error', 'No se pudo guardar');
//   toast.info('Info', 'Operación en progreso');
//   toast.warning('Atención', 'Campos vacíos');
//
// Notificaciones (persistentes, panel de notificaciones):
//   notifications.info('Recordatorio', 'Tienes tareas pendientes');
//   notifications.success('Completado', 'Proceso finalizado');
//   notifications.warning('Alerta', 'Pago atrasado', { contractId: 123 });
//   notifications.urgent('Crítico', 'Falla en el sistema');
//
// --- View Contributions (secciones/acciones aditivas de otros plugins) ---
// Permite que OTROS plugins inyecten UI en esta vista sin modificarla.
//
// import { useViewContributions } from '@coongro/plugin-sdk';
// const { sections, actions, loading } = useViewContributions(
//   'my-plugin.detail.open',     // viewId de ESTA vista
//   { onDataChange: setData }    // context opcional: callbacks/estado para comunicación bidireccional
// );
//
// sections: { title: string, order: number, render: () => ReactElement }[]
// actions:  { label: string, order: number, Component: LazyComponent }[]
//
// Renderizar contribuciones (con fallback nativo si no hay ninguna):
//   contributedSections.length > 0
//     ? contributedSections.map(s => s.render())
//     : [<NativeComponent />]     // fallback cuando no hay plugins contribuyendo
//
// Patrón de comunicación bidireccional:
//   1. Host → Contribución: pasar callbacks en context (ej: onDataChange)
//   2. Contribución → Host: llamar el callback para sincronizar estado
//   3. Eventos: la contribución puede escuchar eventos con events.on('action.id', handler)
//
// Ejemplo real: consultations pasa { onMedicationsChange } y vet-pharmacy
// reemplaza el campo de texto libre con un autocomplete farmacéutico.

export function StreamView() {
  return h(
    'div',
    {
      style: {
        padding: '24px',
        minHeight: '100vh',
        backgroundColor: 'var(--cg-bg-secondary)',
        fontFamily: 'var(--cg-font-sans, Inter, system-ui, sans-serif)',
      },
    },
    h(
      'div',
      { style: { width: '100%' } },
      h(
        'header',
        { style: { marginBottom: '24px' } },
        h(
          'h1',
          {
            style: { fontSize: '24px', fontWeight: '700', color: 'var(--cg-text)' },
          },
          'Stream'
        ),
        h(
          'p',
          {
            style: { fontSize: '14px', color: 'var(--cg-text-muted)', marginTop: '4px' },
          },
          'Vista inicial — editá este archivo para construir tu interfaz.'
        )
      ),
      h(
        'section',
        {
          style: {
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid var(--cg-border)',
            backgroundColor: 'var(--cg-bg)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          },
        },
        h('p', { style: { color: 'var(--cg-text)' } }, 'Contenido aquí.')
      )
    )
  );
}
