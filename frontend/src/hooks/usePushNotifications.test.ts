import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from './usePushNotifications';

const notificationsApiMock = vi.hoisted(() => ({
  fetchVapidPublicKey: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}));

vi.mock('../api/notifications', () => notificationsApiMock);

function installBrowserSupport(overrides?: {
  existingSubscription?: any;
  newSubscription?: any;
}) {
  const existingSubscription = overrides?.existingSubscription ?? null;
  const newSubscription = overrides?.newSubscription ?? {
    endpoint: 'https://fcm.googleapis.com/fcm/send/new',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };

  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existingSubscription),
    subscribe: vi.fn().mockResolvedValue(newSubscription),
  };
  const registration = { pushManager };

  (navigator as any).serviceWorker = { ready: Promise.resolve(registration) };
  (window as any).PushManager = function PushManager() {};
  (globalThis as any).Notification = {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  };

  return { pushManager, registration, newSubscription };
}

function removeBrowserSupport() {
  delete (navigator as any).serviceWorker;
  delete (window as any).PushManager;
  delete (globalThis as any).Notification;
}

describe('usePushNotifications', () => {
  beforeEach(() => {
    notificationsApiMock.fetchVapidPublicKey.mockReset().mockResolvedValue('QUJD');
    notificationsApiMock.subscribePush.mockReset().mockResolvedValue(undefined);
    notificationsApiMock.unsubscribePush.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    removeBrowserSupport();
  });

  it('reports unsupported when the browser lacks Push API support', () => {
    removeBrowserSupport();
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.permission).toBe('unsupported');
  });

  it('does not call the service worker APIs when unsupported', async () => {
    removeBrowserSupport();
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.error).toBeTruthy();
    expect(notificationsApiMock.fetchVapidPublicKey).not.toHaveBeenCalled();
  });

  it('detects an already-active subscription on mount', async () => {
    installBrowserSupport({ existingSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/existing' } });
    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.subscribed).toBe(true));
  });

  it('subscribes: requests permission, subscribes the browser and registers with the backend', async () => {
    const { pushManager, newSubscription } = installBrowserSupport();
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.subscribe();
    });

    expect((globalThis as any).Notification.requestPermission).toHaveBeenCalled();
    expect(notificationsApiMock.fetchVapidPublicKey).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    expect(notificationsApiMock.subscribePush).toHaveBeenCalledWith(newSubscription.toJSON());
    expect(result.current.subscribed).toBe(true);
    expect(result.current.permission).toBe('granted');
  });

  it('does not subscribe when the user denies permission', async () => {
    installBrowserSupport();
    (globalThis as any).Notification.requestPermission = vi.fn().mockResolvedValue('denied');
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(notificationsApiMock.fetchVapidPublicKey).not.toHaveBeenCalled();
    expect(result.current.subscribed).toBe(false);
    expect(result.current.permission).toBe('denied');
  });

  it('unsubscribes: removes the backend registration and cancels the browser subscription', async () => {
    const existingSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/existing',
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    installBrowserSupport({ existingSubscription });
    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.subscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(notificationsApiMock.unsubscribePush).toHaveBeenCalledWith(existingSubscription.endpoint);
    expect(existingSubscription.unsubscribe).toHaveBeenCalled();
    expect(result.current.subscribed).toBe(false);
  });
});
