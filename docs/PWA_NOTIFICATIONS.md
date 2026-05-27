# GoalSense — PWA e notificações

Documento da fundação PWA introduzida na V5. Cobre o que está
implementado, o que funciona em runtime, o que ainda não foi feito e
um checklist manual para validação em browser real.

## O que está implementado

### Manifest

- `public/manifest.webmanifest` com nome, descrição, `start_url=/app/live`,
  `scope=/`, `display=standalone`, cores do tema e ícone SVG vetorial.
- `index.html` referencia o manifest e expõe meta tags Apple/Android para
  comportamento como app instalado.

### Ícone

- `public/icons/icon.svg` — ilustração mínima do GoalSense feita em SVG,
  sem dependência de fontes/imagens externas. `purpose: "any maskable"`.
- Quando o branding final estiver disponível, basta substituir o arquivo
  ou adicionar PNGs em múltiplos tamanhos.

### Service Worker

- `public/sw.js` registrado em `/sw.js` com escopo `/`.
- Estratégia conservadora:
  - **Live data** (`/api/*`, ESPN, football-data, api-football): network-only.
    Resultados de partidas nunca ficam em cache.
  - **Hashed assets** (`/assets/*`): cache-first (URLs mudam a cada build).
  - **Navegações HTML**: network-first com cache do `index.html` como
    fallback offline.
  - **Outros estáticos** (manifest, fonts, icons): stale-while-revalidate.
- Versionamento por constante `SW_VERSION`. Caches antigas são removidas
  no `activate`.
- Mensagem `SKIP_WAITING` suportada para futuras pontes "atualizar agora".

### Registro do SW

- `src/features/pwa/pwaRegistration.ts`:
  - `isServiceWorkerSupported()`
  - `getServiceWorkerStatus()` — retorna `'unsupported' | 'inactive' | 'registering' | 'active' | 'error'`
  - `registerServiceWorker()` — chamado de `main.tsx`. Skipa em dev.
  - `unregisterServiceWorker()` — disponível para diagnósticos.
- Erros são `console.warn` e nunca derrubam o app.

### Notification API

- `src/features/notifications/notificationService.ts`:
  - `isNotificationSupported()`
  - `getNotificationPermission()` — retorna `'granted' | 'denied' | 'default' | 'unsupported'`.
  - `requestNotificationPermission()` — exige user gesture, com fallback
    para o callback legado de Safari antigo.
  - `canShowLocalNotification()`
  - `showLocalNotification(title, options)` — aceita body/icon/tag/url/silent/vibrate.
- `src/features/notifications/notificationSettings.ts`:
  - chave `goalsense_notification_settings` com `safeParse` e defaults
    seguros. Limpa via `clearAllGoalSense()`.
  - flag `commandAlertsEnabled` (default `false`).
- `src/features/notifications/alertNotificationBridge.ts`:
  - função `maybeNotifyCommandAlert(alert)` para futuro plug-in no
    Command Center. **Não está auto-wired** — só dispara se o usuário
    optar explicitamente e a permissão estiver concedida.

### Settings

- Nova seção "App e notificações" em `/app/settings`:
  - status do Service Worker (badge real, atualizado pelo browser).
  - status da permissão de notificação (Permitido / Bloqueado / Não
    solicitado / Não suportado).
  - botão "Ativar notificações" — só aparece em estado `default`.
  - botão "Enviar notificação de teste" — só aparece com permissão
    concedida; dispara um aviso local com o ícone do app.
  - toggle "Alertas do Command Center" — opt-in para foreground notifs.
  - copy honesta deixa claro que push em segundo plano ainda não existe.

## O que funciona agora

- Manifest é servido em produção.
- App pode ser instalado via "Add to Home Screen" no Chrome/Edge/Safari
  iOS quando aberto sob HTTPS.
- Service worker registrado em produção. Em dev (vite dev) o registro é
  ignorado para não atrapalhar HMR.
- Permissão de notificação é solicitada apenas com user gesture
  explícito.
- Notificação local de teste funciona em qualquer browser que suporte
  `window.Notification` e tenha permissão concedida.
- Toggle do Command Center persiste em localStorage.

## Limitações

- **Push em segundo plano não está implementado.** Push real exige
  backend, FCM/Web Push tokens, gerenciamento de subscription e endpoint
  de envio. Quando isso existir, o handler `push` no service worker e a
  subscription via `pushManager` podem ser adicionados sem reescrever a
  arquitetura atual.
- **`maybeNotifyCommandAlert` não está conectado** ao Command Center
  ainda. A função existe para definir o contrato; o auto-wire fica para
  uma fase futura quando a UX e o anti-spam (rate limiting) tiverem sido
  pensados em runtime.
- **Notificação local só funciona com a aba aberta**. Em desktop pode
  aparecer no canto da tela mesmo com a aba minimizada, mas em mobile
  geralmente exige a aba ativa.
- **Sem ícones PNG em múltiplos tamanhos.** O SVG cobre quase todos os
  cenários, mas algumas plataformas (Android Chrome com configurações
  específicas, Windows tile pinning) podem preferir PNGs 192x192 e 512x512.
- **Permissão é por origem.** Após bloquear, o usuário precisa
  desbloquear manualmente nas configurações do site.

## Checklist manual

### Instalar como app

1. Buildar produção: `npm run build && npm run preview`.
2. Abrir `http://localhost:4173/app/live` no Chrome.
3. Ícone de instalação deve aparecer na barra de endereço (Chrome) ou no
   menu do navegador.
4. Após instalar, abrir o app: deve ter janela própria sem barra do
   browser, ícone GoalSense no Dock/Taskbar.

### Permissão e notificação local

1. Ir para `/app/settings`.
2. Confirmar badge "Service Worker": Ativo.
3. Confirmar badge "Notificações do navegador": Não solicitado.
4. Clicar em "Ativar notificações". Browser deve mostrar prompt nativo.
5. Aceitar. Badge muda para "Permitido".
6. Clicar em "Enviar notificação de teste". Notificação deve aparecer
   com título "GoalSense" e corpo "Notificações locais estão funcionando
   neste navegador."
7. Clicar na notificação. Deve abrir/focar `/app/settings`.

### Validar service worker

1. DevTools → Application → Service Workers.
2. Confirmar `sw.js` registrado, status "activated and is running".
3. Cache Storage: ver `gs-static-v5-2026-05-26` e `gs-shell-v5-2026-05-26`.
4. Network → Offline mode → recarregar `/app/live`. Shell carrega; APIs
   retornam erro de rede (esperado, não há cache de live data).

### Limpar tudo

1. Settings → Limpar tudo do GoalSense.
2. Recarregar.
3. Permissão de notificação NÃO é revogada automaticamente (é controle
   do browser por origem). Para revogar, usar configurações do site.
