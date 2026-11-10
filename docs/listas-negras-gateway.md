# Listas Negras — contrato del gateway de métricas

Esta rama agrega la pestaña **Listas Negras** al frontend. No modifica FastAPI, los 7 CSV ni el flujo de aprobación. La vista requiere un endpoint backend para mostrar datos reales.

## Endpoint del navegador

`GET /api/gateway/listas-negras/indicadores?desde=202507`

La configuración Nginx existente elimina el prefijo `/api/` y reenvía al FastAPI de la aplicación; por lo tanto, el backend debe registrar la ruta **`/gateway/listas-negras/indicadores`** o equivalente detrás del proxy actual, sin agregar un reverse proxy público nuevo.

Requisitos obligatorios:

1. Autenticar la **sesión real del usuario** mediante la dependencia ya existente de cookies HttpOnly y controles de autorización de la aplicación; denegar con 401/403 sin sesión o sin permiso.
2. Consultar **internamente** `/listas-negras/v3/indicadores?desde=202507` con el token `X-LN-Token` leído desde el archivo privado `/etc/pipeline-leads/ln_bridge_token` (o invocar directamente el módulo de métricas del servidor tras autenticación). El navegador **nunca** recibe dicho token.
3. Pasar al frontend únicamente el contrato agregado `ln_graficos_v1` de tres series: `email`, `whatsapp_100212`, `whatsapp_100327`. No devolver ninguna fila de CSV, correo o teléfono. Deshabilitar caché compartida (`Cache-Control: private, no-store`).
4. Preservar `estado` y `unicos_mes: null` cuando la fuente carece de cifra; no reemplazar ausencias por cero.
5. El estado `aprobado:false` y `autorizado_para_envios:false` permanece intacto. No usar esta consulta para aprobar cruces con BD definitiva.
6. La importación de 202507–202610 está completa pero **su cobertura temporal no está certificada**. Febrero 2026 contiene anomalías documentadas. La vista muestra una advertencia visible.

## Contrato de respuesta

```json
{
  "contrato": "ln_graficos_v1",
  "periodo_maximo": "202610",
  "version_prepublicacion": "<64 hex chars>",
  "zona_horaria": "America/Lima",
  "aprobado": false,
  "autorizado_para_envios": false,
  "series": [
    { "id": "email", "tipo": "barras", "puntos": [
      { "periodo": "202507", "estado": "local_no_verificado", "unicos_mes": null }
    ] },
    { "id": "whatsapp_100212", "tipo": "barras", "puntos": [] },
    { "id": "whatsapp_100327", "tipo": "barras", "puntos": [] }
  ]
}
```

**Nota:** el JSON es estructural e ilustrativo, no contiene cifras observadas. No debe usarse como fixture de producción ni para simular meses verificados.

## Pruebas antes de publicar

- Sin cookie o cookie expirada: 401/403, nunca datos.
- Usuario sin permiso: 403; usuario autorizado: 200 con tres series y sin PII.
- Un mes sin datos permanece `null` y muestra "—"; un verdadero cero aparece como 0.
- Alternar Generar corte, Historial, Credenciales y Listas Negras funciona en desktop/móvil y tema claro/oscuro.
- El backend no expone `X-LN-Token`, respuestas crudas ni detalles de excepciones internas.
- La versión recibida por el frontend corresponde a la última preparación v3; no confundir importación con aprobación.

## Dependencia pendiente

**El gateway no se implementa en este repositorio frontend**. Hasta desplegar la ruta autenticada, la pantalla muestra un error claro y no inventa cifras. Mantener el PR sin fusionar a producción hasta verificar el backend.
