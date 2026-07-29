# Vinaris Monitor

`/monitor` è la vista autonoma e in sola lettura delle metriche operative. È
pensata per essere installata come applicazione Android separata.

## Token dispositivo

Un app-admin crea un token revocabile con:

```text
POST /api/v1/admin/operations/device-tokens?label=Il-mio-telefono
```

La richiesta usa la normale sessione amministratore. Il valore `token` della
risposta viene mostrato una sola volta: inserirlo nell'app Monitor. Il token
permette esclusivamente di leggere overview, storico e attività operativa;
non consente alcuna modifica alla cantina.

Per revocarlo:

```text
DELETE /api/v1/admin/operations/device-tokens/{id}
```

## APK Android

Dal percorso `frontend/`, una volta installati Capacitor e Android Studio:

```text
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap add android
npm run android:monitor
```

Il comando costruisce la variante Monitor, sincronizza gli asset e apre il
progetto Android. Da Android Studio si genera l'APK firmato.

L'app necessita della rete per le metriche live. Il token rimane nel storage
privato della web view ed è revocabile dal server in ogni momento.
