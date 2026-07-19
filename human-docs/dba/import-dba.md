# Import chad-dba in Neighbor Projects

## Cel
`chad-dba` jest lokalna paczka TypeScript/Node, wykorzystywana przez sasiednie repozytoria (np. `chad-dashbord`, `chad-console`) do dostepu do Content Provider.

Docelowy pattern w Next.js:
- client UI -> local Next API route -> import `chad-dba` po stronie serwera.

## 1) Wymagania w projekcie korzystajacym
W `package.json` projektu korzystajacego musi byc lokalna zaleznosc:

```json
{
  "dependencies": {
    "chad-dba": "file:../chad-dba"
  }
}
```

Przyklad (dzialajacy): `chad-dashbord/package.json`.

## 2) Wymagania w chad-dba/package.json
`chad-dba/package.json` powinien zawierac:

```json
{
  "name": "chad-dba",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

### Rola pol
- `name`: nazwa paczki importowanej jako `import { ... } from "chad-dba"`.
- `type`: tryb ESM (`module`), zgodny z importami `import/export`.
- `main`: runtime entrypoint JS po buildzie.
- `types`: deklaracje TypeScript dla IDE i kompilatora.
- `exports`: jawna mapa eksportow; stabilizuje resolve dla bundlera i Node.

## 3) Build flow (obowiazkowy)
Po zmianach w `chad-dba` najpierw zbuduj paczke:

```bash
cd /Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dba
npm run build
```

Dopiero potem odswiez projekt zalezny:

```bash
cd /Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad-dashbord
rm -rf .next
npm install
npm run dev
```

## 4) Next.js: gdzie wolno importowac chad-dba
Import `chad-dba` tylko server-side:
- API routes,
- server actions,
- server components,
- pliki server-only.

Nie importowac `chad-dba` w client components (`"use client"`).

Dla client UI stosowac:
- client page robi `fetch("/api/...")`,
- API route importuje `chad-dba` i zwraca JSON.

## 5) Konfiguracja Next/Turbopack dla lokalnej paczki
W praktyce (Next 15 + Turbopack) w `next.config.ts` projektu zaleznego potrzebna byla konfiguracja:

```ts
experimental: {
  externalDir: true,
  serverActions: { bodySizeLimit: "2mb" },
},
turbopack: {
  resolveAlias: {
    "chad-dba": "./node_modules/chad-dba/dist/index.js",
  },
},
transpilePackages: ["chad-dba"],
```

Uwagi:
- alias do absolutnej sciezki poza projektem (`/Users/.../chad-dba/dist/index.js`) nie dzialal,
- alias `../chad-dba/dist/index.js` tez byl niestabilny w tym setupie,
- stabilny wariant to alias do `./node_modules/chad-dba/dist/index.js`.

## 6) Szybki checklista
1. `chad-dba/package.json` ma poprawne `name/main/types/exports`.
2. `npm run build` w `chad-dba` wykonany bez bledow.
3. W projekcie zaleznym jest `"chad-dba": "file:../chad-dba"`.
4. `npm install` wykonany po zmianach.
5. Next/Turbopack ma ustawiony alias do `./node_modules/chad-dba/dist/index.js`.
6. Import `from "chad-dba"` jest tylko server-side.
7. Client komponenty pobieraja dane przez lokalne API route.
