# Security Rules por rol — propuesta (auditoría H-01)

Esta carpeta **no se despliega**: `firebase.json` no apunta a ningún archivo de
aquí. Es la propuesta para revisar, probar y publicar a mano cuando se decida.

| Archivo | Qué es |
|---|---|
| `firestore.rules` | Reglas de Firestore por módulo y rol. |
| `storage.rules` | Reglas de Storage: solo usuarios activos de la lista. |
| `tests/firestore.rules.test.mjs` | 28 pruebas contra el emulador (`npm run test:rules`). |
| `firestore.indexes.json` | Índices compuestos que pide el código: la bitácora (`activity_logs` filtrada por usuario o acción y ordenada por `ts`) y la pestaña Done del Task list (`user_tasks` hechas, por persona asignada, por quien la asignó o todas, ordenadas por `doneAt`). Lo demás usa índices de un solo campo, que Firestore crea solo. |
| `../functions/src/userAccess.ts` | Funciones que mantienen el espejo `user_access/{email}`. |

## Por qué hace falta `user_access`

Las reglas no pueden usar los datos tal como los guarda la app:

- `system_users` no usa el uid de Auth como id (ids de `addDoc`), así que una
  regla no puede encontrar "mi usuario".
- `settings_roles.permissions` es una lista de objetos, y el lenguaje de reglas
  no puede buscar dentro de una lista.

Por eso tres Cloud Functions mantienen un documento por usuario, con el email
en minúsculas como id:

```
user_access/{email} = { active, admin, fin, roleId, userId, m: { "Houses": { v, a, e, d, o }, ... } }
```

`o` es el Scope "Own" del módulo en Roles. Hoy lo usan las reglas de `user_tasks`:
con Task List en "Own" solo se leen y cambian las tareas propias (asignadas,
creadas o por aprobar). Después de desplegar las funciones con `o`, corre
`rebuilduseraccess` antes de publicar estas reglas: sin `o`, todos ven todo.

- `syncuseraccessonuser` actualiza el espejo cuando se crea, edita o borra un usuario.
  Recalcula desde lo que hay en `system_users` en ese momento: Users mueve un
  usuario de id (crea el nuevo y borra el viejo) y los dos avisos llegan en
  cualquier orden.
- `syncuseraccessonrole` recalcula a todos los usuarios cuando se edita un rol.
- `rebuilduseraccess` (callable, solo Administrator) reconstruye todo.

Los permisos heredados se calculan igual que en la app: Recycle Bin y Activity
Log heredan de Settings, y Task List hereda de Manager/Owner.

`fin` dice si el usuario puede ver dinero. Es verdadero para Administrator, para
quien ve Payroll, Invoices, Owner o Manager, y para quien ve Houses sin el grupo
`financial` oculto.

## Qué cambia respecto de hoy

Hoy, por lo que dice el código (`LoginView`: "ya hay sesión, por lo que las
reglas de Firestore permiten leer"), basta con tener sesión para leer y escribir
todo. Con esta propuesta:

1. **Sin lista o Inactive, nada.**
   - Un correo con cuenta de Auth pero fuera de `system_users` no lee ni escribe nada.
   - Un usuario marcado Inactive tampoco: hoy sí puede entrar.
   - `LoginView` ya trata ese caso como "ACCESS DENIED".
2. **Nadie se sube de rol.** Sin ser Administrator no se puede:
   - cambiar el propio `roleId` ni editar el propio rol;
   - asignar el rol Administrator, ni tocar o borrar a un administrador;
   - poner el propio correo en otro usuario (el espejo sale del correo);
   - crear o renombrar un rol "Administrator";
   - fabricar una entrada de papelera. Solo se crea en el mismo batch que borra
     la casa, y la app solo restaura casas con sus pagos y servicios.
3. **Los módulos se respetan en el servidor.**
   - Payroll, Settings, Users, Roles, Customers, Task List y Recycle Bin solo los usa
     quien ve ese módulo.
   - Houses distingue agregar, editar y borrar, como ya lo hace la app.
   - El orden de las pestañas del Task list (`app_settings/task_list_tabs`) lo
     cambia quien tiene Edit en Task List; lo leen todos.
   - Los proyectos del Task list (`task_projects`) siguen el módulo "Projects" de
     Roles: Add crea, Edit edita y archiva, Delete borra. Un rol que no lo declara
     lo hereda de Task List (`functions/src/userAccess.ts`). Los contadores y los
     comentarios los puede ajustar cualquiera con Task List.
4. **El equipo de campo** (solo "ver" Houses) solo puede escribir en la casa
   Start/Finish, notas y fotos. Quality Check solo mueve el status y retiene la factura.
5. **El correo solo sale hacia el correo de la empresa** (`settings_company/main.email`)
   y solo con `{ to, message }`. Hoy cualquier sesión puede usar el SMTP de la
   empresa para escribirle a cualquiera.
6. **Lo que no se edita queda fijo.**
   - `status_history`, `activity_logs` y `mail` no se editan ni se borran.
   - `user_access` y `app_settings/gcal_sync` solo los escriben las funciones.
   - El historial de notas de una casa no puede vaciarse.
   - La salida del reloj se marca una sola vez.
   - En Storage, solo Quality Check y Task List borran archivos.

## Decisiones antes de publicar (cambian lo que ve algún rol)

- **D-1 · Dinero en Overview.**
  - Hoy Overview descarga `payroll` y `billing_services` para cualquier rol con
    Houses y muestra los montos aunque el rol tenga oculto el grupo "financial".
  - Con `fin`, esos roles dejan de leerlos y verían $0.
  - Antes de publicar, hay que hacer que Overview no los pida para esos roles (cambio
    de cliente, Fase 1). ¿Esos roles deben ver dinero en Overview?
- **D-2 · Scope "Own".** La app filtra "solo mis casas" en el navegador. Las reglas
  no pueden aplicarlo sin cambiar las consultas (hoy todos escuchan todas las casas
  de la ventana). Queda igual que hoy.
- **D-3 · Borrar casas.** Calendar y Quality Check no revisan permisos hoy. Con las
  reglas, borrar una casa (mandarla a la papelera) exige "borrar" en Houses desde
  cualquier vista, y además ver dinero: la papelera guarda los pagos y cobros de
  la casa. A quien no tenga los dos permisos le aparece el aviso de error y no
  se borra nada.
- **D-4 · Calendar** edita y crea casas con solo "ver" Calendar, igual que hoy. Si
  debe exigir editar Houses, primero hay que cambiarlo en la app.
- **D-5 · Ver = editar.** Settings, Users, Roles, Customers, Payroll y Quality Check
  no distinguen ver de editar en la app; las reglas tampoco. Separarlo requiere
  primero cambiar esas pantallas.
- **D-6 · Data Import** escribe en las colecciones de negocio. En `system_users` y
  `settings_roles` necesita además los permisos de esos módulos y las mismas
  protecciones de Administrator.
- **D-7 · Funciones.**
  - `synchousetocalendar`, `calendardiagnostics` y `setupcalendarwatch` ahora exigen
    un usuario activo con Houses.
  - Recomendado: `setupcalendarwatch` solo para Administrator, porque cambia el canal
    de todo el calendario.
- **D-8 · Editar el rol propio.** Sin ser Administrator, nadie edita su propio rol.
  Si el dueño usa un rol "Owner" (no Administrator) y edita los permisos de Owner
  desde Roles & Permissions, eso dejaría de funcionar para él. Opciones: darle el
  rol Administrator o quitar esa condición (`roleId != acc().roleId`).
- **D-9 · "Agregar" en Houses.** El alta de una casa escribe en dos pasos (crear y
  luego completar), así que las reglas dejan que "agregar" también actualice casas.
  En la app, ese rol sigue sin ver el botón de editar.

## Orden para activarlo

1. Exportar las reglas e índices actuales de la consola y guardarlos como
   `firestore.rules`, `storage.rules` y `firestore.indexes.json` en la raíz.
   Son el respaldo para volver atrás.
2. Desplegar las funciones (`firebase deploy --only functions`).
3. Como Administrator, ejecutar `rebuilduseraccess` una vez, desde la consola
   del navegador con la app abierta:
   ```js
   const { getFunctions, httpsCallable } = await import('firebase/functions');
   await httpsCallable(getFunctions(), 'rebuilduseraccess')();
   ```
   Después, revisar en la consola que cada usuario tenga su `user_access/{email}`
   con el `m` esperado.
4. `npm run test:rules` en verde.
5. Publicar `security/firestore.rules` y luego `security/storage.rules`. Storage pide
   aceptar el permiso para leer Firestore.
6. Probar con un usuario de cada rol: Owner, gerente, inspector y limpieza.
   - Si algo falla, volver a publicar el respaldo del paso 1. Las reglas cambian en
     menos de un minuto.

## Pruebas

```
npm run test:rules
```

Necesita el Firebase CLI (`npm i -g firebase-tools`) y Java 11 o superior. Usa
un proyecto `demo-precise-rules`, que no toca producción.

En el entorno donde se escribieron no se pudieron correr: el emulador no se
descarga ahí. Deben correrse una vez antes del paso 5.

## No cubierto

- Lo que alguien puede **leer** de una casa no se limita por campo. Por ejemplo,
  `officeNote` está en el documento de la casa: un empleado no la ve en pantalla,
  pero sí con las herramientas del navegador. Para cerrarlo, las notas de oficina
  tendrían que ir en otro documento.
- `activity_logs` y `status_history` aceptan entradas de cualquier usuario activo
  (no se valida quién figura como autor). `mail` lo lee cualquier usuario activo:
  la app escucha el estado de entrega del correo que acaba de encolar.
- La campana de notificaciones lee la bitácora para todos, así que `activity_logs`
  se lee con cualquier usuario activo. La vista Activity Log sigue con su permiso
  en la app.
- Storage permite subir encima de un archivo existente (reintentos de la cola de
  fotos sin conexión).

- Validar la forma de cada documento (tipos y campos permitidos por colección).
  Es el siguiente paso después de que esto esté en producción.
- Custom claims: el espejo cuesta ~1 lectura por petición. Los claims la quitarían,
  pero piden volver a iniciar sesión para que un cambio de rol se aplique.
