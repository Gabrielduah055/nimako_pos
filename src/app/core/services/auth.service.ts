import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, catchError, map, switchMap, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/cart-item.model';
import { ElectronService } from './electron.service';

// Matches exactly what the backend returns at POST /api/auth/login
interface BackendLoginResponse {
  success: boolean;
  message: string;
    data: {
    token: string;
    user: {
      id?: string;
      _id?: string;
      name: string;
      email: string;
      role: 'cashier' | 'admin';
    };
  };
}

// Normalised shape stored in localStorage and used throughout the app
export interface StoredUser {
  _id: string;
  name: string;
  email: string;
  role: 'cashier' | 'admin';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'pos_token';
  private readonly USER_KEY = 'pos_user';
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private router: Router, private electron: ElectronService) {}

  login(email: string, password: string): Observable<StoredUser> {
    if (this.electron.isElectron && !navigator.onLine) {
      return this.loginOffline(email, password);
    }

    return this.http
      .post<BackendLoginResponse>(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(
        switchMap((res: BackendLoginResponse) => {
          const storedUser = this.persistLoginResponse(res);
          if (!this.electron.isElectron) return of(storedUser);

          return this.electron.saveCashierProfile({
            id: storedUser._id,
            name: storedUser.name,
            email: storedUser.email,
            role: storedUser.role,
          }).pipe(
            switchMap(() => this.electron.bootstrapSync(this.getToken() ?? undefined)),
            map(() => storedUser),
            catchError(() => of(storedUser))
          );
        }),
        catchError(err => {
          if (this.electron.isElectron && this.looksOffline(err)) {
            return this.loginOffline(email, password);
          }
          return throwError(() => err);
        })
      );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUser(): StoredUser | null {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isCashier(): boolean {
    const user = this.getUser();
    return user?.role === 'cashier' || user?.role === 'admin';
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<any>(`${this.apiUrl}/auth/me`).pipe(
      map(res => res?.data || res)
    );
  }

  private loginOffline(email: string, pin: string): Observable<StoredUser> {
    return this.electron.verifyCashierPin(email.trim(), pin).pipe(
      map(cashier => {
        if (!cashier) {
          throw new Error('Offline login failed. Login online first, then set a local offline PIN.');
        }

        const storedUser: StoredUser = {
          _id: cashier.id,
          name: cashier.name,
          email: cashier.email,
          role: cashier.role,
        };

        localStorage.setItem(this.TOKEN_KEY, 'offline-local-session');
        localStorage.setItem(this.USER_KEY, JSON.stringify(storedUser));
        return storedUser;
      })
    );
  }

  private persistLoginResponse(res: BackendLoginResponse): StoredUser {
    if (!res.success || !res.data) {
      throw new Error(res.message || 'Login failed.');
    }

    const { token, user } = res.data;
    const userId = user.id ?? user._id;
    if (!userId) {
      throw new Error('Login response did not include a cashier ID.');
    }

    const storedUser: StoredUser = {
      _id: String(userId),
      name: user.name,
      email: user.email,
      role: user.role,
    };
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(storedUser));
    return storedUser;
  }

  private looksOffline(err: any): boolean {
    return !navigator.onLine || err?.status === 0;
  }
}
