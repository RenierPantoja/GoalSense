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

## V5.1 — Notificações locais para alertas do Command Center

### O que mudou

- `maybeNotifyCommandAlert` agora é típado e auditável: retorna
  `'sent' | 'disabled' | 'unsupported' | 'permission_not_granted' |
  'invalid_alert' | 'duplicate' | 'rate_limited' | 'error'`.
- `notifiedAlertsStore.ts` adiciona dedup persistente
  (`goalsense_notified_command_alerts`) com TTL de 7 dias, cap de 200
  ids, e rate limit (`goalsense_notification_rate_limit`) de 3 fires
  em 60 s.
- `useCommandAlertNotifications` hook conecta o stream de
  `commandAlerts` (do `AlertsContext`) ao bridge sem disparar para
  backlog: snapshot dos ids no primeiro mount, fires apenas para ids
  novos depois.
- `CommandCenterPage` consome o hook. Nada é chamado em loop, nenhum
  histórico é replicado.
- Settings copy ajustada: "Alertas locais do Command Center" + frase
  honesta sobre push em segundo plano ainda exigir backend.

### Checklist de QA manual

1. Buildar produção: `npm run build && npm run preview`.
2. Abrir `/app/settings`.
3. Confirmar Service Worker = Ativo.
4. Clicar em "Ativar notificações". Aceitar prompt do navegador.
5. Clicar em "Enviar notificação de teste". Confirmar que aparece com
   título "GoalSense" e corpo curto.
6. Ativar o toggle "Alertas locais do Command Center".
7. Ir para `/app/command` → aba Padrões.
8. Criar um radar simples (template ou personalizado) e ativar.
9. Quando um alerta real for registrado pelo Command Center, deve
   aparecer notificação:
   - Título: "GoalSense · Alerta detectado"
   - Body: "{padrão} em {mandante} x {visitante} · {confiança}%"
   - Click leva para `/app/alerts`.
10. Recarregar a página. O mesmo alerta NÃO dispara notificação de
    novo (dedup persistente).
11. Disparar 4+ alertas em sequência rápida. Apenas as 3 primeiras em
    60 s viram notificação (rate limit).
12. Abrir DevTools → Application → Local Storage. Conferir entradas
    `goalsense_notified_command_alerts` e
    `goalsense_notification_rate_limit`.
13. Settings → Limpar tudo do GoalSense → recarregar → confirmar que
    as duas chaves foram apagadas.

### Limites conhecidos

- **Funciona apenas com a aba/app aberta.** Em desktop pode aparecer
  com a janela minimizada, mas em mobile geralmente exige aba ativa.
- **Push em segundo plano ainda exige backend / Web Push / FCM**
  (registro do `pushManager`, VAPID, endpoint de envio). Estrutura
  atual do service worker em `public/sw.js` está pronta para receber
  handlers `push` e `notificationclick` sem reescrita.
- **Rate limit é por janela de 60 s.** Se realmente chegarem 5 alertas
  ao mesmo tempo, 2 ficam silenciados. O usuário ainda os vê em
  `/app/alerts` — só não há notificação para eles.
- **Dedup é por `alert.id`.** Se a mesma partida disparar dois padrões
  diferentes, ambos notificam (cada um tem id próprio). Esperado.

## V5.2 — Diagnóstico e histórico de notificações

### Como ler o painel de diagnóstico

`Settings → App e notificações → Diagnóstico` mostra o estado real
do canal de notificações locais:

- **Status geral** (badge superior):
  - `Pronto` — suporte + permissão concedida + toggle ligado.
  - `Precisa de permissão` — falta granted.
  - `Desligado` — toggle desligado.
  - `Não suportado` — Notification API ausente.
- **Bloqueadores** — itens em rosa que precisam ser resolvidos para
  o canal ficar pronto. Listados pela ordem dos guards (suporte →
  permissão → opt-in).
- **Avisos** — itens neutros que valem mesmo quando tudo está OK
  ("funciona apenas com o GoalSense aberto", "push em segundo
  plano exige backend").
- **Métricas reais**:
  - `Enviadas (7d)` — quantos `alert.id` distintos estão na dedup
    map dentro da janela de 7 dias.
  - `Última` — quando a última notificação foi disparada.
  - `Janela (60s)` — fires no rolling window vs limite (default 3).
  - `Mais antigo` — entrada mais antiga ainda dentro do TTL.

### Botões de limpeza

- **Limpar dedup** — remove a chave
  `goalsense_notified_command_alerts`. O mesmo `alert.id` pode voltar
  a notificar.
- **Limpar rate limit** — remove
  `goalsense_notification_rate_limit`. A próxima chamada passa pelo
  gate temporal imediatamente.
- **Limpar diagnóstico** — chamada umbrella: dedup + rate limit +
  histórico de eventos.
- **Limpar histórico** — remove apenas `goalsense_notification_events`.

### Histórico de eventos

Cada chamada ao bridge (incluindo o botão de teste) grava um evento
em `goalsense_notification_events` com o resultado real. A lista
compacta mostra:

- Badge do status (`Enviada`, `Duplicada`, `Rate limit`, `Sem permissão`,
  `Desligada`, `Não suportado`, `Inválida`, `Erro`).
- `matchLabel` quando disponível (ex: "Pressão por gol em LAFC x
  Seattle"). Se não houver, mostra a descrição padrão do status.
- Tempo relativo ("agora", "5 min", "2 h", "3 d").

Histórico é local por navegador. `clearAllGoalSense()` apaga junto com
o resto pelo prefixo `goalsense_`.

### Significado dos status

| Status | Significado |
|---|---|
| `sent` | Notificação local foi disparada via `new Notification(...)`. Entrega final ainda depende do SO/browser. |
| `test_sent` / `test_failed` | Resultado do botão "Enviar notificação de teste" em Settings. |
| `disabled` | Toggle "Alertas locais do Command Center" está desligado. |
| `permission_not_granted` | Permission ≠ granted (default ou denied). |
| `unsupported` | Browser sem `window.Notification`. |
| `invalid_alert` | Alerta sem `id` válido — chamada de fora do contrato. |
| `duplicate` | Esse `alert.id` já notificou nos últimos 7 dias. |
| `rate_limited` | Já houve 3 notificações na janela de 60s. |
| `error` | `showLocalNotification` retornou `false` (browser policy, focus assist, etc.). |

### Checklist V5.2

1. Build prod: `npm run build && npm run preview`.
2. Abrir `/app/settings` → seção "App e notificações".
3. Confirmar painel "Diagnóstico" com badge correto.
4. Antes de ativar permissão: bloqueador "A permissão de notificações
   ainda não foi concedida.".
5. Ativar permissão → bloqueador some, badge vira `Desligado`.
6. Ativar toggle "Alertas locais do Command Center" → badge vira `Pronto`.
7. Clicar "Enviar notificação de teste" → evento `test_sent` aparece
   no histórico, métrica `Enviadas (7d)` = 1.
8. Ir para `/app/command`, aguardar alerta real → evento `sent` aparece.
9. Recarregar a página → mesmo alerta NÃO notifica de novo, evento
   `duplicate` aparece se outra renderização tentar.
10. Disparar 4+ alertas em sequência rápida → 4º+ aparecem como
    `rate_limited`.
11. Clicar "Limpar rate limit" → métrica `Janela (60s)` zera.
12. Clicar "Limpar dedup" → mesmo `alert.id` pode notificar de novo.
13. Clicar "Limpar diagnóstico" → métricas e histórico zeram.
