type EventData = Record<string, string>;

interface Umami {
  track(name: string): void;
  identify(id: string, data: EventData): void;
}

declare global {
  interface Window {
    umami?: Umami;
  }
}

let umami: Umami | undefined;
let disabled = false;
let queue: Array<(umami: Umami) => void> = [];

function disable(reason: string) {
  console.error(`Umami analytics is off for this session: ${reason}`);
  disabled = true;
}

function run(call: (umami: Umami) => void) {
  if (disabled) return;
  if (umami) call(umami);
  else queue.push(call);
}

export function initUmami(url: string | undefined, websiteId: string | undefined) {
  if (!url || !websiteId) {
    disabled = true;
    return;
  }
  const script = document.createElement('script');
  script.src = `${url}/script.js`;
  script.dataset.websiteId = websiteId;
  script.onerror = () => disable(`${script.src} did not load`);
  script.onload = () => {
    const loaded = window.umami;
    if (!loaded) return disable(`${script.src} did not define window.umami`);
    umami = loaded;
    queue.forEach((call) => call(loaded));
    queue = [];
  };
  document.head.appendChild(script);
}

export function track(name: string) {
  run((u) => u.track(name));
}

export function identify(id: string, data: EventData) {
  run((u) => u.identify(id, data));
}
