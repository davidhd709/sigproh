import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** Evento no estándar que Chromium emite cuando la app se puede instalar. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'sigproh.install-dismissed';

/**
 * Comportamiento de aplicación instalable: aviso de instalación,
 * aviso de nueva versión y estado de conexión.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly isStandalone = signal(this.detectStandalone());
  readonly isOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly updateReady = signal(false);
  private readonly installAvailable = signal(false);
  private readonly installDismissed = signal(this.readDismissed());

  /** iOS no emite beforeinstallprompt: se muestran instrucciones manuales. */
  readonly isIos = /iphone|ipad|ipod/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  readonly showInstallBanner = computed(
    () =>
      !this.isStandalone() &&
      !this.installDismissed() &&
      (this.installAvailable() || this.isIos),
  );

  constructor() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.installAvailable.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.installAvailable.set(false);
      this.isStandalone.set(true);
    });
    window.addEventListener('online', () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));

    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.updateReady.set(true));
    }
  }

  get canPromptInstall(): boolean {
    return this.deferredPrompt !== null;
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) return;
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.installAvailable.set(false);
    if (outcome === 'dismissed') this.dismissInstall();
  }

  dismissInstall(): void {
    this.installDismissed.set(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Almacenamiento no disponible (modo privado): el aviso solo se oculta en esta sesión
    }
  }

  async applyUpdate(): Promise<void> {
    await this.swUpdate?.activateUpdate();
    document.location.reload();
  }

  private detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}
