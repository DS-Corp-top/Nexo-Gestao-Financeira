import api from './client';

export async function fetchVapidPublicKey(): Promise<string> {
  const { data } = await api.get<{ public_key: string }>('/push/vapid-public-key/');
  return data.public_key;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post('/push/subscribe/', {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    user_agent: navigator.userAgent,
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await api.post('/push/unsubscribe/', { endpoint });
}
