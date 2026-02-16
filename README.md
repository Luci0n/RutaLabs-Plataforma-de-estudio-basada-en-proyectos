# RutaLabs

Plataforma de estudio basada en proyectos (apuntes + flashcards + agenda de repaso + Pomodoro). Prototipo web desarrollado para mi Proyecto/Examen de Título.

**Demo:** [https://rutalabs.vercel.app/](https://rutalabs.vercel.app/)

---

## Contenidos

* [Resumen](#resumen)
* [Características](#características)
* [Stack](#stack)
* [Diseño del sistema](#diseño-del-sistema)
* [Estado](#estado)

---

## Resumen

La unidad principal de RutaLabs es el **proyecto**. Un proyecto concentra el contenido (bloques de texto y conjuntos de tarjetas) y el progreso (agenda y estados de repaso por usuario). La intención es operacional: convertir material de estudio en un flujo continuo con prioridades claras, sin depender de múltiples herramientas desconectadas.

---

## Características

* Proyectos con visibilidad (**privado / no listado / público**) y membresías (**owner / editor / guest**).
* Bloques de contenido: texto (Markdown) y flashcards organizadas por grupo.
* Práctica orientada a **active recall** (frente → revelar → calificar) con actualización de estado de repaso.
* Agenda construida desde vencimientos (con agregaciones resueltas en DB vía RPC).
* Pomodoro con configuración persistente y registro de sesiones.
* Publicación/importación de proyectos para biblioteca comunitaria (con control mínimo mediante reportes/moderación).

---

## Stack

* Next.js (App Router)
* TypeScript
* Supabase (Auth + PostgreSQL + RPC + RLS)
* TailwindCSS + shadcn/ui

---

## Diseño del sistema

### Capas

* **UI / Presentación:** Next.js (rutas públicas y protegidas) + componentes por dominio.
* **Aplicación:** casos de uso (crear proyecto, editar bloques, practicar, planificar, publicar/importar).
* **Datos y control:** Postgres (constraints + RLS) + funciones SQL (RPC) para cálculos de agenda.

### Principio clave

El contenido es **compartible**, pero el progreso es **individual**.

Esto evita mezclar “material” con “estado de aprendizaje” y permite colaboración/importación sin corromper el avance de cada usuario.

<details>
<summary><strong>Modelo conceptual (resumen)</strong></summary>

* **Proyecto:** contenedor principal de un tema.
* **Bloque:** unidad modular dentro de un proyecto (texto o flashcards).
* **Flashcard:** par frente/reverso.
* **Estado de repaso:** variables mínimas para repetición espaciada por usuario (vencimiento, intervalo, facilidad, etc.).
* **Sesión Pomodoro:** registro de tiempo de estudio y configuración.
* **Publicación:** representación exportable del proyecto (idealmente con revisiones/versionado).
* **Reporte/moderación:** control mínimo sobre contenido público.

</details>

<details>
<summary><strong>Base de datos (mapa rápido)</strong></summary>

| Dominio    | Qué resuelve                            | Tablas típicas                                            |
| ---------- | --------------------------------------- | --------------------------------------------------------- |
| Identidad  | perfil mínimo asociado a Auth           | `profiles`                                                |
| Proyectos  | propiedad, visibilidad, colaboración    | `projects`, `project_members`                             |
| Contenido  | estructura editable dentro del proyecto | `project_blocks`, `flashcard_groups`, `flashcards`        |
| Repaso     | progreso individual y trazabilidad      | `flashcard_review_state`, `flashcard_review_log`          |
| Pomodoro   | configuración y sesiones                | `pomodoro_settings`, `pomodoro_state`, `pomodoro_session` |
| Comunidad  | publicación/importación/biblioteca      | `published_projects`, revisiones, items de biblioteca     |
| Moderación | reportes y decisiones                   | `reports`, `moderation_action`                            |

</details>

<details>
<summary><strong>Seguridad y control de acceso</strong></summary>

* Auth: Supabase Auth.
* Autorización: RLS/policies + constraints en Postgres (la UI no es la autoridad).
* Aislamiento: por proyecto y por rol.
* Trazabilidad: logs para repaso y acciones sensibles (publicación/reportes).

</details>

---

## Estado

* [x] MVP funcional (proyectos, bloques, flashcards, agenda, Pomodoro)
* [x] Superficie de comunidad (publicación/importación) + reportes
* [x] Endurecer políticas de permisos lado DB (RLS/policies)
* [ ] Refinar el algoritmo de repaso y su UX
* [ ] Métricas simples por proyecto (tiempo, sesiones, evolución)
