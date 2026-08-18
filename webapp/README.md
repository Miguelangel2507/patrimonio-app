# Patrimonio — webapp

App de finanzas personales (patrimonio neto, cuentas, gastos/ingresos, inversiones)
implementada en HTML/CSS/JS puro, sin frameworks ni paso de compilación. Los datos
viven solo en el dispositivo (`localStorage`), no hay backend ni cuenta de usuario.

## Estructura

- `index.html` — shell de la app + metadatos PWA
- `style.css` — sistema de diseño (tokens de color, componentes)
- `app.js` — todo el estado, la lógica de negocio y el renderizado
- `manifest.webmanifest` — metadatos de instalación (PWA)
- `sw.js` — service worker (funcionamiento offline + caché de la app)
- `icons/` — iconos de la app (generados con `icons/gen-icons.js`)

## Probar en local

No requiere build. Solo un servidor estático (por CORS/service worker, no vale
abrir el `index.html` con `file://`):

```
cd webapp
python3 -m http.server 8080
```

Abre `http://localhost:8080` en el navegador.

## Desplegar en GitHub Pages

Este repo incluye `.github/workflows/deploy-pages.yml`, que publica la carpeta
`webapp/` automáticamente en cada push a `main`. En GitHub: Settings → Pages →
Source → "GitHub Actions". La URL resultante (`https://<usuario>.github.io/<repo>/`)
es la que se abre en el iPhone para "Añadir a pantalla de inicio".
