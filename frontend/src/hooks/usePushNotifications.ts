import { useCallback, useEffect, useState } from 'react';
import { fetchVapidPublicKey, subscribePush, unsubscribePush } from '../api/notifications';

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const BLOCKED_PERMISSION_MESSAGE =
  'Notificacoes bloqueadas nas configuracoes deste site. Altere a permissao no navegador e tente novamente.';

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>(() =>
    isSupported() ? (Notification.permission as PushPermissionState) : 'unsupported'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupported()) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => setSubscribed(false));
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported()) {
      setError('Este navegador não suporta notificações push.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (Notification.permission === 'denied') {
        setPermission('denied');
        setError(BLOCKED_PERMISSION_MESSAGE);
        return;
      }

      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== 'granted') {
        if (result === 'denied') {
          setError(BLOCKED_PERMISSION_MESSAGE);
        }
        return;
      }

      const publicKey = await fetchVapidPublicKey();
      if (!publicKey) {
        setError('Notificacoes push nao estao configuradas no servidor.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      await subscribePush(subscription.toJSON() as PushSubscriptionJSON);
      setSubscribed(true);
    } catch {
      setError('Não foi possível ativar as notificações. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!isSupported()) return;
    setLoading(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError('Não foi possível desativar as notificações. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { permission, subscribed, loading, error, subscribe, unsubscribe };
}
