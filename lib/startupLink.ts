import * as ExpoLinking from 'expo-linking';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

/** A route and its parameters as one comparable string. */
function routeKey(path: string, params: Record<string, unknown>): string {
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return `/${path.replace(/^\/+/, '')}?${query}`;
}

/**
 * Opens a link that arrived while the app was starting, if Expo Router
 * missed it. A link sent to the starting app (over adb right after an
 * install, when Android relaunches the app on its last page) arrives as a
 * "url" event that can come before Expo Router listens for them, after it
 * has read the starting link. MainActivity keeps the newest link as its
 * own (plugins/withLatestIntent.js), so a moment after startup this opens
 * it, unless the person has already moved on from the first page.
 */
export function useLinkFromStartup() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const here = routeKey(pathname, params);
  const first = useRef(here);
  const latest = useRef(here);
  latest.current = here;

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (latest.current !== first.current) return;
      const url = await Linking.getInitialURL();
      if (!url) return;
      const { path, queryParams } = ExpoLinking.parse(url);
      if (path === null) return;
      if (routeKey(path, queryParams ?? {}) === latest.current) return;
      const query = new URLSearchParams(queryParams as Record<string, string>).toString();
      router.replace(`/${path}${query ? `?${query}` : ''}` as never);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
}
