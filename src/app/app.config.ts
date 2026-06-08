import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HashLocationStrategy, LocationStrategy, PathLocationStrategy, PlatformLocation } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

const locationStrategyFactory = (platformLocation: PlatformLocation): LocationStrategy => {
  return (window as any).electronAPI
    ? new HashLocationStrategy(platformLocation)
    : new PathLocationStrategy(platformLocation);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: LocationStrategy,
      useFactory: locationStrategyFactory,
      deps: [PlatformLocation],
    },
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
