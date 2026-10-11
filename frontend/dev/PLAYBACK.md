# Healthcare playback

Run `npm run dev`, then open `/playback-demo`. This route is development-only by default; production returns 404 unless the explicit local `ASTRA_PLAYBACK_QA=1` flag is set for optimized-build testing. The fixture is a real standalone-engine run: seed 42, eight arrivals, one nurse, a FIFO queue, both decision branches, a three-minute observation hold, and one exit. To regenerate from the Astra repo root:

```sh
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python frontend/dev/generate-clinic-playback.py
```

Production playback imports no example data. `TimelinePlayer` consumes the existing run events in backend order. Logical counts and completion change immediately. All instantaneous hops at one timestamp share a maximum 0.4 simulated-minute visual journey, shortened at the run boundary. A later transfer replaces an unfinished earlier journey. No travel duration is added to the engine. Very short holds may therefore be passed visually while their logical events and counts remain exact.

`animated-person.tsx` renders articulated SVG limbs from the shared playback time, with stable ID-derived appearance and optional appearance props. `PlaybackTheme` accepts captions and replacement person/station renderers independently of the canonical node schema. Only healthcare is implemented. Reduced motion places static people directly at their authoritative stations, skipping visual travel.

`playback-layout.ts` defines FIFO positions, stable service slots, bounded rendering and exact overflow. Six positions per station and 80 people overall are rendered. Waiting people inside a Process occupy positions after its configured service desks; additional people/resources remain represented by metrics. The overlay uses React Flow's viewport portal, and motion samples the actual rendered edge paths with continuous connectors through station interiors. Canvas nodes use the saved run snapshot and remain read-only, as before; builder nodes and interactions are unchanged.

Select a person by click or keyboard to inspect ID, current station, time in system, measured/open wait and service intervals, and the consumed route. Follow camera keeps the selected entity in view and yields to manual navigation. The virtualized event log filters real events and seeks exact event prefixes.

See [PLAYBACK-VALIDATION.md](PLAYBACK-VALIDATION.md) for the six refinement phases, checks, screenshots, performance policy, reproduction commands, database setup failure, and exact manual-verification limits.
